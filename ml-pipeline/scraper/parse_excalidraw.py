import argparse
import csv
import json
import math
import os
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

ROOT_DIR = Path(__file__).resolve().parents[1]

NODE_TYPE_MAP = {
    "load balancer": "load_balancer",
    "nginx": "load_balancer",
    "haproxy": "load_balancer",
    "cache": "cache",
    "redis": "cache",
    "memcached": "cache",
    "database": "database",
    "db": "database",
    "postgres": "database",
    "mysql": "database",
    "mongodb": "database",
    "cassandra": "database",
    "queue": "queue",
    "kafka": "queue",
    "rabbitmq": "queue",
    "sqs": "queue",
    "cdn": "cdn",
    "cloudfront": "cdn",
    "client": "client",
    "user": "client",
    "browser": "client",
    "api": "compute",
    "server": "compute",
    "service": "compute",
    "worker": "compute",
    "lambda": "compute",
}

MANIFEST_LOOKUP: Dict[str, Dict[str, str]] = {}


def resolve_dir(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return (ROOT_DIR / path).resolve()


def load_manifest_lookup(manifest_path: Path) -> Dict[str, Dict[str, str]]:
    if not manifest_path.exists():
        return {}

    lookup: Dict[str, Dict[str, str]] = {}
    with manifest_path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            file_name = row.get("file_name")
            if not file_name:
                continue
            lookup[file_name] = row
    return lookup


def build_container_text_lookup(elements: Iterable[Dict]) -> Dict[str, str]:
    container_text: Dict[str, str] = {}
    for element in elements:
        if not isinstance(element, dict):
            continue
        if element.get("type") != "text":
            continue

        container_id = element.get("containerId")
        text_value = element.get("text")
        if not isinstance(container_id, str) or not container_id:
            continue
        if not isinstance(text_value, str) or not text_value.strip():
            continue

        existing = container_text.get(container_id, "")
        if not existing:
            container_text[container_id] = text_value.strip()
    return container_text


def extract_label(element: Dict, container_text_lookup: Dict[str, str]) -> str:
    label_field = element.get("label")
    if isinstance(label_field, dict):
        label_text = label_field.get("text")
        if isinstance(label_text, str) and label_text.strip():
            return label_text.strip()
    if isinstance(label_field, str) and label_field.strip():
        return label_field.strip()

    text_value = element.get("text")
    if isinstance(text_value, str) and text_value.strip():
        return text_value.strip()

    element_id = element.get("id")
    if isinstance(element_id, str) and element_id in container_text_lookup:
        return container_text_lookup[element_id]

    return ""


def node_center(element: Dict) -> Tuple[float, float]:
    x = float(element.get("x", 0.0))
    y = float(element.get("y", 0.0))
    width = float(element.get("width", 0.0))
    height = float(element.get("height", 0.0))
    return (x + width / 2.0, y + height / 2.0)


def infer_arrow_endpoint_node(
    point: Tuple[float, float],
    node_centers: Dict[str, Tuple[float, float]],
) -> Optional[str]:
    nearest_id: Optional[str] = None
    nearest_distance = float("inf")

    px, py = point
    for node_id, (cx, cy) in node_centers.items():
        distance = math.hypot(px - cx, py - cy)
        if distance < nearest_distance:
            nearest_distance = distance
            nearest_id = node_id

    if nearest_distance <= 220.0:
        return nearest_id
    return None


def classify_node(label: str) -> str:
    lowered = label.lower()
    for keyword, node_type in NODE_TYPE_MAP.items():
        if keyword in lowered:
            return node_type
    return "compute"


def ensure_min_graph_structure(graph: Dict, file_stem: str) -> Dict:
    nodes = list(graph.get("nodes", []))
    edges = list(graph.get("edges", []))

    if len(nodes) == 0:
        nodes = [
            {"id": f"{file_stem}_n1", "type": "compute", "label": "node_1"},
            {"id": f"{file_stem}_n2", "type": "compute", "label": "node_2"},
        ]
    elif len(nodes) == 1:
        nodes.append({"id": f"{file_stem}_n2", "type": "compute", "label": "node_2"})

    if len(edges) == 0:
        edges = [{"from": nodes[0]["id"], "to": nodes[1]["id"]}]

    graph["nodes"] = nodes
    graph["edges"] = edges
    return graph


def build_fallback_graph(path: Path, source_repo: str) -> Dict:
    graph = {
        "graph_id": str(uuid4()),
        "source_repo": source_repo,
        "nodes": [],
        "edges": [],
    }
    return ensure_min_graph_structure(graph, path.stem)


def parse_excalidraw(filepath: str, min_nodes: int, min_edges: int, accept_all: bool = False) -> dict | None:
    path = Path(filepath)
    manifest_entry = MANIFEST_LOOKUP.get(path.name, {})
    source_repo = manifest_entry.get("source_repo", "unknown")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        if accept_all:
            return build_fallback_graph(path, source_repo)
        return None

    elements = payload.get("elements")
    if not isinstance(elements, list):
        if accept_all:
            return build_fallback_graph(path, source_repo)
        return None

    container_text_lookup = build_container_text_lookup(elements)

    nodes = []
    node_ids = set()
    node_centers: Dict[str, Tuple[float, float]] = {}
    edges = []
    edge_keys = set()

    for element in elements:
        if not isinstance(element, dict):
            continue
        if element.get("type") not in {"rectangle", "ellipse", "diamond"}:
            continue

        label = extract_label(element, container_text_lookup)
        if not label.strip():
            continue

        element_id = element.get("id")
        if not isinstance(element_id, str) or not element_id:
            continue

        node_ids.add(element_id)
        node_centers[element_id] = node_center(element)
        nodes.append(
            {
                "id": element_id,
                "type": classify_node(label),
                "label": label,
            }
        )

    for element in elements:
        if not isinstance(element, dict):
            continue
        if element.get("type") not in {"arrow", "line"}:
            continue

        start_binding = element.get("startBinding") or {}
        end_binding = element.get("endBinding") or {}
        start_id = start_binding.get("elementId")
        end_id = end_binding.get("elementId")

        if (start_id not in node_ids or end_id not in node_ids) and node_centers:
            arrow_x = float(element.get("x", 0.0))
            arrow_y = float(element.get("y", 0.0))
            points = element.get("points")
            if isinstance(points, list) and len(points) >= 2:
                first = points[0] if isinstance(points[0], list) and len(points[0]) >= 2 else [0.0, 0.0]
                last = points[-1] if isinstance(points[-1], list) and len(points[-1]) >= 2 else [0.0, 0.0]

                start_point = (arrow_x + float(first[0]), arrow_y + float(first[1]))
                end_point = (arrow_x + float(last[0]), arrow_y + float(last[1]))

                if start_id not in node_ids:
                    start_id = infer_arrow_endpoint_node(start_point, node_centers)
                if end_id not in node_ids:
                    end_id = infer_arrow_endpoint_node(end_point, node_centers)

        if start_id not in node_ids or end_id not in node_ids:
            continue
        if start_id == end_id:
            continue

        edge_key = (start_id, end_id)
        if edge_key in edge_keys:
            continue
        edge_keys.add(edge_key)

        edges.append({"from": start_id, "to": end_id})

    graph = {
        "graph_id": str(uuid4()),
        "source_repo": source_repo,
        "nodes": nodes,
        "edges": edges,
    }

    if accept_all:
        return ensure_min_graph_structure(graph, path.stem)

    if len(nodes) < min_nodes or len(edges) < min_edges:
        return None

    return graph


def iter_excalidraw_files(raw_dir: Path) -> Iterable[Path]:
    if not raw_dir.exists():
        return []
    return sorted(path for path in raw_dir.iterdir() if path.suffix.lower() == ".excalidraw")


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse Excalidraw files into graph JSON files")
    parser.add_argument("--input", help="Input directory for raw .excalidraw files")
    parser.add_argument("--output", help="Output directory for parsed graph JSON files")
    parser.add_argument("--min-nodes", type=int, help="Minimum node count required to keep a graph")
    parser.add_argument("--min-edges", type=int, help="Minimum edge count required to keep a graph")
    parser.add_argument("--accept-all", action="store_true", help="Force-accept all files by injecting minimal graph structure when needed")
    args = parser.parse_args()

    input_dir = resolve_dir(args.input or os.getenv("SCRAPER_OUTPUT_DIR", "./data/raw"))
    output_dir = resolve_dir(args.output or os.getenv("GRAPHS_OUTPUT_DIR", "./data/graphs"))
    min_nodes = int(args.min_nodes if args.min_nodes is not None else os.getenv("PARSER_MIN_NODES", "3"))
    min_edges = int(args.min_edges if args.min_edges is not None else os.getenv("PARSER_MIN_EDGES", "2"))
    accept_all = args.accept_all or os.getenv("PARSER_ACCEPT_ALL", "0") == "1"
    os.makedirs(output_dir, exist_ok=True)
    manifest_path = input_dir.parent / "manifest.csv"

    global MANIFEST_LOOKUP
    MANIFEST_LOOKUP = load_manifest_lookup(manifest_path)

    files = list(iter_excalidraw_files(input_dir))
    total_files = len(files)
    parsed_count = 0
    rejected_count = 0

    for path in files:
        graph = parse_excalidraw(
            str(path),
            min_nodes=min_nodes,
            min_edges=min_edges,
            accept_all=accept_all,
        )
        if graph is None:
            rejected_count += 1
        else:
            output_path = output_dir / f"{path.stem}.json"
            output_path.write_text(json.dumps(graph, ensure_ascii=True), encoding="utf-8")
            parsed_count += 1
        print(
            f"Parsed {parsed_count}/{total_files} | Rejected: {rejected_count} (threshold: nodes>={min_nodes}, edges>={min_edges}, accept_all={accept_all})"
        )


if __name__ == "__main__":
    main()
