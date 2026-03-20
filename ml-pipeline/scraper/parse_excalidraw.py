import csv
import json
from pathlib import Path
from typing import Dict, Iterable, Optional
from uuid import uuid4

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
RAW_DIR = DATA_DIR / "raw_excalidraw"
MANIFEST_PATH = DATA_DIR / "manifest.csv"
PARSED_PATH = DATA_DIR / "parsed_graphs.jsonl"

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


def load_manifest_lookup() -> Dict[str, Dict[str, str]]:
    if not MANIFEST_PATH.exists():
        return {}

    lookup: Dict[str, Dict[str, str]] = {}
    with MANIFEST_PATH.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            file_name = row.get("file_name")
            if not file_name:
                continue
            lookup[file_name] = row
    return lookup


def extract_label(element: Dict) -> str:
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

    return ""


def classify_node(label: str) -> str:
    lowered = label.lower()
    for keyword, node_type in NODE_TYPE_MAP.items():
        if keyword in lowered:
            return node_type
    return "compute"


def parse_excalidraw(filepath: str) -> dict | None:
    path = Path(filepath)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    elements = payload.get("elements")
    if not isinstance(elements, list):
        return None

    nodes = []
    node_ids = set()
    edges = []
    edge_keys = set()

    for element in elements:
        if not isinstance(element, dict):
            continue
        if element.get("type") not in {"rectangle", "ellipse", "diamond"}:
            continue

        label = extract_label(element)
        if not label.strip():
            continue

        element_id = element.get("id")
        if not isinstance(element_id, str) or not element_id:
            continue

        node_ids.add(element_id)
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

        if start_id not in node_ids or end_id not in node_ids:
            continue

        edge_key = (start_id, end_id)
        if edge_key in edge_keys:
            continue
        edge_keys.add(edge_key)

        edges.append({"from": start_id, "to": end_id})

    if len(nodes) < 3 or len(edges) < 2:
        return None

    manifest_entry = MANIFEST_LOOKUP.get(path.name, {})
    source_repo = manifest_entry.get("source_repo", "unknown")

    return {
        "graph_id": str(uuid4()),
        "source_repo": source_repo,
        "nodes": nodes,
        "edges": edges,
    }


def iter_excalidraw_files() -> Iterable[Path]:
    if not RAW_DIR.exists():
        return []
    return sorted(path for path in RAW_DIR.iterdir() if path.suffix.lower() == ".excalidraw")


def main() -> None:
    global MANIFEST_LOOKUP
    MANIFEST_LOOKUP = load_manifest_lookup()

    files = list(iter_excalidraw_files())
    total_files = len(files)
    parsed_count = 0
    rejected_count = 0

    PARSED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with PARSED_PATH.open("w", encoding="utf-8") as output_handle:
        for index, path in enumerate(files, start=1):
            graph = parse_excalidraw(str(path))
            if graph is None:
                rejected_count += 1
            else:
                output_handle.write(json.dumps(graph, ensure_ascii=True) + "\n")
                parsed_count += 1
            print(
                f"Parsed {parsed_count}/{total_files} | Rejected: {rejected_count} (too few nodes/edges)"
            )


if __name__ == "__main__":
    main()
