import json
import os
from collections import Counter
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

import requests
import yaml

from label_graphs import label_graph

ROOT_DIR = Path(__file__).resolve().parents[1]
ADDITIONAL_QUERIES = [
    "topic:microservices topic:architecture",
    "topic:distributed-systems stars:>50",
    "topic:system-design stars:>100",
    "docker-compose microservices filename:docker-compose.yml stars:>30",
]


def resolve_dir(path_value: str) -> Path:
    path = Path(path_value)
    if not path.is_absolute():
        path = (ROOT_DIR / path).resolve()
    return path


def infer_source(path_value: str) -> str:
    lowered = path_value.lower()
    if "trainticket" in lowered or "train-ticket" in lowered or "train_ticket" in lowered:
        return "trainticket"
    if "deathstar" in lowered or "death-star" in lowered or "death_star" in lowered:
        return "deathstar"
    if "online-boutique" in lowered or "online_boutique" in lowered or "boutique" in lowered:
        return "online-boutique"
    return "trainticket"


def infer_type(service_name: str) -> str:
    lowered = service_name.lower()
    if any(token in lowered for token in ["db", "mongo", "mysql", "postgres"]):
        return "PostgreSQL"
    if any(token in lowered for token in ["redis", "cache"]):
        return "Cache"
    if any(token in lowered for token in ["rabbit", "kafka", "queue"]):
        return "RabbitMQ"
    if any(token in lowered for token in ["gateway", "proxy", "nginx"]):
        return "Gateway"
    if any(token in lowered for token in ["frontend", "ui"]):
        return "Service"
    return "Service"


def make_node(node_id: str) -> Dict:
    return {
        "id": node_id,
        "data": {
            "label": node_id.replace("-", " ").title(),
            "type": infer_type(node_id),
            "processingPowerMs": 100,
            "failureRatePercent": 5,
            "coldStartLatencyMs": 200,
        },
    }


def make_edge(source: str, target: str) -> Dict:
    return {
        "id": f"e-{source}-{target}",
        "source": source,
        "target": target,
        "latencyMs": 50,
        "packetLossPercent": 1,
    }


def parse_docker_compose(filepath: str) -> Optional[Dict]:
    path = Path(filepath)
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return None

    services = payload.get("services", {}) if isinstance(payload, dict) else {}
    if not isinstance(services, dict) or not services:
        return None

    nodes = [make_node(service_name) for service_name in sorted(services.keys())]
    edges: List[Dict] = []
    seen_edges: Set[Tuple[str, str]] = set()

    for target, config in services.items():
        if not isinstance(config, dict):
            continue

        depends_on = config.get("depends_on", [])
        dependencies: List[str] = []
        if isinstance(depends_on, list):
            dependencies = [dep for dep in depends_on if isinstance(dep, str)]
        elif isinstance(depends_on, dict):
            dependencies = [dep for dep in depends_on.keys() if isinstance(dep, str)]

        for source in dependencies:
            edge_key = (source, target)
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)
            edges.append(make_edge(source, target))

    return {
        "nodes": nodes,
        "edges": edges,
        "label": "stable",
        "source": infer_source(str(path)),
    }


def iter_yaml_documents(path: Path) -> Iterable[Dict]:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return []

    try:
        docs = list(yaml.safe_load_all(content))
    except yaml.YAMLError:
        return []

    return [doc for doc in docs if isinstance(doc, dict)]


def parse_kubernetes_manifests(dirpath: str) -> Optional[Dict]:
    base = Path(dirpath)
    yaml_files = sorted(list(base.rglob("*.yaml")) + list(base.rglob("*.yml")))
    if not yaml_files:
        return None

    deployment_name_to_app: Dict[str, str] = {}
    app_to_deployments: Dict[str, Set[str]] = {}
    service_name_to_selector_app: Dict[str, str] = {}

    for yaml_file in yaml_files:
        for doc in iter_yaml_documents(yaml_file):
            kind = str(doc.get("kind", "")).strip().lower()
            metadata = doc.get("metadata", {}) if isinstance(doc.get("metadata", {}), dict) else {}
            name = metadata.get("name")
            if not isinstance(name, str) or not name:
                continue

            if kind == "deployment":
                app_label = ""
                metadata_labels = metadata.get("labels", {})
                if isinstance(metadata_labels, dict):
                    app_label = str(metadata_labels.get("app", "") or "")

                if not app_label:
                    spec = doc.get("spec", {}) if isinstance(doc.get("spec", {}), dict) else {}
                    template = spec.get("template", {}) if isinstance(spec.get("template", {}), dict) else {}
                    template_meta = (
                        template.get("metadata", {}) if isinstance(template.get("metadata", {}), dict) else {}
                    )
                    template_labels = (
                        template_meta.get("labels", {})
                        if isinstance(template_meta.get("labels", {}), dict)
                        else {}
                    )
                    app_label = str(template_labels.get("app", "") or "")

                deployment_name_to_app[name] = app_label
                if app_label:
                    app_to_deployments.setdefault(app_label, set()).add(name)

            elif kind == "service":
                spec = doc.get("spec", {}) if isinstance(doc.get("spec", {}), dict) else {}
                selector = spec.get("selector", {}) if isinstance(spec.get("selector", {}), dict) else {}
                app_label = selector.get("app")
                if isinstance(app_label, str) and app_label:
                    service_name_to_selector_app[name] = app_label

    node_ids: Set[str] = set(deployment_name_to_app.keys()) | set(service_name_to_selector_app.keys())
    if len(node_ids) < 2:
        return None

    nodes = [make_node(node_id) for node_id in sorted(node_ids)]
    edges: List[Dict] = []
    seen_edges: Set[Tuple[str, str]] = set()

    for service_name, app_label in service_name_to_selector_app.items():
        targets = app_to_deployments.get(app_label, set())
        for deployment_name in sorted(targets):
            edge_key = (service_name, deployment_name)
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)
            edges.append(make_edge(service_name, deployment_name))

    return {
        "nodes": nodes,
        "edges": edges,
        "label": "stable",
        "source": infer_source(str(base)),
    }


def to_label_graph_input(graph: Dict) -> Dict:
    nodes = []
    for node in graph.get("nodes", []):
        data = node.get("data", {}) if isinstance(node.get("data", {}), dict) else {}
        nodes.append(
            {
                "id": node.get("id"),
                "type": data.get("type", "Service"),
                "failureRatePercent": data.get("failureRatePercent", 5),
            }
        )

    edges = []
    for edge in graph.get("edges", []):
        edges.append(
            {
                "from": edge.get("source"),
                "to": edge.get("target"),
                "latencyMs": edge.get("latencyMs", 50),
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "source": graph.get("source", "trainticket"),
    }


def crawl_benchmarks(benchmarks_dir: str, output_dir: str) -> int:
    benchmarks_path = resolve_dir(benchmarks_dir)
    output_path = resolve_dir(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    parsed_graphs: List[Dict] = []
    seen_shapes: Set[Tuple[int, int]] = set()
    source_counter: Counter[str] = Counter()

    docker_files = sorted(
        [
            p
            for p in benchmarks_path.rglob("*")
            if p.is_file() and p.name.lower() in {"docker-compose.yml", "docker-compose.yaml"}
        ]
    )
    for docker_file in docker_files:
        graph = parse_docker_compose(str(docker_file))
        if not graph:
            continue
        shape = (len(graph.get("nodes", [])), len(graph.get("edges", [])))
        if shape in seen_shapes:
            continue
        seen_shapes.add(shape)
        parsed_graphs.append(graph)

    k8s_dirs: List[Path] = []
    for directory in benchmarks_path.rglob("*"):
        if not directory.is_dir():
            continue
        yaml_count = sum(1 for file_path in directory.iterdir() if file_path.suffix.lower() in {".yaml", ".yml"})
        if yaml_count >= 2:
            k8s_dirs.append(directory)

    for k8s_dir in sorted(k8s_dirs):
        graph = parse_kubernetes_manifests(str(k8s_dir))
        if not graph:
            continue
        shape = (len(graph.get("nodes", [])), len(graph.get("edges", [])))
        if shape in seen_shapes:
            continue
        seen_shapes.add(shape)
        parsed_graphs.append(graph)

    for index, graph in enumerate(parsed_graphs, start=1):
        labelled = label_graph(to_label_graph_input(graph))
        graph["label"] = labelled.get("label", "stable")

        source = graph.get("source", "trainticket")
        source_counter[source] += 1
        output_file = output_path / f"benchmark_{source}_{index}.json"
        output_file.write_text(json.dumps(graph, ensure_ascii=True), encoding="utf-8")

    print("Benchmark parse summary:")
    for source in sorted(source_counter.keys()):
        print(f"  {source}: {source_counter[source]}")
    print(f"  total_saved: {len(parsed_graphs)}")

    return len(parsed_graphs)


def fetch_awesome_lists() -> int:
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if not token:
        print("Skipping GitHub extra fetch: GITHUB_TOKEN not set")
        return 0

    session = requests.Session()
    session.headers.update(
        {
            "Accept": "application/vnd.github+json",
            "Authorization": f"token {token}",
            "User-Agent": "InfraZero-Benchmark-Fetcher/1.0",
        }
    )

    raw_dir = resolve_dir("./data/raw/github_extra")
    raw_dir.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    seen_repos: Set[str] = set()

    for query in ADDITIONAL_QUERIES:
        try:
            response = session.get(
                "https://api.github.com/search/repositories",
                params={"q": query, "per_page": 20},
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            print(f"GitHub query failed for '{query}': {exc}")
            continue

        for item in payload.get("items", []):
            full_name = item.get("full_name")
            default_branch = item.get("default_branch", "main")
            if not isinstance(full_name, str) or not full_name or full_name in seen_repos:
                continue

            seen_repos.add(full_name)
            owner_repo = full_name.split("/", 1)
            if len(owner_repo) != 2:
                continue
            owner, repo = owner_repo

            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/docker-compose.yml"
            try:
                file_resp = session.get(raw_url, timeout=30)
                if file_resp.status_code != 200:
                    continue
            except requests.RequestException:
                continue

            safe_name = full_name.replace("/", "__")
            output_file = raw_dir / f"{safe_name}_docker-compose.yml"
            output_file.write_text(file_resp.text, encoding="utf-8")
            downloaded += 1

    print(f"GitHub extra docker-compose files downloaded: {downloaded}")
    return downloaded


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv(dotenv_path=ROOT_DIR / ".env")
    benchmarks_dir = os.getenv("BENCHMARKS_DIR", "./data/benchmarks")
    graphs_dir = os.getenv("GRAPHS_OUTPUT_DIR", "./data/graphs")

    os.makedirs(resolve_dir(graphs_dir), exist_ok=True)
    crawl_benchmarks(benchmarks_dir, graphs_dir)
    fetch_awesome_lists()

    graph_files = [p for p in resolve_dir(graphs_dir).glob("*.json") if p.is_file()]
    print(f"Total graphs in dataset: {len(graph_files)}")