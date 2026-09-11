"""GhostTrace inference server -- architecture grading for the InfraZero canvas.

Serves the GNN trained on Alibaba production microservice traces
(`ml-pipeline/microservices/`). Two kinds of graph arrive here and both are
treated identically:

  * a topology drawn by hand on the React Flow canvas;
  * a topology recovered from an uploaded architecture diagram by the vision
    importer (`POST /api/ai/analyse-image`).

Both are encoded by `microservices.features.encode_canvas_graph` -- the exact
function the training set was built with -- so the canvas cannot silently drift
away from the representation the model learned.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Make the sibling `microservices` package importable when this file is run
# directly (`python inference_server.py`) rather than as a module.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from microservices.config import (  # noqa: E402
    CLASSES,
    CLASS_TO_LETTER,
    MODEL_PATH,
    SUPERVISED_MODEL_ROLES,
)
from microservices.features import (  # noqa: E402
    encode_canvas_graph,
    role_from_ui_type,
    to_model_role,
)
from microservices.model import ArchitectureGrader  # noqa: E402
from microservices.recommend import recommend  # noqa: E402

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:  # python-dotenv is optional
    pass


# --------------------------------------------------------------------------- #
# Request / response contracts
# --------------------------------------------------------------------------- #


class NodeData(BaseModel):
    label: str = ""
    type: str = ""
    # Retained for backwards compatibility with existing callers. The grader is
    # deliberately topology-only, so these are accepted and ignored -- a diagram
    # imported from an image has no such numbers, and the canvas and the image
    # path must grade identically.
    processingPowerMs: Optional[float] = None
    failureRatePercent: Optional[float] = None
    coldStartLatencyMs: Optional[float] = None


class Node(BaseModel):
    id: str
    data: NodeData = NodeData()
    type: Optional[str] = None


class Edge(BaseModel):
    id: Optional[str] = None
    source: str
    target: str
    rpctype: Optional[str] = None
    latencyMs: Optional[float] = None
    packetLossPercent: Optional[float] = None
    bandwidthLimitMbps: Optional[float] = None


class InferenceRequest(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


class NodeRole(BaseModel):
    id: str
    label: str
    role: str
    isSinglePointOfFailure: bool
    blastRadius: float


class Recommendation(BaseModel):
    """One concrete change, attached to specific nodes.

    `improvement` is the drop in the model's own expected risk when the change
    is applied to a real copy of the graph and re-scored -- not a rule's opinion
    of how serious the pattern is. An intervention the model does not believe in
    scores near zero and never reaches the response.
    """

    kind: str
    summary: str
    detail: str
    targetNodes: List[str]
    riskBefore: float
    riskAfter: float
    improvement: float
    gradeBefore: str
    gradeAfter: str
    severity: str


class TrainingCoverage(BaseModel):
    """How much of this graph the grading head has calibrated experience of.

    `fraction` is the share of nodes whose role appears in the supervised
    training set. A diagram made largely of batch tiers and load balancers
    scores low here, and its grade should be read as a weak signal rather than
    a verdict -- the encoder knows those roles from pretraining, but the
    classifier was fitted on call traces that cannot express them.
    """

    fraction: float
    untrainedNodeCount: int
    untrainedRoles: List[str]


class InferenceResponse(BaseModel):
    predictedClass: str
    grade: str
    confidence: float
    classProbabilities: Dict[str, float]
    topologyEmbedding: List[float]
    nodeRoles: List[NodeRole]
    recommendations: List[Recommendation] = []
    trainingCoverage: Optional[TrainingCoverage] = None
    inferenceTimeMs: float


app = FastAPI(title="GhostTrace Architecture Grader")

_model: Optional[ArchitectureGrader] = None
_device = torch.device("cpu")
_metadata: Dict = {}


# --------------------------------------------------------------------------- #
# Encoding
# --------------------------------------------------------------------------- #


def request_to_batch(request: InferenceRequest):
    """Encode a canvas/vision request into a single-graph PyG batch."""

    from torch_geometric.data import Data

    nodes = [
        {"id": node.id, "data": {"label": node.data.label, "type": node.data.type or (node.type or "")}}
        for node in request.nodes
    ]
    edges = [
        {"source": edge.source, "target": edge.target, "rpctype": edge.rpctype}
        for edge in request.edges
    ]

    node_features, edge_index, edge_features, graph_features = encode_canvas_graph(nodes, edges)

    data = Data(
        x=torch.from_numpy(node_features),
        edge_index=torch.from_numpy(edge_index),
        edge_attr=torch.from_numpy(edge_features),
    )
    data.graph_features = torch.from_numpy(graph_features).view(1, -1)
    data.batch = torch.zeros(data.x.size(0), dtype=torch.long)
    return data, node_features


@app.on_event("startup")
async def load_model() -> None:
    global _model, _metadata

    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"No trained model at {MODEL_PATH}. "
            "Run `python -m microservices.train` from ml-pipeline/ first."
        )

    checkpoint = torch.load(MODEL_PATH, map_location=_device, weights_only=False)
    architecture = checkpoint.get("architecture", {})
    model = ArchitectureGrader(
        num_classes=len(CLASSES),
        hidden_dim=architecture.get("hidden_dim", 96),
        num_layers=architecture.get("num_layers", 3),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    _model = model
    _metadata = {
        "classes": checkpoint.get("classes", CLASSES),
        "hyperparameters": checkpoint.get("hyperparameters", {}),
        "architecture": architecture,
    }
    print(f"[GhostTrace] Loaded architecture grader from {MODEL_PATH}")
    print(f"[GhostTrace] Classes: {CLASSES}")

    _startup_sanity_check()


def _startup_sanity_check() -> None:
    """Grade two textbook topologies and report whether the ordering holds.

    A wide unguarded fan-out onto one shared database should not grade safer
    than a small cached read path. This does not assert -- a single pair of
    hand-made graphs is not a test set, and the real numbers come from
    `microservices/evaluate.py` -- but a flipped ordering here is worth seeing
    in the log at startup.
    """

    fragile = InferenceRequest(
        nodes=[Node(id="gw", data=NodeData(label="API Gateway", type="Gateway"))]
        + [Node(id=f"s{i}", data=NodeData(label=f"Service {i}", type="Service")) for i in range(8)]
        + [Node(id="db", data=NodeData(label="Primary DB", type="PostgreSQL"))],
        edges=[Edge(source="gw", target=f"s{i}") for i in range(8)]
        + [Edge(source=f"s{i}", target="db") for i in range(8)],
    )
    simple = InferenceRequest(
        nodes=[
            Node(id="gw", data=NodeData(label="API Gateway", type="Gateway")),
            Node(id="s0", data=NodeData(label="Read Service", type="Service")),
            Node(id="c0", data=NodeData(label="Redis", type="Cache")),
        ],
        edges=[Edge(source="gw", target="s0"), Edge(source="s0", target="c0")],
    )

    try:
        fragile_result = _grade(fragile)
        simple_result = _grade(simple)
    except Exception as error:  # noqa: BLE001 -- diagnostic only
        print(f"[GhostTrace] Sanity check could not run: {error}")
        return

    fragile_risk = fragile_result["risk_index"]
    simple_risk = simple_result["risk_index"]
    print(
        f"[GhostTrace] Sanity: 8-way fan-out onto one DB -> {fragile_result['predictedClass']}"
        f" ({fragile_result['confidence']:.0%}); cached read path -> "
        f"{simple_result['predictedClass']} ({simple_result['confidence']:.0%})"
    )
    if fragile_risk >= simple_risk:
        print("[GhostTrace] Sanity check PASSED (fan-out graded at least as risky)")
    else:
        print("[GhostTrace] Sanity check NOTE: fan-out graded safer than the simple path")


def _grade(request: InferenceRequest) -> Dict:
    """Run the model over one request and assemble the response payload."""

    if _model is None:
        raise RuntimeError("Model not loaded")

    started = time.perf_counter()
    data, node_features = request_to_batch(request)

    with torch.no_grad():
        embedding = _model.embed(data)
        logits = _model.head(
            torch.cat([embedding, _model.graph_feature_norm(data.graph_features)], dim=1)
        )
        probabilities = torch.softmax(logits, dim=1)[0]

    predicted_index = int(probabilities.argmax().item())
    predicted_class = CLASSES[predicted_index]

    # Expected risk position on the low<medium<high scale, used to order two
    # topologies against each other rather than just naming a class.
    risk_index = float(sum(i * float(probabilities[i]) for i in range(len(CLASSES))))

    # Node feature layout: roles occupy the first NUM_ROLES columns, then the
    # topology block -- index 11 is the articulation flag, 9 the blast radius.
    from microservices.config import NUM_ROLES

    node_roles: List[NodeRole] = []
    for position, node in enumerate(request.nodes):
        if position >= node_features.shape[0]:
            break
        node_roles.append(
            NodeRole(
                id=node.id,
                label=node.data.label or node.id,
                role=role_from_ui_type({"data": {"label": node.data.label, "type": node.data.type}}),
                isSinglePointOfFailure=bool(node_features[position, NUM_ROLES + 11] == 1.0),
                blastRadius=round(float(node_features[position, NUM_ROLES + 9]), 4),
            )
        )

    # Node-level fixes, ranked by the risk the model predicts each one removes.
    # Every candidate is applied to a real copy of the graph and re-scored, so
    # this costs one forward pass per candidate -- bounded inside recommend().
    canvas_nodes = [
        {"id": node.id, "data": {"label": node.data.label, "type": node.data.type}}
        for node in request.nodes
    ]
    canvas_edges = [{"source": edge.source, "target": edge.target} for edge in request.edges]
    try:
        recommendations = [item.to_dict() for item in recommend(_model, canvas_nodes, canvas_edges)]
    except Exception:  # noqa: BLE001 - a grade is still useful without advice
        recommendations = []

    # How much of this diagram is made of roles the grading head never saw a
    # labelled example of. Alibaba call traces cannot express a load balancer, a
    # batch tier or an async worker, so a diagram full of them is being graded
    # partly outside the head's calibrated range -- which is exactly the case
    # for the architecture diagrams this product exists to grade. Reporting it
    # lets the report caveat a hedge instead of presenting it as a verdict.
    untrained = [
        item.role for item in node_roles
        if to_model_role(item.role) not in SUPERVISED_MODEL_ROLES
    ]
    coverage = 1.0 - (len(untrained) / max(len(node_roles), 1))

    return {
        "predictedClass": predicted_class,
        "grade": CLASS_TO_LETTER.get(predicted_class, "C"),
        "confidence": round(float(probabilities[predicted_index]), 4),
        "classProbabilities": {
            name: round(float(probabilities[index]), 4) for index, name in enumerate(CLASSES)
        },
        "topologyEmbedding": [round(float(v), 6) for v in embedding[0].tolist()],
        "nodeRoles": node_roles,
        "recommendations": recommendations,
        "trainingCoverage": {
            "fraction": round(coverage, 4),
            "untrainedNodeCount": len(untrained),
            "untrainedRoles": sorted(set(untrained)),
        },
        "risk_index": risk_index,
        "inferenceTimeMs": round((time.perf_counter() - started) * 1000, 2),
    }


@app.post("/predict", response_model=InferenceResponse)
async def predict(request: InferenceRequest) -> InferenceResponse:
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if len(request.nodes) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 nodes to grade a topology")

    try:
        result = _grade(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    result.pop("risk_index", None)
    return InferenceResponse(**result)


@app.get("/health")
async def health() -> Dict:
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "classes": CLASSES,
        "grades": CLASS_TO_LETTER,
        "metadata": _metadata,
    }


if __name__ == "__main__":
    port = int(os.getenv("INFERENCE_SERVER_PORT", "8001"))
    print(f"[GhostTrace] Starting architecture grader on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
