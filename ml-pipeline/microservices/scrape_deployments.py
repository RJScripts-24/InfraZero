"""Collect architecture graphs from real deployed systems on GitHub.

Why this exists
---------------
The Alibaba traces teach the grader what *latency* a request path carries under
real production traffic. What they cannot teach it is what an architecture
diagram looks like, because a call trace has no vocabulary for the things people
actually draw: a WAF, a load balancer, a CDN edge, a Hadoop batch tier. A trace
records `rpctype` in {rpc, http, db, mc, mq} and nothing else.

Deployment manifests are the missing half. A `docker-compose.yml` or a set of
Kubernetes manifests *is* an architecture diagram in machine-readable form: it
names real components (`nginx`, `postgres`, `redis`, `kafka`), states how they
are wired, and describes a system somebody actually deployed and served traffic
with. They are also the right size -- real systems run 20-60 services, where
Alibaba call graphs are mostly 8-15 nodes.

What this does NOT give you
---------------------------
No latency ground truth. A manifest says how a system is built, never how well
it performed. So these graphs are not a second source of risk labels, and they
must not be labelled by heuristic and mixed into the trace-derived training set
as though they were measured -- that is precisely the shortcut the earlier
iteration of this project took, and it is why its 85.7% did not mean much.

They are used for what they can honestly support: learning the component
vocabulary and the shape of real deployments.

Rate limits
-----------
Search is the scarce resource (30 requests/minute). Raw file content is fetched
from raw.githubusercontent.com, which does not count against the API quota, so
discovery is the bottleneck and download is effectively free.

Run:  python -m microservices.scrape_deployments --target 3000
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

import requests
import yaml

from .config import DATASET_DIR, ML_PIPELINE_DIR

DEPLOYMENTS_DIR = DATASET_DIR / "deployments"
DEPLOYMENTS_FILE = DEPLOYMENTS_DIR / "deployments.jsonl"
SEEN_FILE = DEPLOYMENTS_DIR / "seen.json"

GITHUB_API = "https://api.github.com"
RAW_BASE = "https://raw.githubusercontent.com"

SEARCH_PAUSE_SECONDS = 2.2  # keeps us under 30 search requests/minute

MIN_SERVICES = 4
MAX_SERVICES = 120


# --------------------------------------------------------------------------- #
# Component typing
#
# Mirrors scraper/parse_benchmarks.py:infer_node_type so that manifest graphs
# and the existing benchmark corpus describe components the same way. Emits the
# InfraZero canvas vocabulary, which microservices.features already knows how to
# map onto model roles.
# --------------------------------------------------------------------------- #

TYPE_RULES: Tuple[Tuple[Tuple[str, ...], str], ...] = (
    (("postgres", "mysql", "mongo", "mariadb", "cockroach", "cassandra",
      "oracle", "mssql", "sqlite", "couchdb", "influx", "clickhouse",
      "elasticsearch", "opensearch", "neo4j", "dynamodb", "database",
      "-db", "_db", "db-"), "PostgreSQL"),
    (("redis", "memcach", "hazelcast", "varnish", "cache", "ehcache"), "Cache"),
    (("rabbit", "kafka", "zookeeper", "nats", "pulsar", "activemq",
      "sqs", "queue", "broker", "amqp", "celery-broker"), "RabbitMQ"),
    (("nginx", "traefik", "haproxy", "envoy", "istio", "kong",
      "ambassador", "ingress", "apisix", "caddy"), "Infrastructure"),
    (("gateway", "api-gw", "apigw", "bff", "zuul", "gateway-service"), "Gateway"),
    (("worker", "celery", "sidekiq", "cron", "batch", "scheduler",
      "consumer", "job", "spark", "hadoop", "flink", "airflow"), "Background Job"),
    (("cdn", "cloudfront", "fastly", "akamai"), "Edge Network"),
    (("prometheus", "grafana", "jaeger", "zipkin", "kibana", "logstash",
      "fluentd", "loki", "datadog"), "Background Job"),
)


def infer_component_type(name: str, image: str = "") -> str:
    """Map a service name / container image onto an InfraZero node type."""

    combined = f"{name} {image}".lower()
    for needles, node_type in TYPE_RULES:
        for needle in needles:
            if needle in combined:
                return node_type
    return "Service"


# --------------------------------------------------------------------------- #
# docker-compose -> graph
# --------------------------------------------------------------------------- #


def parse_compose(document: Dict, source: str) -> Optional[Dict]:
    """Turn a docker-compose document into a node/edge graph.

    Edges come from `depends_on` and `links`, which is compose's own statement
    of what talks to what.
    """

    services = document.get("services")
    if not isinstance(services, dict) or not (MIN_SERVICES <= len(services) <= MAX_SERVICES):
        return None

    nodes = []
    edges = []
    known = set(services.keys())

    for name, spec in services.items():
        if not isinstance(spec, dict):
            spec = {}
        image = str(spec.get("image", "") or "")
        build = spec.get("build")
        if not image and build:
            image = str(build if isinstance(build, str) else build.get("context", ""))
        nodes.append(
            {
                "id": name,
                "data": {"label": name, "type": infer_component_type(name, image)},
            }
        )

        dependencies: List[str] = []
        depends = spec.get("depends_on")
        if isinstance(depends, dict):
            dependencies.extend(depends.keys())
        elif isinstance(depends, list):
            dependencies.extend(str(d) for d in depends)
        links = spec.get("links")
        if isinstance(links, list):
            dependencies.extend(str(link).split(":")[0] for link in links)

        for dependency in dependencies:
            if dependency in known and dependency != name:
                edges.append({"source": name, "target": dependency})

    if len(edges) < 2:
        return None

    return {
        "nodes": nodes,
        "edges": edges,
        "source": source,
        "kind": "docker-compose",
    }


# --------------------------------------------------------------------------- #
# Kubernetes -> graph
# --------------------------------------------------------------------------- #

K8S_WORKLOADS = {"Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"}


def parse_kubernetes(documents: Iterable[Dict], source: str) -> Optional[Dict]:
    """Turn a bundle of Kubernetes manifests into a node/edge graph.

    Workloads become nodes. Edges are recovered from environment variables and
    container args that reference another workload's name -- which is how one
    Kubernetes service actually addresses another.
    """

    workloads: Dict[str, str] = {}   # name -> node type
    references: Dict[str, Set[str]] = {}

    for document in documents:
        if not isinstance(document, dict):
            continue
        if document.get("kind") not in K8S_WORKLOADS:
            continue

        metadata = document.get("metadata") or {}
        name = str(metadata.get("name", "")).strip()
        if not name:
            continue

        spec = document.get("spec") or {}
        template = (spec.get("template") or {}).get("spec") or {}
        # CronJob nests one level deeper.
        if not template:
            template = (
                ((spec.get("jobTemplate") or {}).get("spec") or {}).get("template") or {}
            ).get("spec") or {}
        containers = template.get("containers") or []
        if not isinstance(containers, list):
            containers = []

        image = ""
        blob_parts: List[str] = []
        for container in containers:
            if not isinstance(container, dict):
                continue
            image = image or str(container.get("image", "") or "")
            for env in container.get("env") or []:
                if isinstance(env, dict):
                    blob_parts.append(str(env.get("value", "")))
                    value_from = env.get("valueFrom") or {}
                    if isinstance(value_from, dict):
                        for holder in value_from.values():
                            if isinstance(holder, dict):
                                blob_parts.append(str(holder.get("name", "")))
            for arg in (container.get("args") or []) + (container.get("command") or []):
                blob_parts.append(str(arg))

        workloads[name] = infer_component_type(name, image)
        references[name] = set(re.findall(r"[a-z0-9][a-z0-9-]{2,}", " ".join(blob_parts).lower()))

    if not (MIN_SERVICES <= len(workloads) <= MAX_SERVICES):
        return None

    nodes = [
        {"id": name, "data": {"label": name, "type": node_type}}
        for name, node_type in workloads.items()
    ]

    edges = []
    for name, tokens in references.items():
        for other in workloads:
            if other != name and other.lower() in tokens:
                edges.append({"source": name, "target": other})

    if len(edges) < 2:
        return None

    return {
        "nodes": nodes,
        "edges": edges,
        "source": source,
        "kind": "kubernetes",
    }


# --------------------------------------------------------------------------- #
# GitHub discovery
# --------------------------------------------------------------------------- #


def load_token() -> str:
    token = os.getenv("GITHUB_TOKEN", "")
    if not token:
        env_path = ML_PIPELINE_DIR / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
                if line.strip().startswith("GITHUB_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip("\"'")
                    break
    if not token:
        raise SystemExit(
            "GITHUB_TOKEN not found. Set it in ml-pipeline/.env "
            "(needs only the public_repo scope)."
        )
    return token


def search_code(session: requests.Session, query: str, pages: int = 10) -> List[Tuple[str, str, str]]:
    """Return (repo_full_name, ref, path) for code-search hits."""

    found: List[Tuple[str, str, str]] = []
    for page in range(1, pages + 1):
        try:
            response = session.get(
                f"{GITHUB_API}/search/code",
                params={"q": query, "per_page": 100, "page": page},
                timeout=30,
            )
        except requests.RequestException as error:
            print(f"    ! search failed: {error}", file=sys.stderr)
            break

        if response.status_code == 403:
            # Secondary rate limit -- back off rather than hammering.
            wait = int(response.headers.get("Retry-After", "60"))
            print(f"    rate limited, sleeping {wait}s")
            time.sleep(wait)
            continue
        if response.status_code != 200:
            break

        items = response.json().get("items", [])
        if not items:
            break
        for item in items:
            repository = item.get("repository") or {}
            full_name = repository.get("full_name")
            path = item.get("path")
            if full_name and path:
                found.append((full_name, repository.get("default_branch") or "master", path))
        if len(items) < 100:
            break
        time.sleep(SEARCH_PAUSE_SECONDS)

    return found


def fetch_raw(session: requests.Session, repository: str, ref: str, path: str) -> Optional[str]:
    """Fetch file content from raw.githubusercontent (does not use API quota)."""

    for candidate_ref in (ref, "main", "master"):
        url = f"{RAW_BASE}/{repository}/{candidate_ref}/{path}"
        try:
            response = session.get(url, timeout=20)
        except requests.RequestException:
            continue
        if response.status_code == 200 and len(response.content) < 2_000_000:
            return response.text
    return None


def build_queries() -> List[str]:
    """Diverse queries, because code search caps any single query at 1000 hits."""

    queries: List[str] = []
    # Vary file size to slice the result space into distinct buckets.
    for low, high in ((300, 800), (800, 1500), (1500, 3000), (3000, 6000), (6000, 20000)):
        queries.append(f"filename:docker-compose.yml size:{low}..{high}")
        queries.append(f"filename:docker-compose.yaml size:{low}..{high}")
    for low, high in ((500, 2000), (2000, 6000), (6000, 20000)):
        queries.append(f"filename:deployment.yaml kubernetes size:{low}..{high}")
        queries.append(f'"kind: Deployment" filename:deployment.yml size:{low}..{high}')
    # Topic-flavoured queries surface systems rather than tutorials.
    for topic in ("microservices", "kubernetes", "helm", "platform", "saas"):
        queries.append(f"filename:docker-compose.yml {topic}")
    return queries


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape real deployment manifests into graphs.")
    parser.add_argument("--target", type=int, default=3000, help="Stop after this many graphs.")
    parser.add_argument("--pages", type=int, default=10, help="Search pages per query (100 each).")
    arguments = parser.parse_args()

    token = load_token()
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "InfraZero-architecture-grader",
        }
    )

    DEPLOYMENTS_DIR.mkdir(parents=True, exist_ok=True)

    seen: Set[str] = set()
    if SEEN_FILE.exists():
        seen = set(json.loads(SEEN_FILE.read_text(encoding="utf-8")))
    existing = 0
    if DEPLOYMENTS_FILE.exists():
        existing = sum(1 for _ in open(DEPLOYMENTS_FILE, encoding="utf-8"))
    print(f"resuming: {existing:,} graphs already collected, {len(seen):,} paths seen\n")

    collected = existing
    queries = build_queries()
    random.Random(42).shuffle(queries)

    with open(DEPLOYMENTS_FILE, "a", encoding="utf-8") as sink:
        for position, query in enumerate(queries, start=1):
            if collected >= arguments.target:
                break
            print(f"[{position}/{len(queries)}] {query}")
            hits = search_code(session, query, pages=arguments.pages)
            print(f"    {len(hits)} hits")

            added = 0
            for repository, ref, path in hits:
                if collected >= arguments.target:
                    break
                key = f"{repository}/{path}"
                if key in seen:
                    continue
                seen.add(key)

                content = fetch_raw(session, repository, ref, path)
                if not content:
                    continue

                graph = None
                try:
                    if "compose" in path.lower():
                        document = yaml.safe_load(content)
                        if isinstance(document, dict):
                            graph = parse_compose(document, key)
                    else:
                        documents = [
                            d for d in yaml.safe_load_all(content) if isinstance(d, dict)
                        ]
                        graph = parse_kubernetes(documents, key)
                except (yaml.YAMLError, ValueError, AttributeError):
                    continue

                if graph is None:
                    continue

                sink.write(json.dumps(graph, separators=(",", ":")) + "\n")
                collected += 1
                added += 1

            sink.flush()
            SEEN_FILE.write_text(json.dumps(sorted(seen)), encoding="utf-8")
            print(f"    +{added} graphs (total {collected:,})")
            time.sleep(SEARCH_PAUSE_SECONDS)

    print(f"\ncollected {collected:,} deployment graphs -> {DEPLOYMENTS_FILE}")


if __name__ == "__main__":
    main()
