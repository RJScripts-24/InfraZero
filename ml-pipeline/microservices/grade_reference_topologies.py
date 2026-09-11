"""Grade a set of textbook topologies and check the ordering makes sense.

The held-out test report in `evaluate.py` is the quantitative result. This is the
qualitative counterpart: it takes architectures whose reliability properties are
not in dispute -- a fan-out with no cache in front of a shared database, a
single-replica chain, a well-partitioned design -- and prints the grade the model
assigns each one.

It is a sanity check, not a benchmark. Ten hand-made graphs cannot measure
accuracy, and the ordering here should never be quoted as if they could. What it
*can* catch is a model that scores well on held-out traces yet grades an obvious
anti-pattern safer than a clean design -- which would mean the learned signal
does not survive the jump from Alibaba's topologies to the ones users draw.

Run:  python -m microservices.grade_reference_topologies
"""

from __future__ import annotations

import torch

from .config import CLASSES, CLASS_TO_LETTER, MODEL_PATH
from .features import encode_canvas_graph
from .model import ArchitectureGrader


def node(node_id: str, label: str, node_type: str):
    return {"id": node_id, "data": {"label": label, "type": node_type}}


def edge(source: str, target: str):
    return {"source": source, "target": target}


def _fan_out_shared_db(width: int):
    """Thundering herd: wide unguarded fan-out onto one shared database."""

    nodes = [node("gw", "API Gateway", "Gateway")]
    edges = []
    for i in range(width):
        nodes.append(node(f"s{i}", f"Service {i}", "Service"))
        edges.append(edge("gw", f"s{i}"))
        edges.append(edge(f"s{i}", "db"))
    nodes.append(node("db", "Shared Primary DB", "PostgreSQL"))
    return nodes, edges


def _cached_fan_out(width: int):
    """The same fan-out, but every service reads through a cache."""

    nodes = [node("gw", "API Gateway", "Gateway"), node("lb", "Load Balancer", "Infrastructure")]
    edges = [edge("lb", "gw")]
    for i in range(width):
        nodes.append(node(f"s{i}", f"Service {i}", "Service"))
        nodes.append(node(f"c{i}", f"Cache {i}", "Cache"))
        edges.append(edge("gw", f"s{i}"))
        edges.append(edge(f"s{i}", f"c{i}"))
    nodes.append(node("db", "Primary DB", "PostgreSQL"))
    edges.append(edge("s0", "db"))
    return nodes, edges


def _deep_chain(depth: int):
    """A long synchronous call chain -- latency accumulates, every hop a SPOF."""

    nodes = [node("gw", "API Gateway", "Gateway")]
    edges = []
    previous = "gw"
    for i in range(depth):
        nodes.append(node(f"s{i}", f"Service {i}", "Service"))
        edges.append(edge(previous, f"s{i}"))
        previous = f"s{i}"
    nodes.append(node("db", "DB", "PostgreSQL"))
    edges.append(edge(previous, "db"))
    return nodes, edges


def _event_driven():
    """Queue-decoupled writes: the classic fix for synchronous back-pressure."""

    nodes = [
        node("cdn", "CDN", "Edge Network"),
        node("lb", "Load Balancer", "Infrastructure"),
        node("gw", "API Gateway", "Gateway"),
        node("api", "Order API", "Service"),
        node("cache", "Redis", "Cache"),
        node("mq", "Event Bus", "RabbitMQ"),
        node("w1", "Fulfilment Worker", "Background Job"),
        node("w2", "Billing Worker", "Background Job"),
        node("db1", "Orders DB", "PostgreSQL"),
        node("db2", "Billing DB", "PostgreSQL"),
    ]
    edges = [
        edge("cdn", "lb"), edge("lb", "gw"), edge("gw", "api"),
        edge("api", "cache"), edge("api", "mq"),
        edge("mq", "w1"), edge("mq", "w2"),
        edge("w1", "db1"), edge("w2", "db2"),
    ]
    return nodes, edges


def _retry_loop():
    """A service cycle -- the structural shape of a retry storm."""

    nodes = [
        node("gw", "API Gateway", "Gateway"),
        node("a", "Service A", "Service"),
        node("b", "Service B", "Service"),
        node("c", "Service C", "Service"),
        node("db", "DB", "PostgreSQL"),
    ]
    edges = [
        edge("gw", "a"), edge("a", "b"), edge("b", "c"),
        edge("c", "a"),  # the cycle
        edge("c", "db"),
    ]
    return nodes, edges


def _minimal_read_path():
    """The simplest healthy shape: gateway -> service -> cache."""

    nodes = [
        node("gw", "API Gateway", "Gateway"),
        node("s", "Read Service", "Service"),
        node("c", "Redis", "Cache"),
    ]
    return nodes, [edge("gw", "s"), edge("s", "c")]


REFERENCE_TOPOLOGIES = [
    ("minimal cached read path", _minimal_read_path()),
    ("event-driven, queue-decoupled", _event_driven()),
    ("cached fan-out (width 6)", _cached_fan_out(6)),
    ("retry loop (service cycle)", _retry_loop()),
    ("deep synchronous chain (depth 8)", _deep_chain(8)),
    ("fan-out onto shared DB (width 6)", _fan_out_shared_db(6)),
    ("fan-out onto shared DB (width 12)", _fan_out_shared_db(12)),
]


def grade(model, nodes, edges):
    from torch_geometric.data import Data

    node_features, edge_index, edge_features, graph_features = encode_canvas_graph(nodes, edges)
    data = Data(
        x=torch.from_numpy(node_features),
        edge_index=torch.from_numpy(edge_index),
        edge_attr=torch.from_numpy(edge_features),
    )
    data.graph_features = torch.from_numpy(graph_features).view(1, -1)
    data.batch = torch.zeros(data.x.size(0), dtype=torch.long)

    with torch.no_grad():
        probabilities = torch.softmax(model(data), dim=1)[0]

    index = int(probabilities.argmax())
    # Expected position on the ordered low<medium<high scale, so two topologies
    # can be ranked against each other rather than just named.
    risk_index = float(sum(i * float(probabilities[i]) for i in range(len(CLASSES))))
    return CLASSES[index], float(probabilities[index]), risk_index, probabilities


def main() -> None:
    if not MODEL_PATH.exists():
        raise SystemExit(f"No trained model at {MODEL_PATH}. Train first.")

    checkpoint = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
    architecture = checkpoint.get("architecture", {})
    model = ArchitectureGrader(
        num_classes=len(CLASSES),
        hidden_dim=architecture.get("hidden_dim", 96),
        num_layers=architecture.get("num_layers", 3),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    results = []
    for name, (nodes, edges) in REFERENCE_TOPOLOGIES:
        predicted, confidence, risk_index, probabilities = grade(model, nodes, edges)
        results.append((name, predicted, confidence, risk_index, probabilities, len(nodes)))

    print("=" * 88)
    print("REFERENCE TOPOLOGY GRADES  (ordered by the model's own risk index)")
    print("=" * 88)
    print(f"{'topology':<36} {'n':>3} {'grade':>7} {'conf':>7} {'risk':>6}   {'low/med/high'}")
    print("-" * 88)
    for name, predicted, confidence, risk_index, probabilities, size in sorted(
        results, key=lambda r: r[3]
    ):
        distribution = "/".join(f"{float(p):.2f}" for p in probabilities)
        letter = CLASS_TO_LETTER.get(predicted, "?")
        print(
            f"{name:<36} {size:>3} {predicted + ' ' + letter:>7} "
            f"{confidence:>6.1%} {risk_index:>6.2f}   {distribution}"
        )
    print("=" * 88)

    ordered = sorted(results, key=lambda r: r[3])
    healthy = {"minimal cached read path", "event-driven, queue-decoupled"}
    fragile = {"fan-out onto shared DB (width 12)", "deep synchronous chain (depth 8)"}

    healthy_positions = [i for i, r in enumerate(ordered) if r[0] in healthy]
    fragile_positions = [i for i, r in enumerate(ordered) if r[0] in fragile]

    print()
    if healthy_positions and fragile_positions and max(healthy_positions) < min(fragile_positions):
        print("Ordering check PASSED: every healthy reference ranks below every fragile one.")
    else:
        print("Ordering check NOTE: a healthy reference ranked above a fragile one.")
        print("Worth investigating -- though seven hand-made graphs prove little either way.")


if __name__ == "__main__":
    main()
