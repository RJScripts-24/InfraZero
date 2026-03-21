import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Set

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

ROOT_DIR = Path(__file__).resolve().parents[1]


def build_adjacency(graph: Dict) -> tuple[Dict[str, List[str]], Dict[str, List[str]]]:
    outgoing: Dict[str, List[str]] = defaultdict(list)
    incoming: Dict[str, List[str]] = defaultdict(list)
    for edge in graph.get("edges", []):
        source = edge.get("from")
        target = edge.get("to")
        if not source or not target:
            continue
        outgoing[source].append(target)
        incoming[target].append(source)
    return outgoing, incoming


def count_simple_paths(
    outgoing: Dict[str, List[str]],
    start: str,
    targets: Set[str],
    visited: Set[str],
    limit: int = 2,
) -> int:
    if start in targets:
        return 1

    total_paths = 0
    for neighbor in outgoing.get(start, []):
        if neighbor in visited:
            continue
        total_paths += count_simple_paths(outgoing, neighbor, targets, visited | {neighbor}, limit)
        if total_paths >= limit:
            return limit
    return total_paths


def node_type_contains(node: Dict, words: Set[str]) -> bool:
    node_type = str(node.get("type", "")).lower()
    return any(word in node_type for word in words)


def to_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def graph_has_cycle(outgoing: Dict[str, List[str]], node_ids: Set[str]) -> bool:
    visiting: Set[str] = set()
    visited: Set[str] = set()

    def dfs(node_id: str) -> bool:
        if node_id in visiting:
            return True
        if node_id in visited:
            return False

        visiting.add(node_id)
        for neighbor in outgoing.get(node_id, []):
            if dfs(neighbor):
                return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    for node_id in node_ids:
        if dfs(node_id):
            return True
    return False


def has_redundant_parallel_path(outgoing: Dict[str, List[str]], source: str) -> bool:
    first_hops = outgoing.get(source, [])
    if len(first_hops) < 2:
        return False

    destination_to_hops: Dict[str, Set[str]] = defaultdict(set)
    for first_hop in first_hops:
        stack: List[str] = [first_hop]
        visited: Set[str] = {source}
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            destination_to_hops[current].add(first_hop)
            for neighbor in outgoing.get(current, []):
                if neighbor not in visited:
                    stack.append(neighbor)

    return any(len(hops) >= 2 for hops in destination_to_hops.values())


def path_has_breaker(
    outgoing: Dict[str, List[str]],
    node_lookup: Dict[str, Dict],
    start: str,
    target: str,
) -> bool:
    stack: List[tuple[str, List[str]]] = [(start, [start])]
    while stack:
        node_id, path = stack.pop()
        for neighbor in outgoing.get(node_id, []):
            if neighbor in path:
                continue
            next_path = path + [neighbor]
            if neighbor == target:
                middle_nodes = next_path[1:-1]
                if any(node_type_contains(node_lookup.get(mid, {}), {"cache", "queue"}) for mid in middle_nodes):
                    return True
                continue
            stack.append((neighbor, next_path))
    return False


def classify_label(graph: Dict) -> str:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not nodes:
        return "stable"

    outgoing, incoming = build_adjacency(graph)
    node_lookup = {}
    for node in nodes:
        node_lookup[node["id"]] = node

    for node in nodes:
        node_id = node["id"]
        if len(outgoing.get(node_id, [])) > 4 and len(nodes) > 6 and not has_redundant_parallel_path(outgoing, node_id):
            return "thundering_herd"

    for node in nodes:
        node_id = node["id"]
        if len(incoming.get(node_id, [])) <= 3:
            continue
        if to_float(node.get("failureRate"), 0.0) <= 10.0:
            continue

        upstream_callers = incoming.get(node_id, [])
        has_breaker = any(path_has_breaker(outgoing, node_lookup, upstream, node_id) for upstream in upstream_callers)
        if not has_breaker:
            return "cascading_failure"

    node_ids = {node["id"] for node in nodes if "id" in node}
    has_cycle = graph_has_cycle(outgoing, node_ids)
    if has_cycle and any(to_float(edge.get("packetLossPercent"), 0.0) > 5.0 for edge in edges):
        return "retry_storm"

    return "stable"


def label_graph(graph: Dict) -> Dict:
    labelled = dict(graph)
    labelled["label"] = classify_label(graph)
    return labelled


def resolve_graphs_dir() -> Path:
    graphs_dir = Path(os.getenv("GRAPHS_OUTPUT_DIR", "./data/graphs"))
    if not graphs_dir.is_absolute():
        graphs_dir = (ROOT_DIR / graphs_dir).resolve()
    return graphs_dir


def iter_graph_files(path: Path) -> Iterable[Path]:
    if not path.exists():
        return []
    return sorted(graph_file for graph_file in path.glob("*.json") if graph_file.is_file())


def main() -> None:
    graphs_dir = resolve_graphs_dir()
    os.makedirs(graphs_dir, exist_ok=True)

    labelled_count = 0
    for graph_path in iter_graph_files(graphs_dir):
        try:
            graph = json.loads(graph_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        labelled = label_graph(graph)
        graph_path.write_text(json.dumps(labelled, ensure_ascii=True), encoding="utf-8")
        labelled_count += 1

    print(f"Labelled {labelled_count} graphs in {graphs_dir}")


if __name__ == "__main__":
    main()
