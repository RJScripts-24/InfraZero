import copy
import json
import os
import random
import uuid
from pathlib import Path
from typing import Dict, Iterable, List

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

ROOT_DIR = Path(__file__).resolve().parents[1]


def resolve_graphs_dir() -> Path:
    graphs_dir = Path(os.getenv("GRAPHS_OUTPUT_DIR", "./data/graphs"))
    if not graphs_dir.is_absolute():
        graphs_dir = (ROOT_DIR / graphs_dir).resolve()
    return graphs_dir


def iter_graphs(path: Path) -> Iterable[Dict]:
    if not path.exists():
        return []

    for file_path in sorted(path.glob("*.json")):
        if not file_path.is_file():
            continue
        try:
            yield json.loads(file_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue


def make_rng(graph: Dict, salt: str) -> random.Random:
    seed_material = f"{graph.get('graph_id', '')}:{salt}"
    return random.Random(seed_material)


def rehydrate_graph(labelled_graph: Dict) -> Dict:
    return {
        "graph_id": labelled_graph["graph_id"],
        "source_repo": labelled_graph.get("source_repo", "unknown"),
        "nodes": copy.deepcopy(labelled_graph.get("nodes", [])),
        "edges": copy.deepcopy(labelled_graph.get("edges", [])),
        "label": labelled_graph.get("label", "stable"),
    }


def relabel_mutation(graph: Dict, suffix: str) -> Dict:
    mutated = copy.deepcopy(graph)
    mutated["graph_id"] = f"{graph['graph_id']}__{suffix}__{uuid.uuid4().hex[:8]}"
    mutated["label"] = graph.get("label", "stable")
    return mutated


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
    graphs_dir = resolve_graphs_dir()
    os.makedirs(graphs_dir, exist_ok=True)
    original_graphs = list(iter_graphs(graphs_dir))
    augmented_graphs: List[Dict] = []

    for graph in original_graphs:
        base_graph = rehydrate_graph(graph)
        augmented_graphs.append(base_graph)
        augmented_graphs.append(mutate_remove_random_node(graph))
        augmented_graphs.append(mutate_add_cache(graph))
        augmented_graphs.append(mutate_add_replica(graph))
        augmented_graphs.append(mutate_remove_lb(graph))

    augmented_dir = graphs_dir / "augmented"
    os.makedirs(augmented_dir, exist_ok=True)
    augmented_path = augmented_dir / "augmented_graphs.jsonl"
    with augmented_path.open("w", encoding="utf-8") as handle:
        for graph in augmented_graphs:
            handle.write(json.dumps(graph, ensure_ascii=True) + "\n")

    print(
        f"Original: {len(original_graphs)} | After augmentation: {len(augmented_graphs)} | Output: {augmented_path}"
    )


if __name__ == "__main__":
    main()
