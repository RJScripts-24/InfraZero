import json
import os
from collections import Counter
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

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


def get_node_id(node: Dict) -> str:
    return str(node.get("id", "")).strip()


def get_node_failure_rate(node: Dict) -> float:
    data = node.get("data", {}) if isinstance(node.get("data", {}), dict) else {}
    value = node.get("failureRatePercent", data.get("failureRatePercent", 5.0))
    return to_float(value, 5.0)


def get_edge_endpoints(edge: Dict) -> Tuple[str, str]:
    source = edge.get("from", edge.get("source", ""))
    target = edge.get("to", edge.get("target", ""))
    return str(source or "").strip(), str(target or "").strip()


def get_edge_latency(edge: Dict) -> float:
    return to_float(edge.get("latencyMs"), 50.0)


def build_degree_maps(nodes: List[Dict], edges: List[Dict]) -> tuple[Counter, Counter, Dict[str, List[str]], Set[str]]:
    node_ids = {get_node_id(node) for node in nodes if get_node_id(node)}
    out_degree: Counter = Counter({node_id: 0 for node_id in node_ids})
    in_degree: Counter = Counter({node_id: 0 for node_id in node_ids})
    outgoing: Dict[str, List[str]] = defaultdict(list)

    for edge in edges:
        source, target = get_edge_endpoints(edge)
        if not source or not target:
            continue
        node_ids.add(source)
        node_ids.add(target)
        out_degree[source] += 1
        in_degree[target] += 1
        outgoing[source].append(target)

    for node_id in node_ids:
        out_degree[node_id] += 0
        in_degree[node_id] += 0

    return out_degree, in_degree, outgoing, node_ids


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


def critical_path_nodes(outgoing: Dict[str, List[str]], node_ids: Set[str], in_degree: Counter) -> List[str]:
    best_path: List[str] = []
    starts = [node_id for node_id in node_ids if in_degree[node_id] == 0] or sorted(node_ids)

    def dfs(node_id: str, path: List[str], visited: Set[str]) -> None:
        nonlocal best_path
        if len(path) > len(best_path):
            best_path = list(path)

        for neighbor in outgoing.get(node_id, []):
            if neighbor in visited:
                continue
            dfs(neighbor, path + [neighbor], visited | {neighbor})

    for start in starts:
        dfs(start, [start], {start})

    return best_path


def graph_metrics(nodes: List[Dict], edges: List[Dict]) -> Dict[str, object]:
    out_degree, in_degree, outgoing, node_ids = build_degree_maps(nodes, edges)
    max_fan_out = max(out_degree.values(), default=0)
    max_fan_in = max(in_degree.values(), default=0)
    has_cycle = graph_has_cycle(outgoing, node_ids)
    entry_nodes = [node_id for node_id in node_ids if in_degree[node_id] == 0]
    single_entry = len(entry_nodes) == 1
    critical_nodes = critical_path_nodes(outgoing, node_ids, in_degree)
    critical_non_entry = [node_id for node_id in critical_nodes if in_degree[node_id] > 0]
    has_no_redundancy = bool(critical_non_entry) and all(in_degree[node_id] == 1 for node_id in critical_non_entry)
    avg_failure_rate = (
        sum(get_node_failure_rate(node) for node in nodes) / len(nodes)
        if nodes
        else 5.0
    )
    high_latency_edges = [edge for edge in edges if get_edge_latency(edge) > 150.0]

    return {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "max_fan_out": max_fan_out,
        "max_fan_in": max_fan_in,
        "has_cycle": has_cycle,
        "entry_count": len(entry_nodes),
        "single_entry": single_entry,
        "has_no_redundancy": has_no_redundancy,
        "avg_failure_rate": avg_failure_rate,
        "high_latency_edge_count": len(high_latency_edges),
    }


def classify_graph(nodes: List[Dict], edges: List[Dict]) -> str:
    metrics = graph_metrics(nodes, edges)

    # RULE 1: Thundering Herd
    if metrics["single_entry"] and metrics["max_fan_out"] >= 4 and metrics["node_count"] >= 6:
        return "thundering_herd"

    # RULE 2: Retry Storm
    if metrics["has_cycle"] and metrics["high_latency_edge_count"] >= 2:
        return "retry_storm"

    # RULE 3: Cascading Failure
    if metrics["max_fan_in"] >= 3 and metrics["has_no_redundancy"] and metrics["avg_failure_rate"] >= 5.0:
        return "cascading_failure"

    # RULE 4: Stable
    return "stable"


def classify_label(graph: Dict) -> str:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    return classify_graph(nodes, edges)


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
    labelled_graphs: List[tuple[Path, Dict]] = []
    examples_by_label: Dict[str, List[Tuple[str, Dict[str, object]]]] = defaultdict(list)
    for graph_path in iter_graph_files(graphs_dir):
        try:
            graph = json.loads(graph_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        labelled = label_graph(graph)
        labelled_graphs.append((graph_path, labelled))
        label = labelled.get("label", "stable")
        examples_by_label[label].append((graph_path.name, graph_metrics(graph.get("nodes", []), graph.get("edges", []))))
        labelled_count += 1

    label_counts: Counter[str] = Counter()
    for graph_path, labelled in labelled_graphs:
        graph_path.write_text(json.dumps(labelled, ensure_ascii=True), encoding="utf-8")
        label_counts[labelled.get("label", "MISSING")] += 1

    print(f"Labelled {labelled_count} graphs in {graphs_dir}")
    print("Label summary:")
    label_order = ["thundering_herd", "cascading_failure", "retry_storm", "stable"]
    for label in label_order:
        print(f"  {label}: {label_counts.get(label, 0)}")

    print("Example graphs per class (up to 10):")
    for label in label_order:
        print(f"{label} examples:")
        examples = examples_by_label.get(label, [])[:10]
        if not examples:
            print("  (none)")
            continue
        for graph_name, metrics in examples:
            print(
                "  "
                f"{graph_name} | nodes={metrics['node_count']} edges={metrics['edge_count']} "
                f"fan_out={metrics['max_fan_out']} fan_in={metrics['max_fan_in']} "
                f"cycle={metrics['has_cycle']} entry={metrics['entry_count']} "
                f"no_redundancy={metrics['has_no_redundancy']} "
                f"avg_failure={float(metrics['avg_failure_rate']):.2f} "
                f"high_latency_edges={metrics['high_latency_edge_count']}"
            )


if __name__ == "__main__":
    main()
