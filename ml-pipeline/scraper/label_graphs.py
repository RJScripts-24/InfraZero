import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Set

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
PARSED_PATH = DATA_DIR / "parsed_graphs.jsonl"
LABELLED_PATH = DATA_DIR / "labelled_graphs.jsonl"


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


def detect_anti_patterns(graph: Dict) -> List[str]:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not nodes:
        return ["CLEAN"]

    outgoing, incoming = build_adjacency(graph)
    nodes_by_type: Dict[str, List[Dict]] = defaultdict(list)
    node_lookup = {}
    for node in nodes:
        node_type = node.get("type", "compute")
        nodes_by_type[node_type].append(node)
        node_lookup[node["id"]] = node

    anti_patterns: List[str] = []

    for node in nodes:
        node_id = node["id"]
        node_type = node.get("type", "compute")
        if len(incoming.get(node_id, [])) >= 3 and len(nodes_by_type[node_type]) == 1:
            anti_patterns.append("SPOF")
            break

    has_database = bool(nodes_by_type.get("database"))
    has_cache = bool(nodes_by_type.get("cache"))
    if has_database and not has_cache:
        anti_patterns.append("THUNDERING_HERD")

    source_ids = {
        node["id"]
        for node in nodes
        if node.get("type") in {"client", "load_balancer"}
    }
    database_ids = {
        node["id"]
        for node in nodes
        if node.get("type") == "database"
    }
    if source_ids and database_ids:
        total_paths = 0
        for source_id in source_ids:
            total_paths += count_simple_paths(outgoing, source_id, database_ids, {source_id})
            if total_paths >= 2:
                break
        if total_paths <= 1:
            anti_patterns.append("NO_REDUNDANCY")

    compute_count = len(nodes_by_type.get("compute", []))
    load_balancer_count = len(nodes_by_type.get("load_balancer", []))
    if compute_count >= 2 and load_balancer_count == 0:
        anti_patterns.append("MISSING_LB")

    if not has_cache:
        database_ids = [node["id"] for node in nodes_by_type.get("database", [])]
        for db_id in database_ids:
            adjacent_compute = set()
            for source in incoming.get(db_id, []):
                if node_lookup.get(source, {}).get("type") == "compute":
                    adjacent_compute.add(source)
            for target in outgoing.get(db_id, []):
                if node_lookup.get(target, {}).get("type") == "compute":
                    adjacent_compute.add(target)
            if len(adjacent_compute) >= 4:
                anti_patterns.append("N_PLUS_ONE")
                break

    return anti_patterns or ["CLEAN"]


def assess_pass_fail(graph: Dict) -> Dict:
    anti_patterns = detect_anti_patterns(graph)
    effective_count = 0 if anti_patterns == ["CLEAN"] else len(anti_patterns)
    pass_fail = "PASS" if effective_count == 0 else "FAIL"
    reliability_score = max(0.0, min(1.0, 1.0 - (0.2 * effective_count)))
    return {
        "pass_fail": pass_fail,
        "reliability_score": reliability_score,
    }


def label_graph(graph: Dict) -> Dict:
    anti_patterns = detect_anti_patterns(graph)
    assessment = assess_pass_fail(graph)
    return {
        "graph_id": graph["graph_id"],
        "source_repo": graph.get("source_repo", "unknown"),
        "nodes": graph.get("nodes", []),
        "edges": graph.get("edges", []),
        "pass_fail": assessment["pass_fail"],
        "reliability_score": assessment["reliability_score"],
        "anti_patterns": anti_patterns,
        "node_count": len(graph.get("nodes", [])),
        "edge_count": len(graph.get("edges", [])),
    }


def iter_graphs(path: Path) -> Iterable[Dict]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def main() -> None:
    LABELLED_PATH.parent.mkdir(parents=True, exist_ok=True)
    labelled_count = 0
    with LABELLED_PATH.open("w", encoding="utf-8") as output_handle:
        for graph in iter_graphs(PARSED_PATH):
            labelled = label_graph(graph)
            output_handle.write(json.dumps(labelled, ensure_ascii=True) + "\n")
            labelled_count += 1

    print(f"Labelled {labelled_count} graphs -> {LABELLED_PATH}")


if __name__ == "__main__":
    main()
