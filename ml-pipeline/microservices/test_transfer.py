"""Regression tests for the canvas / vision transfer path.

The grader is trained on Alibaba production traces but asked to score graphs that
come from two very different places: hand-drawn canvas topologies and diagrams
recovered from an uploaded image. These tests pin down the properties that make
that transfer sound, so a change to either vocabulary fails loudly here rather
than quietly degrading grades in the product.

Run with:  python -m pytest microservices/test_transfer.py -v
      or:  python -m microservices.test_transfer
"""

from __future__ import annotations

import numpy as np

from .config import (
    NUM_EDGE_FEATURES,
    NUM_GRAPH_FEATURES,
    NUM_MODEL_ROLES,
    NUM_NODE_FEATURES,
    ROLES,
    ROLE_TO_MODEL_ROLE,
    MODEL_ROLES,
    UI_TYPE_TO_ROLE,
)
from .features import encode_canvas_graph, link_kind_from_roles, role_from_ui_type

# The canvas palette, from backend/src/config/constants.ts VALID_NODE_TYPES.
CANVAS_TYPES = [
    "Infrastructure",
    "Gateway",
    "Service",
    "PostgreSQL",
    "Cache",
    "RabbitMQ",
    "Background Job",
    "Edge Network",
]

# The vision importer's vocabulary, from ai.controller.ts. Note "Node Service"
# and "Database" where the canvas says "Service" and "PostgreSQL".
VISION_TYPES = [
    "Infrastructure",
    "Gateway",
    "Node Service",
    "Database",
    "Cache",
    "RabbitMQ",
    "Background Job",
    "Edge Network",
]


def _graph(types):
    """A fixed 8-node topology built from a given type vocabulary."""

    nodes = [{"id": str(i), "data": {"label": name, "type": name}} for i, name in enumerate(types)]
    edges = [
        {"source": "0", "target": "1"},
        {"source": "1", "target": "2"},
        {"source": "2", "target": "3"},
        {"source": "2", "target": "4"},
        {"source": "2", "target": "5"},
        {"source": "5", "target": "6"},
        {"source": "1", "target": "7"},
    ]
    return encode_canvas_graph(nodes, edges)


def test_canvas_and_vision_vocabularies_agree():
    """Every vision type must resolve to the same role as its canvas twin."""

    for canvas_type, vision_type in zip(CANVAS_TYPES, VISION_TYPES):
        canvas_role = role_from_ui_type({"data": {"type": canvas_type, "label": ""}})
        vision_role = role_from_ui_type({"data": {"type": vision_type, "label": ""}})
        assert canvas_role == vision_role, (
            f"{canvas_type!r} -> {canvas_role} but {vision_type!r} -> {vision_role}"
        )
        assert canvas_role != "unknown", f"{canvas_type!r} fell through to 'unknown'"


def test_identical_topology_encodes_identically():
    """The same diagram drawn vs uploaded must produce identical model inputs."""

    canvas = _graph(CANVAS_TYPES)
    vision = _graph(VISION_TYPES)
    for name, left, right in zip(
        ("node features", "edge index", "edge features", "graph features"), canvas, vision
    ):
        assert np.allclose(left, right), f"{name} differ between canvas and vision encodings"


def test_feature_widths_match_config():
    """Encoder output must match the widths the model was built against."""

    node_features, edge_index, edge_features, graph_features = _graph(CANVAS_TYPES)
    assert node_features.shape == (8, NUM_NODE_FEATURES)
    assert edge_index.shape[0] == 2
    assert edge_features.shape[1] == NUM_EDGE_FEATURES
    assert graph_features.shape == (NUM_GRAPH_FEATURES,)


def test_every_ui_type_maps_to_a_real_role():
    for ui_type, role in UI_TYPE_TO_ROLE.items():
        assert role in ROLES, f"{ui_type!r} maps to unknown role {role!r}"


def test_every_display_role_collapses_onto_a_trained_role():
    """No canvas node may reach the model on a role it never saw in training."""

    for role in ROLES:
        assert role in ROLE_TO_MODEL_ROLE, f"{role!r} has no model-role mapping"
        assert ROLE_TO_MODEL_ROLE[role] in MODEL_ROLES, (
            f"{role!r} maps to {ROLE_TO_MODEL_ROLE[role]!r}, which is not a trained role"
        )


def test_link_kind_inferred_from_target_role():
    """Canvas edges carry no rpctype, so the kind comes from the callee."""

    assert link_kind_from_roles("service", "database") == "db"
    assert link_kind_from_roles("service", "cache") == "mc"
    assert link_kind_from_roles("service", "queue") == "mq"
    assert link_kind_from_roles("gateway", "service") == "http"
    assert link_kind_from_roles("service", "service") == "rpc"
    # An explicit rpctype from the traces always wins.
    assert link_kind_from_roles("service", "database", explicit="rpc") == "rpc"


def test_single_point_of_failure_is_detected():
    """A chain's middle node is an articulation point; a leaf is not."""

    nodes = [
        {"id": "gw", "data": {"label": "Gateway", "type": "Gateway"}},
        {"id": "svc", "data": {"label": "Only Service", "type": "Service"}},
        {"id": "db", "data": {"label": "DB", "type": "PostgreSQL"}},
    ]
    edges = [{"source": "gw", "target": "svc"}, {"source": "svc", "target": "db"}]
    node_features, _, _, _ = encode_canvas_graph(nodes, edges)

    spof_column = NUM_MODEL_ROLES + 11
    assert node_features[1, spof_column] == 1.0, "the sole service should be a SPOF"
    assert node_features[2, spof_column] == 0.0, "a leaf database is not an articulation point"


def test_disconnected_and_edgeless_graphs_do_not_crash():
    """Half-drawn canvases are normal; they must still encode."""

    nodes = [
        {"id": "a", "data": {"label": "A", "type": "Service"}},
        {"id": "b", "data": {"label": "B", "type": "Service"}},
    ]
    node_features, edge_index, edge_features, graph_features = encode_canvas_graph(nodes, [])
    assert node_features.shape == (2, NUM_NODE_FEATURES)
    assert edge_index.shape == (2, 0)
    assert edge_features.shape == (0, NUM_EDGE_FEATURES)
    assert np.isfinite(graph_features).all()


def test_unrecognised_types_fall_back_sensibly():
    """AI-generated type strings should still land on a real role."""

    cases = {
        "API Gateway": "gateway",
        "Redis Cluster": "cache",
        "Postgres Primary": "database",
        "Kafka Broker": "queue",
        "nginx": "loadbalancer",
        "CloudFront": "cdn",
        "Celery Worker": "worker",
        "Auth Microservice": "service",
    }
    for raw, expected in cases.items():
        actual = role_from_ui_type({"data": {"type": raw, "label": ""}})
        assert actual == expected, f"{raw!r} -> {actual}, expected {expected}"


def _run_all():
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"  PASS  {test.__name__}")
        except AssertionError as error:
            failures += 1
            print(f"  FAIL  {test.__name__}: {error}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    return failures


if __name__ == "__main__":
    raise SystemExit(1 if _run_all() else 0)
