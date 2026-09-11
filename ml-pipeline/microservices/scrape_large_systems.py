"""Collect LARGE architecture graphs by merging a repository's whole manifest tree.

Why this exists
---------------
`scrape_deployments.py` parses one file into one graph. For docker-compose that
is right -- a compose file is the whole system. For Kubernetes it is wrong, and
measurably so: that scraper recovered 3000 graphs of which only 49 were
Kubernetes, every one of them tiny, because a real Kubernetes application spreads
one service per file across a `k8s/` directory. Parsing `deployment.yaml` alone
recovers one service and calls it an architecture.

This module works at repository scope instead. It lists a repo's file tree in a
single API call, pulls every manifest in it, and merges all of them into one
graph -- which is what the architecture actually is. That is what produces the
20-60 node systems the grader needs to see, and which the Uber and Netflix
diagrams live among.

Edge recovery is also better at repo scope. In Kubernetes one workload addresses
another through a `Service` object, not by the Deployment's name, so a
single-file parse cannot resolve `DATABASE_HOST=postgres-svc` to the Postgres
StatefulSet. With the whole tree in hand the Service -> workload mapping is
recoverable, so the edges are real wiring rather than name coincidence.

What this does NOT give you
---------------------------
No latency ground truth, exactly as in `scrape_deployments.py`. A manifest says
how a system is built, never how well it performed. These graphs carry the
component vocabulary and the shape of real deployed systems; the risk label has
to come from measurement or from simulated stress, never from a heuristic run
over the manifest itself.

Rate limits
-----------
Code search is capped at 30 requests/minute and is used only to discover
repository names. The git-tree endpoint is on the 5000/hour core quota, one call
per repository. Raw file content comes from raw.githubusercontent.com, which is
not metered at all -- so a repo with 80 manifests costs one quota unit.

Run:  python -m microservices.scrape_large_systems --target 1500
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from typing import Dict, Iterable, List, Optional, Set, Tuple

import requests
import yaml

from .config import DATASET_DIR, ML_PIPELINE_DIR
from .scrape_deployments import infer_component_type

LARGE_DIR = DATASET_DIR / "deployments"
LARGE_FILE = LARGE_DIR / "large_systems.jsonl"
SEEN_REPOS_FILE = LARGE_DIR / "seen_repos.json"

GITHUB_API = "https://api.github.com"
RAW_BASE = "https://raw.githubusercontent.com"

SEARCH_PAUSE_SECONDS = 2.2

# The whole point of this module: only keep systems big enough to be an
# architecture rather than a demo. This is why the previous corpus, with a
# floor of 4, ended up with a median of 7 nodes.
MIN_SERVICES = 12
MAX_SERVICES = 150

# A repo's manifest tree, capped so one monorepo cannot eat the whole budget.
MAX_MANIFESTS_PER_REPO = 160
MAX_MANIFEST_BYTES = 400_000

K8S_WORKLOADS = {"Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"}

# Paths that plausibly hold deployment manifests. Checked against the full path
# so `charts/foo/templates/deploy.yaml` and `deploy/k8s/api.yml` both qualify.
MANIFEST_DIR_HINTS = (
    "k8s", "kube", "kubernetes", "manifests", "deploy", "deployment",
    "charts", "helm", "overlays", "base", "infra", "infrastructure",
    "ops", "cluster", "gitops", "argocd", "kustomize",
)

SKIP_PATH_MARKERS = (
    ".github/", "node_modules/", "vendor/", ".gitlab", "docs/",
    "test/", "tests/", "example/", "examples/", "values.yaml",
    "chart.yaml", "kustomization.yaml", "skaffold.yaml", "openapi",
    "swagger", "docker-compose",
)

GO_TEMPLATE = re.compile(r"\{\{[^}]*\}\}")
TOKEN = re.compile(r"[a-z0-9][a-z0-9._-]{2,}")


def looks_like_manifest(path: str) -> bool:
    lowered = path.lower()
    if not lowered.endswith((".yaml", ".yml")):
        return False
    if any(marker in lowered for marker in SKIP_PATH_MARKERS):
        return False
    padded = f"/{lowered}"
    return any(f"/{hint}/" in padded for hint in MANIFEST_DIR_HINTS)


def strip_templating(text: str) -> str:
    """Neutralise Helm's Go templating so the YAML underneath can be parsed.

    A Helm template is not valid YAML until it is rendered, and rendering needs
    the chart's values plus a Helm binary. Substituting a harmless placeholder
    recovers the structure -- workload names, images, env var wiring -- which is
    all this module reads. Control-flow lines are dropped entirely, because a
    bare `{{- if .Values.x }}` would otherwise leave a dangling fragment behind.
    """

    kept: List[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("{{") and any(
            keyword in stripped
            for keyword in ("if", "end", "range", "else", "with", "define", "toYaml", "include")
        ):
            continue
        kept.append(GO_TEMPLATE.sub("placeholder", line))
    return "\n".join(kept)


def _container_blob(containers: List, workload_image: str) -> Tuple[str, List[str]]:
    """Pull the image and every string a container uses to address other services."""

    image = workload_image
    blob: List[str] = []
    for container in containers:
        if not isinstance(container, dict):
            continue
        image = image or str(container.get("image", "") or "")
        for env in container.get("env") or []:
            if isinstance(env, dict):
                blob.append(str(env.get("value", "")))
                value_from = env.get("valueFrom") or {}
                if isinstance(value_from, dict):
                    for holder in value_from.values():
                        if isinstance(holder, dict):
                            blob.append(str(holder.get("name", "")))
        for source_ref in container.get("envFrom") or []:
            if isinstance(source_ref, dict):
                for holder in source_ref.values():
                    if isinstance(holder, dict):
                        blob.append(str(holder.get("name", "")))
        # `args` and `command` are lists in the Kubernetes schema, but manifests
        # in the wild are not always schema-valid -- and stripping Helm
        # templating can collapse a list into a scalar. Coerce rather than trust.
        for field in ("args", "command"):
            value = container.get(field)
            if isinstance(value, list):
                blob.extend(str(item) for item in value)
            elif value is not None:
                blob.append(str(value))
    return image, blob


def _pod_template(spec: Dict) -> Dict:
    """Return the pod template, reaching through CronJob's extra nesting."""

    template = spec.get("template")
    if isinstance(template, dict) and template:
        return template
    job_spec = spec.get("jobTemplate")
    if isinstance(job_spec, dict):
        inner = job_spec.get("spec")
        if isinstance(inner, dict):
            nested = inner.get("template")
            if isinstance(nested, dict):
                return nested
    return {}


def parse_manifest_tree(documents: Iterable[Dict], source: str) -> Optional[Dict]:
    """Merge every manifest in a repository into a single architecture graph."""

    workloads: Dict[str, str] = {}          # workload name -> component type
    workload_labels: Dict[str, Dict] = {}   # workload name -> pod labels
    tokens: Dict[str, Set[str]] = {}        # workload name -> referenced tokens
    replicas: Dict[str, int] = {}           # workload name -> declared instance count
    services: List[Tuple[str, Dict]] = []   # (service name, selector)

    for document in documents:
        if not isinstance(document, dict):
            continue
        kind = document.get("kind")
        metadata = document.get("metadata")
        if not isinstance(metadata, dict):
            continue
        name = str(metadata.get("name", "")).strip()
        if not name:
            continue

        spec = document.get("spec")
        if not isinstance(spec, dict):
            continue

        if kind == "Service":
            selector = spec.get("selector")
            services.append((name, selector if isinstance(selector, dict) else {}))
            continue

        if kind not in K8S_WORKLOADS:
            continue

        template = _pod_template(spec)
        pod_metadata = template.get("metadata")
        pod_metadata = pod_metadata if isinstance(pod_metadata, dict) else {}
        pod_spec = template.get("spec")
        pod_spec = pod_spec if isinstance(pod_spec, dict) else {}

        containers = pod_spec.get("containers")
        containers = containers if isinstance(containers, list) else []

        image, blob = _container_blob(containers, "")

        workloads[name] = infer_component_type(name, image)
        labels = pod_metadata.get("labels")
        workload_labels[name] = labels if isinstance(labels, dict) else {}
        tokens[name] = set(TOKEN.findall(" ".join(blob).lower()))

        # `spec.replicas` is how many instances this workload actually runs.
        # It is the one piece of redundancy information a manifest states
        # outright, and without it a simulator has to treat every component as a
        # singleton -- which makes a serial chain of replicated tiers look more
        # fragile than a wide fan-out of single services. A DaemonSet has no
        # replica count because it runs one pod per node; 3 is a reasonable
        # stand-in for a cluster and is recorded as such rather than as fact.
        declared = spec.get("replicas")
        if isinstance(declared, int) and declared > 0:
            replicas[name] = declared
        elif kind == "DaemonSet":
            replicas[name] = 3
        else:
            replicas[name] = 1

    if not (MIN_SERVICES <= len(workloads) <= MAX_SERVICES):
        return None

    # A Service name is how one workload actually addresses another, so resolve
    # each Service onto the workload its selector matches. Without this an env
    # var of DB_HOST=postgres-svc never connects to the postgres StatefulSet.
    alias_to_workload: Dict[str, str] = {}
    for service_name, selector in services:
        matched = None
        if selector:
            for workload_name, labels in workload_labels.items():
                if labels and all(labels.get(key) == value for key, value in selector.items()):
                    matched = workload_name
                    break
        if matched is None and service_name in workloads:
            matched = service_name
        if matched:
            alias_to_workload[service_name.lower()] = matched

    for workload_name in workloads:
        alias_to_workload.setdefault(workload_name.lower(), workload_name)

    edges = []
    seen_pairs: Set[Tuple[str, str]] = set()
    for name, referenced in tokens.items():
        for token in referenced:
            # An env value is often a cluster DNS name -- strip the suffix.
            head = token.split(".")[0]
            target = alias_to_workload.get(head)
            if target and target != name and (name, target) not in seen_pairs:
                seen_pairs.add((name, target))
                edges.append({"source": name, "target": target})

    # A graph with almost no recovered wiring is a parse failure, not a system.
    if len(edges) < MIN_SERVICES // 3:
        return None

    nodes = [
        {
            "id": name,
            "data": {
                "label": name,
                "type": node_type,
                "replicas": replicas.get(name, 1),
            },
        }
        for name, node_type in workloads.items()
    ]
    return {"nodes": nodes, "edges": edges, "source": source, "kind": "kubernetes-repo"}


# --------------------------------------------------------------------------- #
# GitHub access
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
        raise SystemExit("GITHUB_TOKEN not found. Set it in ml-pipeline/.env (public_repo scope).")
    return token


DISCOVERY_QUERIES = (
    '"kind: Deployment" path:k8s extension:yaml',
    '"kind: Deployment" path:kubernetes extension:yaml',
    '"kind: Deployment" path:manifests extension:yaml',
    '"kind: Deployment" path:deploy extension:yaml',
    '"kind: StatefulSet" path:k8s extension:yaml',
    '"kind: StatefulSet" path:charts extension:yaml',
    '"kind: Deployment" path:helm extension:yaml',
    '"kind: Deployment" path:overlays extension:yaml',
    '"kind: Deployment" microservices extension:yaml',
    '"kind: Deployment" path:infra extension:yaml',
    '"kind: Deployment" path:gitops extension:yaml',
    '"kind: Deployment" path:argocd extension:yaml',
)


def discover_repositories(session: requests.Session, pages: int) -> List[str]:
    """Find repositories that contain Kubernetes manifests.

    Code search is used only to name repositories -- the manifests themselves
    are pulled from the git tree, so one hit qualifies a whole repo.
    """

    found: List[str] = []
    seen: Set[str] = set()
    for index, query in enumerate(DISCOVERY_QUERIES, start=1):
        print(f"  [{index}/{len(DISCOVERY_QUERIES)}] search: {query}", flush=True)
        for page in range(1, pages + 1):
            try:
                response = session.get(
                    f"{GITHUB_API}/search/code",
                    params={"q": query, "per_page": 100, "page": page},
                    timeout=30,
                )
            except requests.RequestException as error:
                print(f"      ! {error}", file=sys.stderr, flush=True)
                break

            if response.status_code == 403:
                wait = int(response.headers.get("Retry-After", "60"))
                print(f"      rate limited, sleeping {wait}s", flush=True)
                time.sleep(wait)
                continue
            if response.status_code != 200:
                break

            items = response.json().get("items", [])
            if not items:
                break
            for item in items:
                repository = (item.get("repository") or {}).get("full_name")
                if repository and repository not in seen:
                    seen.add(repository)
                    found.append(repository)
            if len(items) < 100:
                break
            time.sleep(SEARCH_PAUSE_SECONDS)
        time.sleep(SEARCH_PAUSE_SECONDS)
        print(f"      {len(found):,} distinct repos so far", flush=True)
    return found


def list_manifest_paths(session: requests.Session, repository: str) -> Tuple[str, List[str]]:
    """One API call: the repo's whole file tree, filtered to manifest paths."""

    for branch in ("main", "master"):
        try:
            response = session.get(
                f"{GITHUB_API}/repos/{repository}/git/trees/{branch}",
                params={"recursive": "1"},
                timeout=30,
            )
        except requests.RequestException:
            continue
        if response.status_code != 200:
            continue
        tree = response.json().get("tree", [])
        paths = [
            entry["path"]
            for entry in tree
            if entry.get("type") == "blob"
            and entry.get("size", 0) < MAX_MANIFEST_BYTES
            and looks_like_manifest(entry["path"])
        ]
        return branch, paths[:MAX_MANIFESTS_PER_REPO]
    return "", []


def fetch_raw(session: requests.Session, repository: str, branch: str, path: str) -> Optional[str]:
    try:
        response = session.get(f"{RAW_BASE}/{repository}/{branch}/{path}", timeout=20)
    except requests.RequestException:
        return None
    if response.status_code == 200 and len(response.content) < MAX_MANIFEST_BYTES:
        return response.text
    return None


def collect_documents(session: requests.Session, repository: str,
                      branch: str, paths: List[str]) -> List[Dict]:
    documents: List[Dict] = []
    for path in paths:
        content = fetch_raw(session, repository, branch, path)
        if not content:
            continue
        if "{{" in content:
            content = strip_templating(content)
        try:
            for document in yaml.safe_load_all(content):
                if isinstance(document, dict):
                    documents.append(document)
        except (yaml.YAMLError, ValueError, AttributeError):
            continue
    return documents


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape large multi-file deployment architectures."
    )
    parser.add_argument("--target", type=int, default=1500, help="Stop after this many graphs.")
    parser.add_argument("--pages", type=int, default=10, help="Search pages per discovery query.")
    arguments = parser.parse_args()

    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"token {load_token()}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "InfraZero-architecture-grader",
        }
    )

    LARGE_DIR.mkdir(parents=True, exist_ok=True)

    seen_repos: Set[str] = set()
    if SEEN_REPOS_FILE.exists():
        seen_repos = set(json.loads(SEEN_REPOS_FILE.read_text(encoding="utf-8")))
    collected = 0
    if LARGE_FILE.exists():
        collected = sum(1 for _ in open(LARGE_FILE, encoding="utf-8"))
    print(f"resuming: {collected:,} large graphs, {len(seen_repos):,} repos visited\n", flush=True)

    print("discovering repositories with Kubernetes manifests...", flush=True)
    repositories = discover_repositories(session, pages=arguments.pages)
    fresh = [name for name in repositories if name not in seen_repos]
    print(f"\n{len(repositories):,} repos discovered, {len(fresh):,} not yet visited\n", flush=True)

    sizes: List[int] = []
    with open(LARGE_FILE, "a", encoding="utf-8") as sink:
        for position, repository in enumerate(fresh, start=1):
            if collected >= arguments.target:
                break
            seen_repos.add(repository)

            # Checkpoint on repositories VISITED, not graphs collected. Most
            # repositories yield nothing, so keying the resume point on
            # collections meant a crash discarded hundreds of repos of work --
            # and every `continue` below skipped the save entirely.
            if position % 50 == 0:
                SEEN_REPOS_FILE.write_text(json.dumps(sorted(seen_repos)), encoding="utf-8")

            # One malformed manifest in one repository must not end a run that
            # takes hours. Anything unparseable is skipped and recorded as seen.
            try:
                branch, paths = list_manifest_paths(session, repository)
                if not paths:
                    continue

                documents = collect_documents(session, repository, branch, paths)
                if not documents:
                    continue

                graph = parse_manifest_tree(documents, repository)
            except Exception as error:  # noqa: BLE001 - deliberately broad
                print(f"  ! {repository}: {type(error).__name__}: {error}", flush=True)
                continue

            if graph is None:
                continue

            sink.write(json.dumps(graph, separators=(",", ":")) + "\n")
            sink.flush()
            collected += 1
            sizes.append(len(graph["nodes"]))
            print(
                f"  [{position}/{len(fresh)}] {repository[:52]:<52} "
                f"{len(paths):>3} manifests -> {len(graph['nodes']):>3} nodes, "
                f"{len(graph['edges']):>3} edges   (total {collected:,})",
                flush=True,
            )


    SEEN_REPOS_FILE.write_text(json.dumps(sorted(seen_repos)), encoding="utf-8")
    if sizes:
        sizes.sort()
        print(
            f"\ncollected {len(sizes):,} graphs this run -- "
            f"nodes min/median/max = {sizes[0]}/{sizes[len(sizes) // 2]}/{sizes[-1]}",
            flush=True,
        )
    print(f"total in {LARGE_FILE}: {collected:,}", flush=True)


if __name__ == "__main__":
    main()
