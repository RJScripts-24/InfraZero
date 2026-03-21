import json
import os
from collections import Counter
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


def longest_path_hops(outgoing: Dict[str, List[str]], node_ids: Set[str]) -> int:
    """Returns the longest simple path length in hops (edges)."""
    longest = 0

    def dfs(node_id: str, visited: Set[str], hops: int) -> None:
        nonlocal longest
        if hops > longest:
            longest = hops

        for neighbor in outgoing.get(node_id, []):
            if neighbor in visited:
                continue
            dfs(neighbor, visited | {neighbor}, hops + 1)

    for node_id in node_ids:
        dfs(node_id, {node_id}, 0)
    return longest


def classify_label(graph: Dict) -> str:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not nodes:
        return "stable"

    outgoing, incoming = build_adjacency(graph)
    node_ids = {node.get("id") for node in nodes if node.get("id")}
    entry_nodes = [node_id for node_id in node_ids if len(incoming.get(node_id, [])) == 0]

    # 1) thundering_herd
    for node in nodes:
        node_id = node.get("id")
        if node_id and len(outgoing.get(node_id, [])) > 3:
            return "thundering_herd"

    if len(nodes) > 8 and len(entry_nodes) == 1:
        return "thundering_herd"

    # 2) cascading_failure
    for node in nodes:
        node_id = node.get("id")
        if node_id and len(incoming.get(node_id, [])) > 2:
            return "cascading_failure"

    for node in nodes:
        if to_float(node.get("failureRatePercent"), 5.0) > 5.0:
            return "cascading_failure"

    if longest_path_hops(outgoing, node_ids) > 3:
        return "cascading_failure"

    # 3) retry_storm
    if graph_has_cycle(outgoing, node_ids):
        return "retry_storm"

    for edge in edges:
        if to_float(edge.get("latencyMs"), 50.0) > 100.0:
            return "retry_storm"

    if len(nodes) < 3:
        return "retry_storm"

    # 4) stable
    return "stable"


def score_for_label(graph: Dict, label: str) -> float:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    outgoing, incoming = build_adjacency(graph)
    node_ids = {node.get("id") for node in nodes if node.get("id")}

    max_fan_out = max((len(outgoing.get(node_id, [])) for node_id in node_ids), default=0)
    max_fan_in = max((len(incoming.get(node_id, [])) for node_id in node_ids), default=0)
    max_failure = max((to_float(node.get("failureRatePercent"), 5.0) for node in nodes), default=5.0)
    max_latency = max((to_float(edge.get("latencyMs"), 50.0) for edge in edges), default=50.0)
    path_hops = longest_path_hops(outgoing, node_ids)
    entry_nodes = sum(1 for node_id in node_ids if len(incoming.get(node_id, [])) == 0)
    has_cycle = 1.0 if graph_has_cycle(outgoing, node_ids) else 0.0

    if label == "thundering_herd":
        return float(max_fan_out) + (2.0 if len(nodes) > 8 and entry_nodes == 1 else 0.0)
    if label == "cascading_failure":
        return float(max_fan_in) + max(0.0, max_failure - 5.0) + max(0.0, float(path_hops - 3))
    if label == "retry_storm":
        return (has_cycle * 10.0) + max(0.0, (max_latency - 100.0) / 10.0) + (5.0 if len(nodes) < 3 else 0.0)
    return 0.0


def target_distribution(total: int, labels: List[str]) -> Dict[str, int]:
    base = total // len(labels)
    remainder = total % len(labels)
    targets = {label: base for label in labels}
    for i in range(remainder):
        targets[labels[i]] += 1
    return targets


def rebalance_labelled_graphs(labelled_graphs: List[Dict]) -> List[Dict]:
    if not labelled_graphs:
        return labelled_graphs

    labels = ["thundering_herd", "cascading_failure", "retry_storm", "stable"]
    targets = target_distribution(len(labelled_graphs), labels)
    counts = Counter(graph.get("label", "stable") for graph in labelled_graphs)

    # Keep ordering deterministic for reproducibility.
    indexed_graphs = list(enumerate(labelled_graphs))
    indexed_graphs.sort(key=lambda pair: str(pair[1].get("graph_id", pair[0])))

    while True:
        deficits = {label: targets[label] - counts.get(label, 0) for label in labels}
        deficit_labels = [label for label in labels if deficits[label] > 0]
        surplus_labels = [label for label in labels if counts.get(label, 0) > targets[label]]
        if not deficit_labels or not surplus_labels:
            break

        deficit_labels.sort(key=lambda lbl: deficits[lbl], reverse=True)
        moved = False

        for to_label in deficit_labels:
            best_idx = None
            best_from = None
            best_score = float("-inf")

            for idx, graph in indexed_graphs:
                from_label = graph.get("label", "stable")
                if from_label not in surplus_labels:
                    continue
                if counts.get(from_label, 0) <= targets[from_label]:
                    continue

                score = score_for_label(graph, to_label)
                if score > best_score:
                    best_score = score
                    best_idx = idx
                    best_from = from_label

            if best_idx is None or best_from is None:
                continue

            labelled_graphs[best_idx]["label"] = to_label
            counts[best_from] -= 1
            counts[to_label] += 1
            moved = True
            break

        if not moved:
            break

    return labelled_graphs


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
    for graph_path in iter_graph_files(graphs_dir):
        try:
            graph = json.loads(graph_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        labelled_graphs.append((graph_path, label_graph(graph)))
        labelled_count += 1

    balanced_only = [graph for _, graph in labelled_graphs]
    rebalance_enabled = os.getenv("REBALANCE_LABELS", "1") != "0"
    if rebalance_enabled:
        balanced_only = rebalance_labelled_graphs(balanced_only)

    label_counts: Counter[str] = Counter()
    for i, (graph_path, _) in enumerate(labelled_graphs):
        labelled = balanced_only[i]
        graph_path.write_text(json.dumps(labelled, ensure_ascii=True), encoding="utf-8")
        label_counts[labelled.get("label", "MISSING")] += 1

    print(f"Labelled {labelled_count} graphs in {graphs_dir}")
    print(f"Rebalanced: {'yes' if rebalance_enabled else 'no'}")
    print("Label summary:")
    for label in ["thundering_herd", "cascading_failure", "retry_storm", "stable"]:
        print(f"  {label}: {label_counts.get(label, 0)}")


if __name__ == "__main__":
    main()
