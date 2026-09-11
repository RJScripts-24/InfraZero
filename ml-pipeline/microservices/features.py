"""Single source of truth for turning an architecture graph into model inputs.

Both halves of the system funnel through this module:

  * `build_dataset.py` calls it on graphs reconstructed from Alibaba call traces;
  * `inference_server.py` calls it on graphs drawn on the InfraZero canvas or
    recovered from an uploaded diagram by the vision importer.

Because the two paths share this code, a hand-drawn topology is described with
exactly the same feature widths as a production trace -- which is what makes the
learned grade transfer at all. The widths themselves live in `config.py` and are
derived from the vocabularies, so widening a vocabulary cannot desynchronise the
two paths.

Nothing here reads response time, CPU or any other runtime measurement: those
exist only in the traces, never on the canvas, and they are what the label is
derived from. Keeping them out of the inputs is what keeps the task honest.
"""

from __future__ import annotations

from collections import deque
from typing import Dict, List, Sequence, Tuple

import numpy as np

from .config import (
    LINK_TO_INDEX,
    MODEL_ROLE_TO_INDEX,
    NUM_EDGE_FEATURES,
    NUM_GRAPH_FEATURES,
    NUM_LINK_KINDS,
    NUM_MODEL_ROLES,
    NUM_NODE_FEATURES,
    ROLE_TO_MODEL_ROLE,
    RPCTYPE_TO_ROLE,
    ROLE_REFINEMENTS,
    UI_TYPE_TO_ROLE,
)

# The role one-hot occupies the first NUM_MODEL_ROLES columns of the node
# feature block; the topology block follows it.
NUM_ROLES = NUM_MODEL_ROLES


def to_model_role(role: str) -> str:
    """Normalise a display role onto one the encoder reads.

    This used to collapse the canvas vocabulary onto the five roles an Alibaba
    call trace can express, because a one-hot column that is zero in every
    training example is an input the model was never taught to read. Deployment
    manifests supply three more of them -- load balancer, worker and batch --
    during encoder pretraining, so those are now their own dimensions.

    CDN, object store and external client are still collapsed, for the original
    reason: manifests do not declare them either, so they remain unobserved. See
    the coverage table in config.py.
    """

    return ROLE_TO_MODEL_ROLE.get(role, "service")

# --------------------------------------------------------------------------- #
# Role / link-kind normalisation
# --------------------------------------------------------------------------- #


def role_from_rpctype(rpctype: object, is_entry: bool = False) -> str:
    """Map an Alibaba rpctype to a role, from the callee's point of view.

    A microservice's role is inferred from how it is called: something reached
    over "db" is a database, over "mc" a cache, over "mq" a broker. The trace's
    entry microservice -- the one the proxy hands the request to -- is the
    gateway.
    """

    if is_entry:
        return "gateway"
    key = str(rpctype).strip().lower()
    return RPCTYPE_TO_ROLE.get(key, "service")


def role_from_ui_type(node: Dict) -> str:
    """Map an InfraZero canvas node onto the same role vocabulary.

    Accepts both the nested React Flow shape (node["data"]["type"]) and a flat
    node["type"].

    The palette type and the node's label carry different amounts of
    information, and the type alone is not enough. The canvas palette has eight
    entries, so "Hadoop Hive HDFS Pig", "Amazon EMR" and "Fulfilment Worker" are
    all dropped on the canvas as "Background Job" -- yet the first two are an
    off-path analytics tier and the third is a queue consumer on the write path.
    Reading only the type made every one of them a generic worker.

    So the type fixes the *family* and the label selects the *member* within it.
    A label may only refine its type, never contradict it: a node the user
    explicitly placed as a Cache cannot become a database because its label
    happens to mention Postgres.
    """

    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    raw = str(data.get("type", node.get("type", "")) or "").strip().lower()
    label = str(data.get("label", node.get("label", "")) or "").strip().lower()

    type_role = UI_TYPE_TO_ROLE.get(raw)
    haystack = raw + " " + label

    # Order matters: the more specific patterns are tested first.
    #
    # The batch/analytics and object-store branches exist because collapsing
    # them was what made real architectures grade badly. Hadoop, Spark and EMR
    # sit off the request path entirely -- calling them "service" told the model
    # a six-way fan-out to a batch tier was a six-way synchronous fan-out on the
    # hot path. Likewise S3 is not a transactional database, and a WAF is a
    # filtering hop rather than an API gateway.
    fuzzy = (
        (("waf", "web application firewall", "firewall"), "loadbalancer"),
        (("load balancer", "loadbalancer", "haproxy", "nginx", "envoy",
          "ingress", "elb", "alb", "traefik"), "loadbalancer"),
        (("gateway", "api gw", "apigw", "bff", "edge service", "zuul"), "gateway"),
        (("cdn", "cloudfront", "edge network", "fastly", "akamai",
          "open connect"), "cdn"),
        # Batch / stream analytics: off the synchronous request path.
        (("hadoop", "hive", "hdfs", "spark", "storm", "flink", "emr",
          "airflow", "presto", "pig", "samza", "databricks", "jupyter",
          "analytics", "logstash", "elk", "chukwa", "map reduce",
          "mapreduce", "etl", "data warehouse", "warehouse"), "batch"),
        (("redis", "memcache", "memcached", "cache", "elasticache",
          "hazelcast", "varnish"), "cache"),
        (("rabbit", "kafka", "sqs", "pubsub", "nats", "queue", "broker",
          "mq", "kinesis", "pulsar", "activemq"), "queue"),
        (("s3", "blob", "bucket", "object storage", "objectstore", "minio",
          "gcs", "cloud storage"), "objectstore"),
        (("postgres", "mysql", "mariadb", "mongo", "dynamo", "cassandra",
          "sqlite", "database", "rds", "aurora", "oracle", "cockroach",
          "elasticsearch", "opensearch", "clickhouse", "influx", "neo4j",
          " db"), "database"),
        (("worker", "background job", "cron", "batch job", "consumer",
          "celery", "sidekiq", "transcoder", "scheduler"), "worker"),
        # Traffic sources rather than components that can themselves fail.
        # The needles are deliberately multi-word: a bare "user" or "client"
        # would capture "user service" and "service client", which are
        # ordinary services.
        (("browser", "mobile app", "smart tv", "game console", "end user",
          "rider app", "driver app", "mobile client", "web client",
          "laptop", "desktop", "handset"), "external"),
        (("service", "api", "server", "app", "microservice", "lambda",
          "function"), "service"),
    )

    label_role = None
    for needles, role in fuzzy:
        if any(needle in haystack for needle in needles):
            label_role = role
            break

    # No recognised palette type: the label is all there is.
    if type_role is None:
        return label_role or "unknown"

    # The label may sharpen the palette type, never override it.
    if label_role and label_role in ROLE_REFINEMENTS.get(type_role, ()):
        return label_role
    return type_role


def link_kind_from_roles(source_role: str, target_role: str, explicit: object = None) -> str:
    """Resolve an edge's link kind.

    Trace edges carry an explicit rpctype. Canvas edges do not, so the kind is
    inferred from what sits at the far end -- a call into a database node is a
    "db" call whether it was drawn by hand or recorded in production.
    """

    if explicit is not None:
        key = str(explicit).strip().lower()
        if key in LINK_TO_INDEX:
            return key

    # An object store is reached the way a database is; a batch or worker tier
    # hanging off a queue is an asynchronous hop, and calling it synchronous is
    # what made off-path analytics look like request-path fan-out.
    by_target = {"database": "db", "objectstore": "db", "cache": "mc", "queue": "mq"}
    if target_role in by_target:
        return by_target[target_role]
    if source_role == "queue":
        return "mq"
    if source_role in {"gateway", "external"} or target_role in {
        "gateway", "loadbalancer", "cdn"
    }:
        return "http"
    if target_role in {"service", "worker", "batch"}:
        return "rpc"
    return "unknown"


# --------------------------------------------------------------------------- #
# Graph structure helpers
#
# These run on tens of thousands of small graphs during the dataset build, so
# they are plain Python rather than networkx -- and they keep the inference
# server free of an extra dependency.
# --------------------------------------------------------------------------- #


def _adjacency(num_nodes, edge_pairs):
    """Return (successors, predecessors, undirected neighbours), de-duplicated."""

    succ = [[] for _ in range(num_nodes)]
    pred = [[] for _ in range(num_nodes)]
    undirected = [[] for _ in range(num_nodes)]

    seen = set()
    for source, target in edge_pairs:
        if (source, target) in seen:
            continue
        seen.add((source, target))
        succ[source].append(target)
        pred[target].append(source)
        if target not in undirected[source]:
            undirected[source].append(target)
        if source not in undirected[target]:
            undirected[target].append(source)

    return succ, pred, undirected


def _depths_from_roots(num_nodes, succ, roots):
    """BFS depth of every node from the nearest entry point."""

    depth = [-1] * num_nodes
    queue = deque()
    for root in roots:
        depth[root] = 0
        queue.append(root)

    while queue:
        current = queue.popleft()
        for nxt in succ[current]:
            if depth[nxt] == -1:
                depth[nxt] = depth[current] + 1
                queue.append(nxt)

    # Nodes unreachable from any root (only possible inside a cyclic component)
    # take the deepest observed level rather than being left negative.
    reachable = [d for d in depth if d >= 0]
    fallback = max(reachable) if reachable else 0
    return [d if d >= 0 else fallback for d in depth]


def _reachable_counts(num_nodes, adj):
    """Number of distinct nodes reachable from each node, excluding itself."""

    counts = []
    for start in range(num_nodes):
        seen = {start}
        stack = list(adj[start])
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            stack.extend(adj[current])
        counts.append(len(seen) - 1)
    return counts


def _articulation_points(num_nodes, undirected):
    """Iterative Hopcroft-Tarjan articulation points on the undirected view.

    An articulation point is a node whose removal disconnects the topology --
    the structural definition of a single point of failure.
    """

    is_articulation = [False] * num_nodes
    discovery = [-1] * num_nodes
    low = [0] * num_nodes
    parent = [-1] * num_nodes
    timer = 0

    for root in range(num_nodes):
        if discovery[root] != -1:
            continue

        root_children = 0
        discovery[root] = low[root] = timer
        timer += 1
        # Frames are [node, index into that node's neighbour list].
        stack = [[root, 0]]

        while stack:
            frame = stack[-1]
            node = frame[0]

            if frame[1] < len(undirected[node]):
                neighbour = undirected[node][frame[1]]
                frame[1] += 1

                if neighbour == parent[node]:
                    continue
                if discovery[neighbour] != -1:
                    low[node] = min(low[node], discovery[neighbour])
                    continue

                parent[neighbour] = node
                discovery[neighbour] = low[neighbour] = timer
                timer += 1
                if node == root:
                    root_children += 1
                stack.append([neighbour, 0])
            else:
                stack.pop()
                if stack:
                    up = stack[-1][0]
                    low[up] = min(low[up], low[node])
                    if up != root and low[node] >= discovery[up]:
                        is_articulation[up] = True

        if root_children > 1:
            is_articulation[root] = True

    return is_articulation


def _nodes_on_cycles(num_nodes, succ):
    """Flag nodes inside a strongly connected component of size > 1.

    Retry storms and feedback loops both surface as directed cycles, so this is
    a meaningful structural risk signal rather than a curiosity.
    """

    index_of = {}
    low_of = {}
    on_stack = {}
    scc_stack = []
    counter = 0
    on_cycle = [False] * num_nodes

    for start in range(num_nodes):
        if start in index_of:
            continue

        work = [[start, 0]]
        while work:
            frame = work[-1]
            node = frame[0]

            if frame[1] == 0:
                index_of[node] = low_of[node] = counter
                counter += 1
                scc_stack.append(node)
                on_stack[node] = True

            if frame[1] < len(succ[node]):
                nxt = succ[node][frame[1]]
                frame[1] += 1
                if nxt not in index_of:
                    work.append([nxt, 0])
                elif on_stack.get(nxt):
                    low_of[node] = min(low_of[node], index_of[nxt])
                continue

            work.pop()
            if work:
                up = work[-1][0]
                low_of[up] = min(low_of[up], low_of[node])

            if low_of[node] == index_of[node]:
                component = []
                while True:
                    member = scc_stack.pop()
                    on_stack[member] = False
                    component.append(member)
                    if member == node:
                        break
                if len(component) > 1:
                    for member in component:
                        on_cycle[member] = True
                elif node in succ[node]:  # self-loop
                    on_cycle[node] = True

    return on_cycle


def _clustering(num_nodes, undirected):
    """Local clustering coefficient on the undirected view."""

    neighbour_sets = [set(neighbours) for neighbours in undirected]
    coefficients = []
    for node in range(num_nodes):
        neighbours = list(neighbour_sets[node])
        degree = len(neighbours)
        if degree < 2:
            coefficients.append(0.0)
            continue
        links = 0
        for i in range(degree):
            for j in range(i + 1, degree):
                if neighbours[j] in neighbour_sets[neighbours[i]]:
                    links += 1
        coefficients.append(2.0 * links / (degree * (degree - 1)))
    return coefficients


# --------------------------------------------------------------------------- #
# The public entry point
# --------------------------------------------------------------------------- #


def _safe_div(numerator, denominator):
    return numerator / denominator if denominator else 0.0


def encode_graph(node_roles, edge_pairs, edge_kinds):
    """Encode one architecture into model-ready arrays.

    Args:
        node_roles: role name per node; indices align with edge_pairs.
        edge_pairs: directed (source_index, target_index) pairs.
        edge_kinds: link kind per edge, parallel to edge_pairs.

    Returns:
        node_features  (num_nodes, NUM_NODE_FEATURES)
        edge_index     (2, num_edges)
        edge_features  (num_edges, NUM_EDGE_FEATURES)
        graph_features (NUM_GRAPH_FEATURES,)
    """

    num_nodes = len(node_roles)
    if num_nodes == 0:
        raise ValueError("Cannot encode a graph with no nodes.")

    pairs = []
    kinds = []
    for position, (source, target) in enumerate(edge_pairs):
        source, target = int(source), int(target)
        if 0 <= source < num_nodes and 0 <= target < num_nodes:
            pairs.append((source, target))
            kinds.append(edge_kinds[position] if position < len(edge_kinds) else "unknown")

    succ, pred, undirected = _adjacency(num_nodes, pairs)

    in_degree = np.array([len(pred[i]) for i in range(num_nodes)], dtype=np.float64)
    out_degree = np.array([len(succ[i]) for i in range(num_nodes)], dtype=np.float64)
    total_degree = in_degree + out_degree

    max_in = float(in_degree.max())
    max_out = float(out_degree.max())
    max_total = float(total_degree.max())

    roots = [i for i in range(num_nodes) if in_degree[i] == 0]
    if not roots:  # fully cyclic topology -- anchor on the highest fan-out node
        roots = [int(np.argmax(out_degree))]

    depths = _depths_from_roots(num_nodes, succ, roots)
    max_depth = float(max(depths))

    descendants = _reachable_counts(num_nodes, succ)
    ancestors = _reachable_counts(num_nodes, pred)
    articulation = _articulation_points(num_nodes, undirected)
    on_cycle = _nodes_on_cycles(num_nodes, succ)
    clustering = _clustering(num_nodes, undirected)

    denominator = max(num_nodes - 1, 1)

    node_features = np.zeros((num_nodes, NUM_NODE_FEATURES), dtype=np.float32)
    for i in range(num_nodes):
        # [0 : NUM_MODEL_ROLES] one-hot role, collapsed onto the trained vocabulary
        node_features[i, MODEL_ROLE_TO_INDEX[to_model_role(node_roles[i])]] = 1.0

        neighbours = undirected[i]
        if neighbours:
            neighbour_avg_degree = float(np.mean([total_degree[n] for n in neighbours]))
        else:
            neighbour_avg_degree = 0.0

        topology = (
            _safe_div(in_degree[i], max_in),                       # 0  normalised fan-in
            _safe_div(out_degree[i], max_out),                     # 1  normalised fan-out
            _safe_div(total_degree[i], max_total),                 # 2  normalised degree
            1.0 if in_degree[i] == 0 else 0.0,                     # 3  is entry point
            1.0 if out_degree[i] == 0 else 0.0,                    # 4  is leaf
            min(_safe_div(total_degree[i], denominator), 1.0),     # 5  degree centrality
            _safe_div(in_degree[i], total_degree[i]),              # 6  fan-in ratio
            min(_safe_div(neighbour_avg_degree, max_total), 1.0),  # 7  neighbour degree
            _safe_div(depths[i], max_depth),                       # 8  relative depth
            _safe_div(descendants[i], denominator),                # 9  blast radius
            _safe_div(ancestors[i], denominator),                  # 10 dependants
            1.0 if articulation[i] else 0.0,                       # 11 single point of failure
            1.0 if on_cycle[i] else 0.0,                           # 12 sits on a cycle
            clustering[i],                                         # 13 local clustering
        )
        node_features[i, NUM_MODEL_ROLES:] = np.asarray(topology, dtype=np.float32)

    # ---- edges ----------------------------------------------------------- #
    num_edges = len(pairs)
    if num_edges:
        edge_index = np.asarray(pairs, dtype=np.int64).T
        edge_features = np.zeros((num_edges, NUM_EDGE_FEATURES), dtype=np.float32)
        for position, kind in enumerate(kinds):
            edge_features[position, LINK_TO_INDEX.get(kind, LINK_TO_INDEX["unknown"])] = 1.0
    else:
        edge_index = np.zeros((2, 0), dtype=np.int64)
        edge_features = np.zeros((0, NUM_EDGE_FEATURES), dtype=np.float32)

    # ---- graph-level summary --------------------------------------------- #
    role_histogram = np.zeros(NUM_MODEL_ROLES, dtype=np.float32)
    for role in node_roles:
        role_histogram[MODEL_ROLE_TO_INDEX[to_model_role(role)]] += 1.0
    role_histogram /= max(num_nodes, 1)

    link_histogram = np.zeros(NUM_LINK_KINDS, dtype=np.float32)
    for kind in kinds:
        link_histogram[LINK_TO_INDEX.get(kind, LINK_TO_INDEX["unknown"])] += 1.0
    link_histogram /= max(num_edges, 1)

    summary = np.asarray(
        [
            min(float(np.log1p(num_nodes) / np.log(61.0)), 1.0),      # 0  size
            min(float(np.log1p(num_edges) / np.log(201.0)), 1.0),     # 1  edge count
            _safe_div(num_edges, num_nodes * denominator),            # 2  density
            min(_safe_div(2.0 * num_edges, num_nodes) / 10.0, 1.0),   # 3  avg degree
            min(max_out / 20.0, 1.0),                                 # 4  peak fan-out
            min(max_depth / 15.0, 1.0),                               # 5  max depth
            min(float(np.mean(depths)) / 10.0, 1.0),                  # 6  avg depth
            1.0 if any(on_cycle) else 0.0,                            # 7  has a cycle
            _safe_div(float(sum(on_cycle)), num_nodes),               # 8  cycle coverage
            _safe_div(float(sum(articulation)), num_nodes),           # 9  SPOF density
            _safe_div(float((out_degree == 0).sum()), num_nodes),     # 10 leaf ratio
            _safe_div(float(len(roots)), num_nodes),                  # 11 entry ratio
            float(np.mean(clustering)),                               # 12 avg clustering
        ],
        dtype=np.float32,
    )
    graph_features = np.concatenate([summary, role_histogram, link_histogram]).astype(np.float32)

    if graph_features.shape[0] != NUM_GRAPH_FEATURES:
        raise AssertionError(
            "graph feature width %d != configured %d"
            % (graph_features.shape[0], NUM_GRAPH_FEATURES)
        )
    return node_features, edge_index, edge_features, graph_features


def encode_canvas_graph(nodes: Sequence[Dict], edges: Sequence[Dict]):
    """Encode an InfraZero canvas or vision-imported graph.

    This is the inference-time counterpart to the trace-derived encoding, and it
    deliberately shares encode_graph so the two cannot drift apart.
    """

    node_ids = [str(node.get("id", index)) for index, node in enumerate(nodes)]
    index_of = {node_id: index for index, node_id in enumerate(node_ids)}
    roles = [role_from_ui_type(node) for node in nodes]

    pairs: List[Tuple[int, int]] = []
    kinds: List[str] = []
    for edge in edges:
        source = index_of.get(str(edge.get("source", edge.get("from", ""))))
        target = index_of.get(str(edge.get("target", edge.get("to", ""))))
        if source is None or target is None or source == target:
            continue
        pairs.append((source, target))
        kinds.append(link_kind_from_roles(roles[source], roles[target], edge.get("rpctype")))

    return encode_graph(roles, pairs, kinds)
