"""Synthetic OTel trace generation for GhostTrace training and demos."""

from __future__ import annotations

import json
import os
import random
import sys
from collections import Counter
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from tqdm import tqdm


ROOT_DIR = Path(__file__).resolve().parents[1]


def to_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def edge_source(edge: dict) -> str:
    return str(edge.get("source", edge.get("from", ""))).strip()


def edge_target(edge: dict) -> str:
    return str(edge.get("target", edge.get("to", ""))).strip()


def get_node_data(node: dict) -> dict:
    data = node.get("data", {})
    return data if isinstance(data, dict) else {}


def build_adjacency(nodes: list[dict], edges: list[dict]) -> dict[str, list[str]]:
    """Returns {nodeId: [neighbor nodeIds]} with only valid node endpoints."""
    node_ids = {str(node.get("id", "")).strip() for node in nodes if str(node.get("id", "")).strip()}
    adjacency: dict[str, list[str]] = {node_id: [] for node_id in node_ids}

    for edge in edges:
        source = edge_source(edge)
        target = edge_target(edge)
        if source in node_ids and target in node_ids:
            adjacency[source].append(target)

    return adjacency


def find_entry_nodes(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Return nodes with no incoming edges; fallback to highest out-degree node for pure cycles."""
    node_ids = [str(node.get("id", "")).strip() for node in nodes if str(node.get("id", "")).strip()]
    incoming = Counter({node_id: 0 for node_id in node_ids})
    outgoing = Counter({node_id: 0 for node_id in node_ids})

    for edge in edges:
        source = edge_source(edge)
        target = edge_target(edge)
        if source in outgoing:
            outgoing[source] += 1
        if target in incoming:
            incoming[target] += 1

    entry = [node for node in nodes if incoming[str(node.get("id", "")).strip()] == 0]
    if entry:
        return entry

    if not nodes:
        return []

    best_node = max(nodes, key=lambda node: outgoing[str(node.get("id", "")).strip()])
    return [best_node]


def find_all_paths(graph: dict[str, list[str]], entry_node_id: str, max_depth: int = 8) -> list[list[str]]:
    """DFS path discovery with cycle protection and branch fan-out cap."""
    if not entry_node_id:
        return []

    paths: list[list[str]] = []

    def dfs(current: str, path: list[str], visited: set[str]) -> None:
        if len(paths) >= 6:
            return

        neighbors = graph.get(current, [])
        # Stop when leaf reached.
        if not neighbors:
            paths.append(path)
            return

        # Stop when depth exceeded.
        if len(path) > max_depth:
            paths.append(path)
            return

        expanded = False
        for neighbor in neighbors:
            # Stop expansion on cycle and keep current path snapshot.
            if neighbor in visited:
                paths.append(path)
                continue
            expanded = True
            dfs(neighbor, path + [neighbor], visited | {neighbor})
            if len(paths) >= 6:
                return

        if not expanded and len(paths) < 6:
            paths.append(path)

    dfs(entry_node_id, [entry_node_id], {entry_node_id})

    if not paths:
        return [[entry_node_id]]
    return paths[:6]


def node_to_operation(node: dict) -> str:
    node_type = str(get_node_data(node).get("type", node.get("type", "Service"))).strip().lower()

    if node_type in {"postgresql", "database"} or "database" in node_type or "postgres" in node_type:
        return "db.query"
    if node_type in {"cache", "redis"} or "cache" in node_type or "redis" in node_type:
        return "cache.get"
    if node_type in {"rabbitmq", "queue"} or "rabbit" in node_type or "queue" in node_type:
        return "queue.publish"
    if node_type == "gateway" or "gateway" in node_type:
        return "http.request"
    if node_type in {"infrastructure", "load balancer"} or "load balancer" in node_type:
        return "lb.route"
    if node_type in {"edge network", "cdn"} or "cdn" in node_type:
        return "cdn.serve"
    return "service.call"


def compute_span_duration(node: dict, edge: dict | None, anomaly_class: str, path_position: int) -> float:
    node_data = get_node_data(node)

    base = to_float(node_data.get("processingPowerMs"), random.uniform(20, 150))
    edge_latency = to_float(edge.get("latencyMs") if edge else None, random.uniform(10, 80))
    jitter = random.uniform(-10, 30)

    if anomaly_class == "thundering_herd":
        if path_position == 0:
            multiplier = random.uniform(8, 20)
        else:
            multiplier = random.uniform(1, 3)
    elif anomaly_class == "cascading_failure":
        if path_position > 2:
            multiplier = random.uniform(5, 15)
        else:
            multiplier = random.uniform(1, 2)
    elif anomaly_class == "retry_storm":
        multiplier = random.uniform(3, 8)
    else:
        multiplier = random.uniform(0.8, 1.2)

    return max(1.0, (base + edge_latency + jitter) * multiplier)


def compute_span_status(
    node: dict,
    edge: dict | None,
    anomaly_class: str,
    duration: float,
    path_position: int,
) -> str:
    _ = node
    _ = edge

    if anomaly_class == "thundering_herd":
        error_probability = 0.35 if path_position == 0 else 0.10
    elif anomaly_class == "cascading_failure":
        error_probability = min(0.95, 0.05 * path_position)
    elif anomaly_class == "retry_storm":
        error_probability = 0.25
    else:
        error_probability = 0.02

    if duration > 1000:
        timeout_probability = 0.4
    elif duration > 500:
        timeout_probability = 0.2
    else:
        timeout_probability = 0.02

    r = random.random()
    if r < error_probability:
        return "error"
    if r < error_probability + timeout_probability:
        return "timeout"
    return "ok"


def generate_trace_for_path(
    path: list[str],
    nodes_by_id: dict[str, dict],
    edges_by_pair: dict[tuple[str, str], dict],
    anomaly_class: str,
    trace_id: str,
) -> list[dict]:
    spans: list[dict] = []
    current_time_ms = 0.0
    parent_span_id: str | None = None

    for i, node_id in enumerate(path):
        node = nodes_by_id[node_id]
        edge = edges_by_pair.get((path[i - 1], node_id)) if i > 0 else None

        span_id = uuid4().hex[:16]
        duration = compute_span_duration(node, edge, anomaly_class, i)
        status = compute_span_status(node, edge, anomaly_class, duration, i)

        retry_count = 0
        if anomaly_class == "retry_storm" and status in ("error", "timeout"):
            retry_count = random.randint(1, 4)

        node_data = get_node_data(node)
        node_label = str(node_data.get("label", f"service-{i}"))
        node_type = str(node_data.get("type", "Service"))

        tags = {
            "service.type": node_type,
            "anomaly.class": anomaly_class,
            "path.position": str(i),
            "span.retries": str(retry_count),
        }
        if status == "error":
            tags["error"] = "true"
            tags["error.message"] = f"{node_label} returned 500"
        if status == "timeout":
            tags["timeout"] = "true"
            tags["timeout.threshold_ms"] = "1000"

        span = {
            "spanId": span_id,
            "traceId": trace_id,
            "parentSpanId": parent_span_id,
            "operationName": node_to_operation(node),
            "serviceName": node_label,
            "startTimeMs": round(current_time_ms, 2),
            "durationMs": round(duration, 2),
            "status": status,
            "tags": tags,
            "logs": [],
        }

        if status == "error":
            span["logs"].append(
                {
                    "timestamp": round(current_time_ms + duration * 0.8, 2),
                    "message": f"ERROR: Request failed at {node_label}",
                }
            )

        spans.append(span)

        retry_delay = duration
        for r in range(retry_count):
            retry_duration = compute_span_duration(node, edge, anomaly_class, i) * 1.2
            retry_span = {
                "spanId": uuid4().hex[:16],
                "traceId": trace_id,
                "parentSpanId": span_id,
                "operationName": node_to_operation(node) + ".retry",
                "serviceName": node_label,
                "startTimeMs": round(current_time_ms + retry_delay, 2),
                "durationMs": round(retry_duration, 2),
                "status": "error" if r < retry_count - 1 else "ok",
                "tags": {**tags, "retry.attempt": str(r + 1)},
                "logs": [],
            }
            spans.append(retry_span)
            retry_delay += retry_duration * (2 ** r)

        current_time_ms += duration
        parent_span_id = span_id

    return spans


def generate_otel_trace(graph: dict, num_traces: int = 3) -> dict:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    anomaly_class = str(graph.get("label", "stable"))

    nodes_by_id = {
        str(node.get("id", "")).strip(): node
        for node in nodes
        if str(node.get("id", "")).strip()
    }
    edges_by_pair = {}
    for edge in edges:
        source = edge_source(edge)
        target = edge_target(edge)
        if source and target:
            edges_by_pair[(source, target)] = edge

    adjacency = build_adjacency(nodes, edges)
    entry_nodes = find_entry_nodes(nodes, edges)

    all_traces = []
    for trace_num in range(num_traces):
        trace_id = uuid4().hex[:32]
        if not entry_nodes:
            continue

        entry = random.choice(entry_nodes)
        entry_id = str(entry.get("id", "")).strip()
        if not entry_id:
            continue

        paths = find_all_paths(adjacency, entry_id)
        paths_sorted = sorted(paths, key=len, reverse=True)
        path = paths_sorted[trace_num % len(paths_sorted)]

        spans = generate_trace_for_path(
            path, nodes_by_id, edges_by_pair, anomaly_class, trace_id
        )

        all_traces.append(
            {
                "traceID": trace_id,
                "spans": spans,
                "processes": {
                    f"p{i}": {"serviceName": str(get_node_data(nodes_by_id[node_id]).get("label", node_id))}
                    for i, node_id in enumerate(path)
                    if node_id in nodes_by_id
                },
            }
        )

    return {
        "data": all_traces,
        "total": len(all_traces),
        "source_graph": graph.get("source", "unknown"),
        "anomaly_class": anomaly_class,
        "span_count": sum(len(t["spans"]) for t in all_traces),
    }


def main() -> None:
    load_dotenv(dotenv_path=ROOT_DIR / ".env")

    graphs_dir = os.getenv("GRAPHS_OUTPUT_DIR", "./data/graphs")
    traces_dir = os.getenv("TRACES_OUTPUT_DIR", "./data/traces")

    graphs_path = Path(graphs_dir)
    traces_path = Path(traces_dir)
    if not graphs_path.is_absolute():
        graphs_path = (ROOT_DIR / graphs_path).resolve()
    if not traces_path.is_absolute():
        traces_path = (ROOT_DIR / traces_path).resolve()

    os.makedirs(traces_path, exist_ok=True)

    if not graphs_path.exists():
        print("ERROR: No graph files found in", str(graphs_path))
        sys.exit(1)

    graph_files = [name for name in os.listdir(graphs_path) if name.endswith(".json")]

    if not graph_files:
        print("ERROR: No graph files found in", str(graphs_path))
        sys.exit(1)

    total_spans = 0
    total_traces = 0
    class_counts: Counter[str] = Counter()
    processed_graphs = 0

    for filename in tqdm(graph_files, desc="Synthesizing traces"):
        graph_path = graphs_path / filename
        with graph_path.open("r", encoding="utf-8") as handle:
            graph = json.load(handle)

        if len(graph.get("nodes", [])) < 3:
            continue

        result = generate_otel_trace(graph, num_traces=3)

        out_filename = filename.replace(".json", "_traces.json")
        with (traces_path / out_filename).open("w", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)

        total_spans += int(result["span_count"])
        total_traces += int(result["total"])
        class_counts[str(result["anomaly_class"])] += 1
        processed_graphs += 1

    print("\nTrace synthesis complete:")
    print(f"  Graphs processed:  {processed_graphs}")
    print(f"  Traces generated:  {total_traces}")
    print(f"  Total spans:       {total_spans}")
    print(f"  Avg spans/trace:   {total_spans / max(total_traces, 1):.1f}")
    print(f"  Class breakdown:   {dict(class_counts)}")

    if total_spans / max(total_traces, 1) < 5:
        print("\nWARNING: Average spans per trace is below 5.")
        print("Check that your graphs have at least 3 connected nodes.")


if __name__ == "__main__":
    main()
