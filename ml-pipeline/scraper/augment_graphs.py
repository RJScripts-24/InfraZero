import copy
import json
import random
import uuid
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from label_graphs import label_graph

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
LABELLED_PATH = DATA_DIR / "labelled_graphs.jsonl"
AUGMENTED_PATH = DATA_DIR / "augmented_graphs.jsonl"


def iter_graphs(path: Path) -> Iterable[Dict]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def make_rng(graph: Dict, salt: str) -> random.Random:
    seed_material = f"{graph.get('graph_id', '')}:{salt}"
    return random.Random(seed_material)


def rehydrate_graph(labelled_graph: Dict) -> Dict:
    return {
        "graph_id": labelled_graph["graph_id"],
        "source_repo": labelled_graph.get("source_repo", "unknown"),
        "nodes": copy.deepcopy(labelled_graph.get("nodes", [])),
        "edges": copy.deepcopy(labelled_graph.get("edges", [])),
    }


def relabel_mutation(graph: Dict, suffix: str) -> Dict:
    mutated = copy.deepcopy(graph)
    mutated["graph_id"] = f"{graph['graph_id']}__{suffix}__{uuid.uuid4().hex[:8]}"
    return label_graph(mutated)


def mutate_remove_random_node(graph: Dict) -> Dict:
    mutated = rehydrate_graph(graph)
    rng = make_rng(graph, "remove_random_node")
    eligible = [
        node
        for node in mutated["nodes"]
        if node.get("type") not in {"client", "database", "load_balancer"}
    ]
    if not eligible:
        eligible = [node for node in mutated["nodes"] if node.get("type") != "database"]
    if not eligible:
        return relabel_mutation(mutated, "remove_random_node")

    target = rng.choice(eligible)
    target_id = target["id"]
    mutated["nodes"] = [node for node in mutated["nodes"] if node["id"] != target_id]
    mutated["edges"] = [
        edge
        for edge in mutated["edges"]
        if edge.get("from") != target_id and edge.get("to") != target_id
    ]
    return relabel_mutation(mutated, "remove_random_node")


def mutate_add_cache(graph: Dict) -> Dict:
    mutated = rehydrate_graph(graph)
    if any(node.get("type") == "cache" for node in mutated["nodes"]):
        return relabel_mutation(mutated, "add_cache")

    compute_nodes = [node for node in mutated["nodes"] if node.get("type") == "compute"]
    database_nodes = [node for node in mutated["nodes"] if node.get("type") == "database"]
    if not compute_nodes or not database_nodes:
        return relabel_mutation(mutated, "add_cache")

    compute_node = compute_nodes[0]
    database_node = database_nodes[0]
    cache_id = f"cache_{uuid.uuid4().hex[:8]}"
    mutated["nodes"].append(
        {
            "id": cache_id,
            "type": "cache",
            "label": "Injected Cache",
        }
    )

    removed = False
    new_edges: List[Dict] = []
    for edge in mutated["edges"]:
        if (
            not removed
            and edge.get("from") == compute_node["id"]
            and edge.get("to") == database_node["id"]
        ):
            removed = True
            continue
        new_edges.append(edge)
    mutated["edges"] = new_edges
    mutated["edges"].append({"from": compute_node["id"], "to": cache_id})
    mutated["edges"].append({"from": cache_id, "to": database_node["id"]})
    return relabel_mutation(mutated, "add_cache")


def mutate_add_replica(graph: Dict) -> Dict:
    mutated = rehydrate_graph(graph)
    database_nodes = [node for node in mutated["nodes"] if node.get("type") == "database"]
    if not database_nodes:
        return relabel_mutation(mutated, "add_replica")

    original_db = database_nodes[0]
    replica_id = f"{original_db['id']}_replica_{uuid.uuid4().hex[:6]}"
    mutated["nodes"].append(
        {
            "id": replica_id,
            "type": "database",
            "label": f"{original_db.get('label', 'Database')} Replica",
        }
    )

    compute_ids = [node["id"] for node in mutated["nodes"] if node.get("type") == "compute"]
    for compute_id in compute_ids:
        mutated["edges"].append({"from": compute_id, "to": replica_id})

    return relabel_mutation(mutated, "add_replica")


def mutate_remove_lb(graph: Dict) -> Dict:
    mutated = rehydrate_graph(graph)
    lb_nodes = [node for node in mutated["nodes"] if node.get("type") == "load_balancer"]
    if not lb_nodes:
        return relabel_mutation(mutated, "remove_lb")

    lb_node = lb_nodes[0]
    lb_id = lb_node["id"]
    incoming = [edge["from"] for edge in mutated["edges"] if edge.get("to") == lb_id]
    outgoing = [edge["to"] for edge in mutated["edges"] if edge.get("from") == lb_id]

    mutated["nodes"] = [node for node in mutated["nodes"] if node["id"] != lb_id]
    mutated["edges"] = [
        edge
        for edge in mutated["edges"]
        if edge.get("from") != lb_id and edge.get("to") != lb_id
    ]

    existing_edges = {(edge["from"], edge["to"]) for edge in mutated["edges"]}
    for source in incoming:
        for target in outgoing:
            if source == target:
                continue
            edge_key = (source, target)
            if edge_key in existing_edges:
                continue
            mutated["edges"].append({"from": source, "to": target})
            existing_edges.add(edge_key)

    return relabel_mutation(mutated, "remove_lb")


def main() -> None:
    original_graphs = list(iter_graphs(LABELLED_PATH))
    augmented_graphs: List[Dict] = []

    for graph in original_graphs:
        base_graph = rehydrate_graph(graph)
        augmented_graphs.append(label_graph(base_graph))
        augmented_graphs.append(mutate_remove_random_node(graph))
        augmented_graphs.append(mutate_add_cache(graph))
        augmented_graphs.append(mutate_add_replica(graph))
        augmented_graphs.append(mutate_remove_lb(graph))

    AUGMENTED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with AUGMENTED_PATH.open("w", encoding="utf-8") as handle:
        for graph in augmented_graphs:
            handle.write(json.dumps(graph, ensure_ascii=True) + "\n")

    pass_count = sum(1 for graph in augmented_graphs if graph.get("pass_fail") == "PASS")
    fail_count = sum(1 for graph in augmented_graphs if graph.get("pass_fail") == "FAIL")
    print(
        f"Original: {len(original_graphs)} | After augmentation: {len(augmented_graphs)} | PASS: {pass_count} | FAIL: {fail_count}"
    )


if __name__ == "__main__":
    main()
