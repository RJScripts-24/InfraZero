"""Synthetic OTel trace generation for GhostTrace training and demos."""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Dict, Iterable, List, Sequence


ROOT_DIR = Path(__file__).resolve().parents[1]
GRAPHS_DIR = (ROOT_DIR / "data" / "graphs").resolve()
TRACES_DIR = (ROOT_DIR / "data" / "traces").resolve()


def to_float(value: object, default: float = 0.0) -> float:
    """Safely convert arbitrary input to float."""

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def resolve_nodes(graph_json: Dict) -> List[Dict]:
    """Return graph nodes as a list."""

    nodes = graph_json.get("nodes", [])
    return nodes if isinstance(nodes, list) else []


def resolve_edges(graph_json: Dict) -> List[Dict]:
    """Return graph edges as a list."""

    edges = graph_json.get("edges", [])
    return edges if isinstance(edges, list) else []


def edge_source(edge: Dict) -> str:
    """Return normalized edge source id."""

    return str(edge.get("source", edge.get("from", "")))


def edge_target(edge: Dict) -> str:
    """Return normalized edge target id."""

    return str(edge.get("target", edge.get("to", "")))


def extract_node_metric(node: Dict, field_name: str, default: float = 0.0) -> float:
    """Read node metric from either node.data or the node root."""

    node_data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
    if field_name in node_data:
        return to_float(node_data.get(field_name), default)
    return to_float(node.get(field_name), default)


def extract_node_label(node: Dict) -> str:
    """Return a display label for the node."""

    node_data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
    return str(node_data.get("label", node.get("label", node.get("id", "unknown"))))


def extract_node_type(node: Dict) -> str:
    """Return a normalized node type."""

    node_data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
    return str(node_data.get("type", node.get("type", "Service")))


def build_adjacency(graph_json: Dict) -> tuple[Dict[str, List[str]], Dict[str, List[str]]]:
    """Build outgoing and incoming adjacency maps."""

    outgoing: Dict[str, List[str]] = {}
    incoming: Dict[str, List[str]] = {}

    for node in resolve_nodes(graph_json):
        node_id = str(node.get("id", ""))
        outgoing[node_id] = []
        incoming[node_id] = []

    for edge in resolve_edges(graph_json):
        source = edge_source(edge)
        target = edge_target(edge)
        if source not in outgoing or target not in incoming:
            continue
        outgoing[source].append(target)
        incoming[target].append(source)

    return outgoing, incoming


def build_paths(graph_json: Dict, limit: int = 3) -> List[List[str]]:
    """Walk the graph breadth-first from entry nodes."""

    nodes = resolve_nodes(graph_json)
    if not nodes:
        return []

    outgoing, incoming = build_adjacency(graph_json)
    entry_nodes = [str(node.get("id", "")) for node in nodes if len(incoming.get(str(node.get("id", "")), [])) == 0]
    queue = [[node_id] for node_id in (entry_nodes or [str(nodes[0].get("id", ""))])]
    paths: List[List[str]] = []

    while queue and len(paths) < limit:
        path = queue.pop(0)
        current = path[-1]
        next_nodes = [node_id for node_id in outgoing.get(current, []) if node_id not in path]
        if not next_nodes:
            paths.append(path)
            continue
        for node_id in next_nodes:
            queue.append(path + [node_id])

    return paths


def make_rng(graph_json: Dict, anomaly_class: str) -> random.Random:
    """Create a deterministic RNG from graph id and anomaly class."""

    seed_source = f"{graph_json.get('graph_id', 'graph')}:{anomaly_class}"
    return random.Random(seed_source)


def create_span(
    trace_id: str,
    span_id: str,
    parent_span_id: str | None,
    service_name: str,
    node_type: str,
    start_time_unix_nano: int,
    duration_nano: int,
    status: str,
) -> Dict:
    """Build one OTel-compatible span dictionary."""

    return {
        "traceId": trace_id,
        "spanId": span_id,
        "parentSpanId": parent_span_id,
        "serviceName": service_name,
        "startTimeUnixNano": start_time_unix_nano,
        "durationNano": duration_nano,
        "status": status,
        "attributes": {
            "service.type": node_type,
        },
    }


def generate_otel_trace(graph_json: Dict, anomaly_class: str) -> List[Dict]:
    """Generate synthetic OTel spans by walking the topology."""

    nodes = resolve_nodes(graph_json)
    node_by_id = {str(node.get("id", "")): node for node in nodes}
    paths = build_paths(graph_json)
    rng = make_rng(graph_json, anomaly_class)
    spans: List[Dict] = []
    base_start = 1_700_000_000_000_000_000

    failure_flip_tick = rng.randint(1, 4) if anomaly_class == "cascading_failure" else None

    for path_index, path in enumerate(paths):
        trace_id = f"trace-{graph_json.get('graph_id', 'graph')}-{path_index}"
        current_start = base_start + path_index * 1_000_000_000
        parent_span_id: str | None = None

        for hop_index, node_id in enumerate(path):
            node = node_by_id.get(node_id, {})
            processing_ms = max(1.0, extract_node_metric(node, "processingPowerMs", 100.0))
            service_name = extract_node_label(node)
            node_type = extract_node_type(node)
            duration_ms = processing_ms
            status = "STATUS_CODE_OK"

            if anomaly_class == "stable":
                duration_ms = processing_ms * rng.uniform(0.8, 1.2)
            elif anomaly_class == "thundering_herd":
                fan_out = sum(1 for edge in resolve_edges(graph_json) if edge_source(edge) == node_id)
                multiplier = rng.uniform(10.0, 50.0) if fan_out >= 2 else rng.uniform(1.2, 3.0)
                duration_ms = processing_ms * multiplier
            elif anomaly_class == "retry_storm":
                duration_ms = processing_ms * rng.uniform(1.5, 4.0)
            elif anomaly_class == "cascading_failure":
                duration_ms = processing_ms * rng.uniform(0.9, 1.6)
                if failure_flip_tick is not None and hop_index >= failure_flip_tick:
                    status = "STATUS_CODE_ERROR"

            span_id = f"span-{path_index}-{hop_index}"
            duration_nano = int(duration_ms * 1_000_000)
            spans.append(
                create_span(
                    trace_id=trace_id,
                    span_id=span_id,
                    parent_span_id=parent_span_id,
                    service_name=service_name,
                    node_type=node_type,
                    start_time_unix_nano=current_start,
                    duration_nano=duration_nano,
                    status=status,
                )
            )

            if anomaly_class == "retry_storm":
                backoff_ms = max(10.0, processing_ms)
                for retry_index in range(2):
                    retry_duration_ms = backoff_ms * (2 ** retry_index)
                    retry_span_id = f"span-{path_index}-{hop_index}-retry-{retry_index}"
                    retry_start = current_start + duration_nano + int(retry_duration_ms * 1_000_000 * retry_index)
                    spans.append(
                        create_span(
                            trace_id=trace_id,
                            span_id=retry_span_id,
                            parent_span_id=parent_span_id,
                            service_name=service_name,
                            node_type=node_type,
                            start_time_unix_nano=retry_start,
                            duration_nano=int(retry_duration_ms * 1_000_000),
                            status="STATUS_CODE_ERROR",
                        )
                    )

            parent_span_id = span_id
            current_start += duration_nano

    return spans


def export_to_jaeger_json(spans: List[Dict]) -> Dict:
    """Wrap spans in a Jaeger-compatible JSON envelope."""

    if not spans:
        return {"data": []}

    trace_id = spans[0]["traceId"]
    processes: Dict[str, Dict] = {}
    jaeger_spans: List[Dict] = []

    for span in spans:
        service_name = span["serviceName"]
        process_id = f"process-{service_name.replace(' ', '-').lower()}"
        if process_id not in processes:
            processes[process_id] = {
                "serviceName": service_name,
                "tags": [
                    {"key": key, "type": "string", "value": str(value)}
                    for key, value in span["attributes"].items()
                ],
            }

        references = []
        if span["parentSpanId"]:
            references.append(
                {
                    "refType": "CHILD_OF",
                    "traceID": trace_id,
                    "spanID": span["parentSpanId"],
                }
            )

        jaeger_spans.append(
            {
                "traceID": trace_id,
                "spanID": span["spanId"],
                "operationName": f"{service_name}.handle",
                "references": references,
                "startTime": span["startTimeUnixNano"] // 1_000,
                "duration": span["durationNano"] // 1_000,
                "tags": [
                    {"key": "otel.status_code", "type": "string", "value": span["status"]},
                    *[
                        {"key": key, "type": "string", "value": str(value)}
                        for key, value in span["attributes"].items()
                    ],
                ],
                "processID": process_id,
                "warnings": None,
            }
        )

    return {
        "data": [
            {
                "traceID": trace_id,
                "spans": jaeger_spans,
                "processes": processes,
            }
        ]
    }


def iter_graph_files() -> Iterable[Path]:
    """Yield graph JSON files from the dataset directory."""

    if not GRAPHS_DIR.exists():
        return []
    return sorted(path for path in GRAPHS_DIR.rglob("*.json") if path.is_file())


def main() -> None:
    """Generate one sample trace file from the first available graph."""

    graph_files = list(iter_graph_files())
    if not graph_files:
        raise FileNotFoundError(f"No graph files found in {GRAPHS_DIR}")

    graph_path = graph_files[0]
    graph_json = json.loads(graph_path.read_text(encoding="utf-8"))
    anomaly_class = str(graph_json.get("label", "stable")).strip().lower()
    spans = generate_otel_trace(graph_json, anomaly_class)
    jaeger_payload = export_to_jaeger_json(spans)

    TRACES_DIR.mkdir(parents=True, exist_ok=True)
    output_path = TRACES_DIR / f"{graph_path.stem}_{anomaly_class}.json"
    output_path.write_text(json.dumps(jaeger_payload, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"Generated {len(spans)} spans -> {output_path}")


if __name__ == "__main__":
    main()
