"""Shared configuration for the InfraZero microservice architecture-grading pipeline.

Everything downstream (dataset build, training, evaluation, inference) imports
paths, vocabularies and hyper-parameters from here so that a canvas-drawn graph
and an Alibaba-trace-derived graph are described in exactly the same terms.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

ML_PIPELINE_DIR = Path(__file__).resolve().parents[1]
PACKAGE_DIR = Path(__file__).resolve().parent

# Raw Alibaba tarballs live OUTSIDE the OneDrive-synced repo. Override with
# INFRAZERO_TRACE_DIR if the traces are staged somewhere else.
RAW_TRACE_DIR = Path(
    os.getenv("INFRAZERO_TRACE_DIR", r"C:/Users/rkj24/infrazero-traces")
).resolve()
RAW_V2021_DIR = RAW_TRACE_DIR / "v2021"
RAW_V2022_DIR = RAW_TRACE_DIR / "v2022"
EXTRACT_SCRATCH_DIR = RAW_TRACE_DIR / "_scratch"

# The compact, redistributable artefacts. These are all training needs -- once
# they exist the multi-GB raw traces can be deleted.
DATASET_DIR = ML_PIPELINE_DIR / "data" / "microservices"
ARCH_SHARDS_DIR = DATASET_DIR / "shards"          # per-tarball intermediate JSONL
DATASET_FILE = DATASET_DIR / "architectures.jsonl"  # merged, deduped, labelled
DATASET_STATS_FILE = DATASET_DIR / "dataset_stats.json"

MODEL_DIR = ML_PIPELINE_DIR / "ghosttrace"
MODEL_PATH = MODEL_DIR / "ghosttrace_gnn.pt"
BEST_MODEL_PATH = MODEL_DIR / "ghosttrace_gnn_best.pt"
TRAINING_HISTORY_PATH = MODEL_DIR / "training_history.json"
EVALUATION_DIR = MODEL_DIR / "evaluation"
METRICS_REPORT_PATH = EVALUATION_DIR / "metrics_report.json"

# --------------------------------------------------------------------------- #
# Label space -- 3-class architecture risk grade
# --------------------------------------------------------------------------- #

CLASSES = ["low", "medium", "high"]
LABEL_TO_INDEX = {name: index for index, name in enumerate(CLASSES)}

# How the risk class surfaces as a report-card letter in the UI.
CLASS_TO_LETTER = {"low": "A", "medium": "C", "high": "F"}

# --------------------------------------------------------------------------- #
# Node role vocabulary -- the bridge between Alibaba traces and the canvas
# --------------------------------------------------------------------------- #

# Display roles: the full vocabulary the canvas can express. These are what the
# UI shows a user, and they are finer-grained than anything the traces contain.
ROLES = [
    "service",
    "database",
    "cache",
    "queue",
    "gateway",
    "loadbalancer",
    "worker",
    "cdn",
    "batch",
    "objectstore",
    "external",
    "unknown",
]
ROLE_TO_INDEX = {name: index for index, name in enumerate(ROLES)}

# Model roles: the roles the encoder is trained to read.
#
# THIS REVERSES AN EARLIER DECISION, and the reason it is now safe to do so
# matters more than the change itself.
#
# A call trace records rpctype in {rpc, http, db, mc, mq}, so a trace-derived
# graph can only ever contain five roles. While Alibaba traces were the *only*
# training source, widening this vocabulary would have been actively harmful:
# a "loadbalancer" dimension that is zero in every training example is an input
# the model was never taught to read, so at inference a load balancer would
# arrive carrying no role signal at all. Collapsing onto the five observed roles
# was the correct call under that constraint.
#
# The constraint is gone. Training is now two-stage: the encoder is pretrained
# on real deployment manifests (see scrape_deployments.py / scrape_large_
# systems.py), which DO name gateways, load balancers, CDN edges, batch tiers
# and object stores, before the grading head is fitted on trace-measured
# fragility. Every dimension below is populated by real data in at least one
# stage, so none of them is a dimension the model has never seen.
#
# This matters concretely: collapsing cost us the diagrams we most want to
# grade. In the Uber reference diagram 10 of 29 nodes collapsed -- the whole
# Hadoop/Spark/ELK batch tier read as request-path "service", and the WAF, the
# load balancer and the backup datacenter all read as "gateway". A batch tier
# that is off the request path entirely is not a service, and modelling it as
# one is what made a proven architecture grade F.
# The vocabulary is widened only as far as the pretraining corpus can actually
# support. Measured coverage over that corpus (2,625 compose systems + merged
# Kubernetes repositories + 3,000 trace topologies):
#
#     service       26,138      loadbalancer      623
#     cache         18,996      batch           2,856
#     database       6,734      worker          2,026
#     gateway        4,770
#     queue          4,171
#
#     cdn                1      objectstore         4      external        6
#
# The first eight are genuinely learnable. The last three are not, and no
# additional scraping will change that: a CDN edge, an S3 bucket and a smart TV
# are not things a deployment manifest declares, because none of them is a
# workload you deploy. Keeping them as their own dimensions would recreate
# exactly the defect the original five-role collapse existed to prevent -- a
# one-hot column that is ~zero in training and non-zero at inference.
#
# So they stay in the DISPLAY vocabulary, where the canvas and the report can
# name them precisely, and collapse onto the nearest well-observed role before
# encoding. The separations that actually fixed the grading -- batch apart from
# request-path service, load balancer apart from gateway -- are all in the
# supported set.
MODEL_ROLES = [
    "service",
    "database",
    "cache",
    "queue",
    "gateway",
    "loadbalancer",
    "worker",
    "batch",
]
MODEL_ROLE_TO_INDEX = {name: index for index, name in enumerate(MODEL_ROLES)}
NUM_MODEL_ROLES = len(MODEL_ROLES)

# Roles that occur in the SUPERVISED training set, which is Alibaba traces only.
#
# The encoder learns all eight roles during self-supervised pretraining on
# deployment manifests, but the grading head is fitted on trace-derived
# architectures -- and a call trace records rpctype in {rpc, http, db, mc, mq},
# so `loadbalancer`, `worker` and `batch` are identically zero in every labelled
# example the head ever sees.
#
# The widening is still a clear net win: folding those three back onto the old
# five-role vocabulary sends the Uber and Netflix reference diagrams from C back
# to F. But a diagram where a third of the nodes carry a role the head has no
# calibrated response to deserves a lower-confidence caveat rather than being
# presented as a verdict, so the inference server reports the coverage.
SUPERVISED_MODEL_ROLES = frozenset({"service", "database", "cache", "queue", "gateway"})

ROLE_TO_MODEL_ROLE = {name: name for name in MODEL_ROLES}
ROLE_TO_MODEL_ROLE.update({
    # A CDN edge terminates and routes client traffic, which is what a load
    # balancer does; the structural features already separate them by depth.
    "cdn": "loadbalancer",
    # An object store is durable storage reached over the network. Structurally
    # it behaves as a database does, and it is read as a "db" link either way.
    "objectstore": "database",
    # A client device is a pure traffic source. The topology block already
    # carries `is entry point`, so the distinction is not lost by this collapse.
    "external": "service",
    "unknown": "service",
})

# Retained under the old name so existing indexing into the node-feature block
# keeps working; the topology block starts after the role one-hot.
NUM_ROLES = NUM_MODEL_ROLES

# Alibaba `rpctype` -> role of the *callee* (downstream microservice).
RPCTYPE_TO_ROLE = {
    "rpc": "service",
    "http": "service",
    "db": "database",
    "mc": "cache",
    "mq": "queue",
}

# InfraZero node type -> role. Keys are lower-cased on lookup.
#
# Two vocabularies reach the grader and both are mapped explicitly rather than
# left to the fuzzy fallback:
#   * the canvas palette (backend/src/config/constants.ts VALID_NODE_TYPES);
#   * the vision importer's prompt vocabulary (ai.controller.ts), which says
#     "Node Service" where the canvas says "Service" and "Database" where the
#     canvas says "PostgreSQL".
# A diagram uploaded as an image must grade identically to the same diagram
# drawn by hand, so these have to agree.
UI_TYPE_TO_ROLE = {
    # Canvas palette
    "infrastructure": "loadbalancer",
    "gateway": "gateway",
    "service": "service",
    "postgresql": "database",
    "cache": "cache",
    "rabbitmq": "queue",
    "background job": "worker",
    "edge network": "cdn",
    # Vision importer vocabulary
    "node service": "service",
    "database": "database",
    # Roles the widened vocabulary can now express directly. A batch/analytics
    # tier is off the request path, so it must not read as a request-path
    # service; an object store is not a transactional database; a client device
    # is a traffic source rather than a component that can fail the system.
    "batch": "batch",
    "analytics": "batch",
    "object storage": "objectstore",
    "objectstore": "objectstore",
    "load balancer": "loadbalancer",
    "cdn": "cdn",
    "worker": "worker",
    "client": "external",
    "external": "external",
}

# Which roles a node's LABEL is allowed to sharpen its palette TYPE into.
#
# The canvas palette has eight entries but real diagrams name far more kinds of
# component, so "Background Job" covers both an off-path Spark cluster and an
# on-path queue consumer. The label disambiguates -- but only downwards, within
# the family the user already chose. A node explicitly placed as a Cache stays a
# cache even if its label mentions Postgres, because the palette choice is an
# explicit statement of intent and the label is an inference.
ROLE_REFINEMENTS = {
    "worker": ("batch", "worker"),
    "database": ("database", "objectstore"),
    "service": ("service", "external", "batch"),
    "loadbalancer": ("loadbalancer", "gateway", "cdn"),
    "gateway": ("gateway", "loadbalancer"),
    "cdn": ("cdn",),
    "cache": ("cache",),
    "queue": ("queue",),
}

# --------------------------------------------------------------------------- #
# Edge (link kind) vocabulary
# --------------------------------------------------------------------------- #

LINK_KINDS = ["rpc", "http", "db", "mc", "mq", "unknown"]
LINK_TO_INDEX = {name: index for index, name in enumerate(LINK_KINDS)}
NUM_LINK_KINDS = len(LINK_KINDS)

# --------------------------------------------------------------------------- #
# Feature dimensions
# --------------------------------------------------------------------------- #

NUM_TOPOLOGY_FEATURES = 14
NUM_NODE_FEATURES = NUM_MODEL_ROLES + NUM_TOPOLOGY_FEATURES
NUM_EDGE_FEATURES = NUM_LINK_KINDS

# 13 hand-crafted summary statistics, then the role mix, then the link mix.
# Derived rather than hardcoded so widening a vocabulary cannot silently
# desynchronise the encoder from its own assertion.
NUM_GRAPH_SUMMARY_FEATURES = 13
NUM_GRAPH_FEATURES = NUM_GRAPH_SUMMARY_FEATURES + NUM_MODEL_ROLES + NUM_LINK_KINDS

# --------------------------------------------------------------------------- #
# Dataset-build thresholds
# --------------------------------------------------------------------------- #

# A distinct architecture must be observed at least this many times before its
# measured latency percentiles are considered statistically meaningful.
MIN_TRACE_INSTANCES = 8

# Guard rails on call-graph size: single-call traces carry no structure and
# pathological ones are almost always trace-collection artefacts.
MIN_NODES_PER_ARCH = 3
MAX_NODES_PER_ARCH = 60

RANDOM_SEED = 42
