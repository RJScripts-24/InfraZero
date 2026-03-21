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
from graph_encoder import GhostTraceGNN, GraphDataset


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

CLASSES = ["cascading_failure", "thundering_herd", "retry_storm", "stable"]

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
        torch.nn.Linear(64, 32),
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
    # and verify it predicts thundering_herd with >80% confidence
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
    CLASSES_LOCAL = ['cascading_failure', 'thundering_herd', 'retry_storm', 'stable']
    print(f"[GhostTrace] Sanity check: {CLASSES_LOCAL[pred]} ({conf*100:.1f}% confidence)")
    if CLASSES_LOCAL[pred] != 'thundering_herd' or conf < 0.80:
        print("[GhostTrace] WARNING: Sanity check FAILED - feature mismatch may still exist")
        print(f"[GhostTrace] Expected thundering_herd >80%, got {CLASSES_LOCAL[pred]} {conf*100:.1f}%")
    else:
        print("[GhostTrace] Sanity check PASSED - features aligned correctly")


def request_to_pyg(request: InferenceRequest):
    from torch_geometric.data import Data

    nodes = request.nodes
    edges = request.edges

    node_id_to_idx = {n.id: i for i, n in enumerate(nodes)}

    # Build degree maps exactly matching build_degree_maps() in graph_encoder.py
    in_degree = {n.id: 0 for n in nodes}
    out_degree = {n.id: 0 for n in nodes}

    valid_edges = []
    for e in edges:
        src = e.source
        tgt = e.target
        if src in node_id_to_idx and tgt in node_id_to_idx:
            out_degree[src] += 1
            in_degree[tgt] += 1
            valid_edges.append(e)

    x = []
    for n in nodes:
        incoming = in_degree[n.id]
        outgoing = out_degree[n.id]
        fan_out = outgoing

        # EXACT match to graph_encoder.py is_spof logic:
        # is_spof marks leaf nodes (nodes that receive exactly one
        # connection and have no outgoing edges — dead ends)
        is_spof = 1.0 if incoming == 1 and outgoing == 0 else 0.0

        # EXACT match to graph_encoder.py default values:
        # processingPowerMs default = 100.0
        # coldStartLatencyMs default = 0.0  (NOT 200 — this was the bug)
        # failureRatePercent default = 0.0
        processing = (n.data.processingPowerMs if n.data.processingPowerMs is not None else 100.0) / 1000.0
        cold_start = (n.data.coldStartLatencyMs if n.data.coldStartLatencyMs is not None else 0.0) / 1000.0
        failure_rate = (n.data.failureRatePercent if n.data.failureRatePercent is not None else 0.0) / 100.0

        # Node type encoding - exactly mirrors encode_node_type()
        # and NODE_TYPE_TO_ID from graph_encoder.py
        # Infrastructure, Edge Network, Background Job all -> 0
        # DO NOT map them to 6, 7, or any other value
        raw_type = (n.data.type or '').lower().strip()

        if raw_type in ('gateway',):
            type_id = 1
        elif raw_type in ('postgresql',):
            type_id = 2
        elif raw_type in ('cache',):
            type_id = 3
        elif raw_type in ('rabbitmq',):
            type_id = 4
        elif raw_type in ('service',):
            type_id = 5
        elif 'gateway' in raw_type:
            type_id = 1
        elif 'postgres' in raw_type:
            type_id = 2
        elif 'cache' in raw_type:
            type_id = 3
        elif 'rabbit' in raw_type or 'queue' in raw_type:
            type_id = 4
        elif 'service' in raw_type:
            type_id = 5
        else:
            type_id = 0  # Infrastructure, Edge Network, Background Job, unknown

        features = [
            min(processing, 1.0),
            min(cold_start, 1.0),
            min(failure_rate, 1.0),
            incoming / 10.0,
            outgoing / 10.0,
            fan_out / 8.0,
            is_spof,
            type_id / 10.0,
        ]
        x.append(features)

    # Build edge index from valid edges only
    edge_index = []
    for e in valid_edges:
        edge_index.append([node_id_to_idx[e.source], node_id_to_idx[e.target]])

    # Handle graphs with no valid edges
    if not edge_index:
        edge_index = [[0, 0]]

    x_tensor = torch.tensor(x, dtype=torch.float32)
    edge_tensor = torch.tensor(edge_index, dtype=torch.long).t().contiguous()
    batch = torch.zeros(len(nodes), dtype=torch.long)

    return Data(x=x_tensor, edge_index=edge_tensor, batch=batch)


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

    class_probs = {CLASSES[i]: round(probs[0][i].item(), 4) for i in range(4)}

    # Get 64-dim topology embedding from pooled encoder output.
    with torch.no_grad():
        from torch_geometric.nn import global_mean_pool, global_max_pool

        x = data.x
        # Forward through GATv2 layers only (not classifier)
        x1 = model.conv1(x, data.edge_index)
        x1 = torch.nn.functional.elu(x1)
        x1 = torch.nn.functional.dropout(x1, p=0.5, training=False)
        x2 = model.conv2(x1, data.edge_index)
        x2 = torch.nn.functional.elu(x2)
        x2 = torch.nn.functional.dropout(x2, p=0.5, training=False)
        x3 = model.conv3(x2, data.edge_index)
        graph_emb = torch.cat([global_mean_pool(x3, data.batch), global_max_pool(x3, data.batch)], dim=1)
        topology_embedding = graph_emb[0].tolist()

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
