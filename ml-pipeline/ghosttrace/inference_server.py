from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
import json
import os
import uvicorn
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv("../.env")

# Import from existing files
import sys

sys.path.append(os.path.dirname(__file__))
from graph_encoder import GhostTraceGNN, GraphDataset, graph_to_data, NUM_NODE_FEATURES


class NodeData(BaseModel):
    label: str
    type: str
    processingPowerMs: Optional[float] = 100
    failureRatePercent: Optional[float] = 5
    coldStartLatencyMs: Optional[float] = 200


class Node(BaseModel):
    id: str
    data: NodeData


class Edge(BaseModel):
    id: str
    source: str
    target: str
    latencyMs: Optional[float] = 50
    packetLossPercent: Optional[float] = 1
    bandwidthLimitMbps: Optional[float] = 100


class InferenceRequest(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


class InferenceResponse(BaseModel):
    predictedClass: str
    confidence: float
    classProbabilities: dict
    topologyEmbedding: List[float]
    inferenceTimeMs: float


app = FastAPI(title="GhostTrace Inference Server")

CLASSES = ["stable", "unstable"]

# Load model once at startup
model = None
classifier_head = None


@app.on_event("startup")
async def load_model() -> None:
    global model
    global classifier_head

    model_path = os.path.join(os.path.dirname(__file__), "ghosttrace_gnn_best.pt")
    fallback_path = os.path.join(os.path.dirname(__file__), "ghosttrace_gnn.pt")

    if not os.path.exists(model_path) and not os.path.exists(fallback_path):
        raise RuntimeError(f"Model not found at {model_path} or {fallback_path}")

    chosen_path = model_path if os.path.exists(model_path) else fallback_path

    encoder = GhostTraceGNN()
    head = torch.nn.Sequential(
        torch.nn.Linear(128, 64),
        torch.nn.BatchNorm1d(64),
        torch.nn.ELU(),
        torch.nn.Dropout(p=0.3),
        torch.nn.Linear(64, 32),
        torch.nn.BatchNorm1d(32),
        torch.nn.ELU(),
        torch.nn.Dropout(p=0.2),
        torch.nn.Linear(32, len(CLASSES)),
    )

    state = torch.load(chosen_path, map_location="cpu")

    if isinstance(state, dict) and "encoder_state_dict" in state and "classifier_state_dict" in state:
        encoder.load_state_dict(state["encoder_state_dict"])
        head.load_state_dict(state["classifier_state_dict"])
    elif isinstance(state, dict) and any(key.startswith("encoder.") for key in state.keys()):
        encoder_state = {
            key.replace("encoder.", "", 1): value
            for key, value in state.items()
            if key.startswith("encoder.")
        }
        head_state = {
            key.replace("head.", "", 1): value
            for key, value in state.items()
            if key.startswith("head.")
        }
        encoder.load_state_dict(encoder_state)
        if head_state:
            head.load_state_dict(head_state)
        else:
            raise RuntimeError("Checkpoint does not include classifier head weights")
    else:
        raise RuntimeError("Unsupported checkpoint format for GhostTrace model")

    encoder.eval()
    head.eval()
    model = encoder
    classifier_head = head
    print(f"[GhostTrace] Model loaded from {chosen_path}")

    # Sanity check: run inference on a known thundering_herd topology
    # and verify it predicts unstable with >80% confidence
    test_request = InferenceRequest(
        nodes=[
            Node(id="1", data=NodeData(label="API Gateway", type="Gateway", processingPowerMs=100, failureRatePercent=5, coldStartLatencyMs=0)),
            Node(id="2", data=NodeData(label="Service A", type="Service", processingPowerMs=150, failureRatePercent=8, coldStartLatencyMs=0)),
            Node(id="3", data=NodeData(label="Service B", type="Service", processingPowerMs=150, failureRatePercent=8, coldStartLatencyMs=0)),
            Node(id="4", data=NodeData(label="Service C", type="Service", processingPowerMs=150, failureRatePercent=8, coldStartLatencyMs=0)),
            Node(id="5", data=NodeData(label="Service D", type="Service", processingPowerMs=150, failureRatePercent=8, coldStartLatencyMs=0)),
            Node(id="6", data=NodeData(label="Service E", type="Service", processingPowerMs=150, failureRatePercent=8, coldStartLatencyMs=0)),
        ],
        edges=[
            Edge(id="e1", source="1", target="2", latencyMs=50, packetLossPercent=1),
            Edge(id="e2", source="1", target="3", latencyMs=50, packetLossPercent=1),
            Edge(id="e3", source="1", target="4", latencyMs=50, packetLossPercent=1),
            Edge(id="e4", source="1", target="5", latencyMs=50, packetLossPercent=1),
            Edge(id="e5", source="1", target="6", latencyMs=50, packetLossPercent=1),
        ],
    )
    test_data = request_to_pyg(test_request)
    with torch.no_grad():
        graph_embedding = model(test_data)
        logits = classifier_head(graph_embedding)
        probs = torch.softmax(logits / 1.5, dim=1)
        pred = probs.argmax(dim=1).item()
        conf = probs[0][pred].item()
    CLASSES_LOCAL = ['stable', 'unstable']
    print(f"[GhostTrace] Sanity check: {CLASSES_LOCAL[pred]} ({conf*100:.1f}% confidence)")
    if CLASSES_LOCAL[pred] != 'unstable' or conf < 0.80:
        print('[GhostTrace] WARNING: Sanity check FAILED')
        print(f"[GhostTrace] Expected unstable >80%, got {CLASSES_LOCAL[pred]} {conf*100:.1f}%")
    else:
        print('[GhostTrace] Sanity check PASSED')


def request_to_pyg(request: InferenceRequest):
    """Convert inference request to PyG Data using graph_encoder.graph_to_data for consistency."""
    from torch_geometric.data import Data as PyGData

    # Convert pydantic models to the dict format expected by graph_to_data
    graph_dict = {
        "nodes": [
            {
                "id": n.id,
                "data": {
                    "label": n.data.label,
                    "type": n.data.type,
                    "processingPowerMs": n.data.processingPowerMs,
                    "failureRatePercent": n.data.failureRatePercent,
                    "coldStartLatencyMs": n.data.coldStartLatencyMs,
                },
            }
            for n in request.nodes
        ],
        "edges": [
            {
                "id": e.id,
                "source": e.source,
                "target": e.target,
                "latencyMs": e.latencyMs,
                "packetLossPercent": e.packetLossPercent,
                "bandwidthLimitMbps": e.bandwidthLimitMbps,
            }
            for e in request.edges
        ],
        "label": "stable",  # placeholder, not used for inference
    }

    data = graph_to_data(graph_dict)
    data.batch = torch.zeros(data.x.size(0), dtype=torch.long)
    return data


@app.post("/predict", response_model=InferenceResponse)
async def predict(request: InferenceRequest):
    if model is None or classifier_head is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(request.nodes) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 nodes")

    import time

    start = time.time()

    data = request_to_pyg(request)

    with torch.no_grad():
        graph_embedding = model(data)
        logits = classifier_head(graph_embedding)

        # Temperature scaling for calibration
        temperature = 1.5
        probs = torch.softmax(logits / temperature, dim=1)
        pred_idx = probs.argmax(dim=1).item()
        confidence = probs[0][pred_idx].item()

    inference_time = (time.time() - start) * 1000

    class_probs = {CLASSES[i]: round(probs[0][i].item(), 4) for i in range(2)}

    # Get 128-dim topology embedding from pooled encoder output.
    with torch.no_grad():
        topology_embedding = graph_embedding[0].tolist()

    return InferenceResponse(
        predictedClass=CLASSES[pred_idx],
        confidence=round(confidence, 4),
        classProbabilities=class_probs,
        topologyEmbedding=topology_embedding,
        inferenceTimeMs=round(inference_time, 2),
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "classes": CLASSES,
    }


if __name__ == "__main__":
    port = int(os.getenv("INFERENCE_SERVER_PORT", "8001"))
    print(f"[GhostTrace] Starting inference server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
