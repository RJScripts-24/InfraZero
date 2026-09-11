"""Regression gate on REAL architectures, not synthetic ones.

Why this exists
---------------
`test_grading_sanity.py` checks the grader against hand-built controls -- a
deliberately excellent design, a deliberately terrible one, and transcriptions
of two published diagrams. Those all pass, and they should: they were built
clean. Real repositories are not clean, and the model has never been gated on
one.

This fetches the compose file from a handful of well-known systems, converts it
to a topology, and asserts a pinned expectation about the grade and the top
recommendation. A change that quietly moves Mastodon from F to A, or stops the
model recommending anything at all, fails here rather than in a demo.

Fixtures
--------
Every repository needs a live GitHub call, and an unauthenticated runner gets 60
requests an hour. So the fetched YAML is cached under
`data/real_repos/` and the test runs offline afterwards. Run once with
`--refresh` to populate or update the cache.

The expectations below are PINNED FROM A RUN, not from a specification. They
record what the model currently does so that a change to it is visible. When one
legitimately changes, update it here and say why in the commit.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import torch

from .config import CLASSES, DATASET_DIR, MODEL_PATH
from .model import ArchitectureGrader
from .recommend import recommend, score

FIXTURE_DIR = DATASET_DIR.parent / "real_repos"

# owner/repo -> candidate compose paths, tried in order.
REPOS: Dict[str, List[str]] = {
    # Expected to grade well: a store per service, loose coupling.
    "microservices-demo/microservices-demo": ["deploy/docker-compose/docker-compose.yml"],
    "dockersamples/example-voting-app": ["docker-compose.yml"],
    "GoogleCloudPlatform/microservices-demo": ["docker-compose.yml", "src/docker-compose.yml"],

    # Expected to grade badly: components sharing one store, or a long
    # synchronous chain.
    "mastodon/mastodon": ["docker-compose.yml"],
    "hoppscotch/hoppscotch": ["docker-compose.yml"],
    "getsentry/self-hosted": ["docker-compose.yml"],
    "appwrite/appwrite": ["docker-compose.yml"],
    "supabase/supabase": ["docker/docker-compose.yml"],

    # Mid-range, and useful because the model declines to recommend anything.
    "sqshq/piggymetrics": ["docker-compose.yml"],
    "spring-petclinic/spring-petclinic-microservices": ["docker-compose.yml"],

    # Named with a suffix, so these only resolve once compose discovery stops
    # matching the four canonical filenames exactly. A regression in that glob
    # shows up here as "could not be read".
    "paperless-ngx/paperless-ngx": [
        "docker/compose/docker-compose.postgres.yml",
        "docker/compose/docker-compose.sqlite.yml",
    ],
    "immich-app/immich": ["docker/docker-compose.yml"],
    "n8n-io/n8n": ["docker/compose/withPostgres/docker-compose.yml"],
}

# What the model does today. Not a specification -- a tripwire.
#
# `grade` is asserted only when it is listed; `min_recommendations` guards
# against the recommender silently going quiet, which is the failure mode that
# would be invisible from a grade alone.
EXPECTATIONS: Dict[str, Dict] = {
    "microservices-demo/microservices-demo": {"min_nodes": 5, "grade": "A"},
    "mastodon/mastodon": {"min_nodes": 4, "grade": "F", "min_recommendations": 1},
    "hoppscotch/hoppscotch": {"min_nodes": 3, "grade": "F", "min_recommendations": 1},
    "sqshq/piggymetrics": {"min_nodes": 5, "grade": "C"},
}

TYPE_RULES: List[Tuple[Tuple[str, ...], str]] = [
    (("postgres", "mysql", "mariadb", "mongo", "cockroach", "db", "sql"), "PostgreSQL"),
    (("redis", "memcached", "cache"), "Cache"),
    (("rabbit", "kafka", "nats", "queue", "amqp", "sqs"), "RabbitMQ"),
    (("nginx", "traefik", "haproxy", "envoy", "caddy"), "Infrastructure"),
    (("gateway", "ingress", "proxy", "edge"), "Gateway"),
    (("elastic", "search", "solr", "opensearch"), "PostgreSQL"),
    (("worker", "sidekiq", "celery", "job", "cron", "batch"), "Background Job"),
]


def infer_type(name: str, image: str = "") -> str:
    combined = (name + " " + image).lower()
    for needles, node_type in TYPE_RULES:
        if any(needle in combined for needle in needles):
            return node_type
    return "Service"


def fetch(owner_repo: str, path: str) -> Optional[str]:
    for branch in ("main", "master"):
        url = "https://raw.githubusercontent.com/{}/{}/{}".format(owner_repo, branch, path)
        try:
            with urllib.request.urlopen(url, timeout=25) as response:
                if response.status == 200:
                    return response.read().decode("utf-8", errors="replace")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            continue
    return None


def compose_to_topology(document: Dict, name: str):
    """Minimal compose -> canvas topology, mirroring the backend importer.

    Deliberately simple: services become nodes, `depends_on` and `links` become
    edges. It is not the TypeScript importer and does not try to be -- what is
    under test here is the model's behaviour on real-world shapes, not the
    importer.
    """

    services = document.get("services") or {}
    if not isinstance(services, dict) or not services:
        return None

    nodes = []
    for service_name, spec in services.items():
        spec = spec if isinstance(spec, dict) else {}
        image = str(spec.get("image", "") or "")
        replicas = 1
        deploy = spec.get("deploy")
        if isinstance(deploy, dict):
            try:
                replicas = max(1, int(deploy.get("replicas", 1)))
            except (TypeError, ValueError):
                replicas = 1
        nodes.append({
            "id": str(service_name),
            "data": {
                "label": str(service_name),
                "type": infer_type(str(service_name), image),
                "replicas": replicas,
            },
        })

    known = {node["id"] for node in nodes}
    edges = []
    for service_name, spec in services.items():
        spec = spec if isinstance(spec, dict) else {}
        targets = []
        depends = spec.get("depends_on")
        if isinstance(depends, list):
            targets.extend(str(t) for t in depends)
        elif isinstance(depends, dict):
            targets.extend(str(t) for t in depends.keys())
        links = spec.get("links")
        if isinstance(links, list):
            targets.extend(str(t).split(":")[0] for t in links)

        for target in targets:
            if target in known and target != service_name:
                edges.append({
                    "id": "{}->{}".format(service_name, target),
                    "source": str(service_name),
                    "target": target,
                })

    if len(nodes) < 2:
        return None
    return {"name": name, "nodes": nodes, "edges": edges}


def refresh_fixtures() -> int:
    try:
        import yaml
    except ImportError:
        print("PyYAML is required for --refresh: pip install pyyaml")
        return 1

    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for owner_repo, candidates in REPOS.items():
        topology = None
        for path in candidates:
            content = fetch(owner_repo, path)
            if not content or not content.strip():
                continue
            try:
                document = yaml.safe_load(content)
            except yaml.YAMLError:
                continue
            if not isinstance(document, dict):
                continue
            topology = compose_to_topology(document, owner_repo)
            if topology:
                break

        slug = owner_repo.replace("/", "__") + ".json"
        if topology is None:
            print("  {:<46} could not be read".format(owner_repo))
            continue
        with open(FIXTURE_DIR / slug, "w", encoding="utf-8") as handle:
            json.dump(topology, handle, indent=2)
        print("  {:<46} {} components, {} links".format(
            owner_repo, len(topology["nodes"]), len(topology["edges"])))
        written += 1

    print()
    print("  {} fixtures cached under {}".format(written, FIXTURE_DIR))
    print("  The test now runs offline. Re-run with --refresh to update.")
    return 0 if written else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Grade real repositories as a regression gate.")
    parser.add_argument("--refresh", action="store_true",
                        help="fetch compose files from GitHub and cache them")
    args = parser.parse_args()

    if args.refresh:
        print("Fetching compose files from GitHub ...")
        return refresh_fixtures()

    if not FIXTURE_DIR.exists() or not list(FIXTURE_DIR.glob("*.json")):
        print("No cached fixtures. Run once with --refresh to populate them:")
        print("    python -m microservices.test_real_repos --refresh")
        return 1

    if not MODEL_PATH.exists():
        print("No trained grader at " + str(MODEL_PATH))
        return 1

    checkpoint = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
    model = ArchitectureGrader(num_classes=len(CLASSES))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    failures: List[str] = []

    print("=" * 78)
    print("REAL REPOSITORIES -- grade and top recommendation")
    print("=" * 78)

    for fixture in sorted(FIXTURE_DIR.glob("*.json")):
        with open(fixture, "r", encoding="utf-8") as handle:
            topology = json.load(handle)

        name = topology.get("name", fixture.stem)
        nodes, edges = topology["nodes"], topology["edges"]
        expectation = EXPECTATIONS.get(name, {})

        try:
            risk, letter = score(model, nodes, edges)
            recommendations = recommend(model, nodes, edges)
        except (ValueError, AssertionError) as error:
            failures.append("{}: could not be graded ({})".format(name, error))
            print("  {:<46} ERROR {}".format(name, error))
            continue

        top = recommendations[0].summary if recommendations else "(no change recommended)"
        print("  {:<46} {} risk {:.2f}  {:>2} nodes".format(
            name, letter, risk, len(nodes)))
        print("      top change: {}".format(top[:70]))

        minimum_nodes = expectation.get("min_nodes")
        if minimum_nodes is not None and len(nodes) < minimum_nodes:
            failures.append("{}: only {} components parsed, expected at least {}".format(
                name, len(nodes), minimum_nodes))

        expected_grade = expectation.get("grade")
        if expected_grade and letter != expected_grade:
            failures.append("{}: graded {}, expected {}".format(name, letter, expected_grade))

        minimum_recommendations = expectation.get("min_recommendations")
        if minimum_recommendations is not None and len(recommendations) < minimum_recommendations:
            failures.append("{}: {} recommendations, expected at least {}".format(
                name, len(recommendations), minimum_recommendations))

    print()
    print("=" * 78)
    if failures:
        print("REAL REPO GATE: {} FAILURE(S)".format(len(failures)))
        print("=" * 78)
        for failure in failures:
            print("  - " + failure)
        return 1

    print("REAL REPO GATE: all checks passed")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
