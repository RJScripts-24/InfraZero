"""Node-level fix recommendations, ranked by the model rather than by rules.

What "not rule based" actually means here
-----------------------------------------
There are two separable things in a recommendation: *what changes are possible*,
and *which of them would help this architecture*. Only the second is a judgement
about the design under test.

The catalogue of interventions below is engineered, and openly so -- "put a cache
in front of a database" is an SRE idiom, not a discovery. What is emphatically
NOT engineered is which intervention gets recommended, where it is applied, or
how much it is claimed to help. Each candidate is applied to a real copy of the
graph, the modified graph is re-encoded and re-scored by the trained GNN, and the
recommendation is ranked purely by the risk the model predicts it removes.

So the system never asserts "you have no cache, therefore you are at risk". It
asserts "adding a cache at THIS database moves the model's predicted risk from
0.81 to 0.34, more than any other single change available" -- a counterfactual
measured on the model, quantified, and attached to a specific node.

A consequence worth stating: an intervention the model does not believe in scores
near zero and is never shown. A rule engine cannot do that, because a rule cannot
notice that a cache would not have helped this particular topology.

Interventions are evaluated one at a time and are not composed, so the deltas do
not add up -- fixing the top-ranked item changes the ranking of the rest, which
is why the flow is re-run after each accepted change.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import torch
from torch_geometric.data import Data

from .config import CLASSES, CLASS_TO_LETTER
from .features import encode_canvas_graph, role_from_ui_type


@dataclass
class Recommendation:
    kind: str
    summary: str
    detail: str
    target_nodes: List[str]
    risk_before: float
    risk_after: float
    grade_before: str
    grade_after: str
    severity: str = field(init=False)

    def __post_init__(self) -> None:
        improvement = self.risk_before - self.risk_after
        self.severity = "high" if improvement >= 0.35 else "medium" if improvement >= 0.15 else "low"

    @property
    def improvement(self) -> float:
        return self.risk_before - self.risk_after

    def to_dict(self) -> Dict:
        return {
            "kind": self.kind,
            "summary": self.summary,
            "detail": self.detail,
            "targetNodes": self.target_nodes,
            "riskBefore": round(self.risk_before, 4),
            "riskAfter": round(self.risk_after, 4),
            "improvement": round(self.improvement, 4),
            "gradeBefore": self.grade_before,
            "gradeAfter": self.grade_after,
            "severity": self.severity,
        }


# --------------------------------------------------------------------------- #
# Scoring
# --------------------------------------------------------------------------- #


def score(model, nodes: Sequence[Dict], edges: Sequence[Dict]) -> Tuple[float, str]:
    """Return (expected risk on the ordered scale, letter grade)."""

    node_features, edge_index, edge_features, graph_features = encode_canvas_graph(nodes, edges)
    data = Data(
        x=torch.from_numpy(node_features),
        edge_index=torch.from_numpy(edge_index),
        edge_attr=torch.from_numpy(edge_features),
    )
    data.graph_features = torch.from_numpy(graph_features).view(1, -1)
    data.batch = torch.zeros(data.x.size(0), dtype=torch.long)
    with torch.no_grad():
        probabilities = torch.softmax(model(data), dim=1)[0]
    risk = float(sum(index * float(probabilities[index]) for index in range(len(CLASSES))))
    letter = CLASS_TO_LETTER[CLASSES[int(probabilities.argmax())]]
    return risk, letter


# --------------------------------------------------------------------------- #
# The intervention catalogue
#
# Each generator yields (kind, summary, detail, target_nodes, nodes, edges) for
# a MODIFIED copy of the architecture. None of them decides whether the change
# is worth making -- that is the model's job, above.
# --------------------------------------------------------------------------- #


def _roles_of(nodes: Sequence[Dict]) -> Dict[str, str]:
    return {str(node.get("id")): role_from_ui_type(node) for node in nodes}


def _label_of(nodes: Sequence[Dict], node_id: str) -> str:
    for node in nodes:
        if str(node.get("id")) == node_id:
            data = node.get("data") if isinstance(node.get("data"), dict) else {}
            return str(data.get("label", node_id))
    return node_id


def _inbound(edges: Sequence[Dict], node_id: str) -> List[Dict]:
    return [e for e in edges if str(e.get("target")) == node_id]


def _cache_in_front_of_database(nodes, edges, roles):
    """Reads currently hitting a database go through a cache instead."""

    for node_id, role in roles.items():
        if role != "database":
            continue
        callers = _inbound(edges, node_id)
        if len(callers) < 2:
            continue  # a single caller is not a contention point worth caching

        new_nodes = copy.deepcopy(list(nodes))
        new_edges = [e for e in edges if str(e.get("target")) != node_id]
        cache_id = f"__cache_for_{node_id}"
        new_nodes.append({
            "id": cache_id,
            "data": {"label": f"Cache for {_label_of(nodes, node_id)}", "type": "Cache"},
        })
        for caller in callers:
            new_edges.append({"source": caller["source"], "target": cache_id})
        new_edges.append({"source": cache_id, "target": node_id})

        yield (
            "add_cache",
            f"Put a read cache in front of {_label_of(nodes, node_id)}",
            f"{len(callers)} components read directly from {_label_of(nodes, node_id)}. "
            f"Routing those reads through a cache removes it from the synchronous "
            f"path of every one of them.",
            [node_id],
            new_nodes,
            new_edges,
        )


def _partition_shared_database(nodes, edges, roles):
    """A database shared by many writers is split into per-consumer stores."""

    for node_id, role in roles.items():
        if role != "database":
            continue
        callers = _inbound(edges, node_id)
        if len(callers) < 3:
            continue

        new_nodes = copy.deepcopy(list(nodes))
        new_edges = [e for e in edges if str(e.get("target")) != node_id]
        # Keep the original for the first caller; give the rest their own store.
        for index, caller in enumerate(callers):
            if index == 0:
                new_edges.append({"source": caller["source"], "target": node_id})
                continue
            shard_id = f"__shard_{node_id}_{index}"
            new_nodes.append({
                "id": shard_id,
                "data": {"label": f"{_label_of(nodes, node_id)} shard {index}",
                         "type": "PostgreSQL"},
            })
            new_edges.append({"source": caller["source"], "target": shard_id})

        yield (
            "partition_database",
            f"Split {_label_of(nodes, node_id)} -- {len(callers)} components share it",
            f"Every one of those {len(callers)} components contends for the same "
            f"store, so its saturation is a whole-system outage. Giving each "
            f"consumer its own store removes the shared failure domain.",
            [node_id],
            new_nodes,
            new_edges,
        )


def _decouple_through_queue(nodes, edges, roles):
    """A synchronous service-to-service call becomes an asynchronous one."""

    for edge in edges:
        source, target = str(edge.get("source")), str(edge.get("target"))
        if roles.get(source) != "service" or roles.get(target) not in {"service", "worker"}:
            continue

        new_nodes = copy.deepcopy(list(nodes))
        new_edges = [
            e for e in edges
            if not (str(e.get("source")) == source and str(e.get("target")) == target)
        ]
        queue_id = f"__queue_{source}_{target}"
        new_nodes.append({
            "id": queue_id,
            "data": {"label": f"Queue {_label_of(nodes, source)} to "
                              f"{_label_of(nodes, target)}", "type": "RabbitMQ"},
        })
        new_edges.append({"source": source, "target": queue_id})
        new_edges.append({"source": queue_id, "target": target})

        yield (
            "decouple_with_queue",
            f"Decouple {_label_of(nodes, source)} -> {_label_of(nodes, target)} with a queue",
            f"This call is synchronous, so {_label_of(nodes, target)} slowing down "
            f"applies back-pressure straight to {_label_of(nodes, source)}. A queue "
            f"between them absorbs the spike instead of propagating it.",
            [source, target],
            new_nodes,
            new_edges,
        )


def _replicate_single_point_of_failure(nodes, edges, roles):
    """A node everything funnels through gets a second instance behind a balancer."""

    inbound_counts: Dict[str, int] = {}
    for edge in edges:
        target = str(edge.get("target"))
        inbound_counts[target] = inbound_counts.get(target, 0) + 1

    for node_id, count in inbound_counts.items():
        if count < 3 or roles.get(node_id) in {"database", "cache", "queue"}:
            continue

        new_nodes = copy.deepcopy(list(nodes))
        replica_id = f"__replica_{node_id}"
        balancer_id = f"__lb_{node_id}"
        new_nodes.append({
            "id": replica_id,
            "data": {"label": f"{_label_of(nodes, node_id)} replica", "type": "Service"},
        })
        new_nodes.append({
            "id": balancer_id,
            "data": {"label": f"Load Balancer for {_label_of(nodes, node_id)}",
                     "type": "Infrastructure"},
        })
        new_edges = []
        for edge in edges:
            if str(edge.get("target")) == node_id:
                new_edges.append({"source": edge["source"], "target": balancer_id})
            else:
                new_edges.append(dict(edge))
        new_edges.append({"source": balancer_id, "target": node_id})
        new_edges.append({"source": balancer_id, "target": replica_id})
        for edge in edges:
            if str(edge.get("source")) == node_id:
                new_edges.append({"source": replica_id, "target": edge["target"]})

        yield (
            "replicate",
            f"Replicate {_label_of(nodes, node_id)} behind a load balancer",
            f"{count} components depend on {_label_of(nodes, node_id)} and there is "
            f"only one of it, so its failure takes all {count} down with it. A second "
            f"instance behind a balancer removes the single point of failure.",
            [node_id],
            new_nodes,
            new_edges,
        )


def _break_retry_cycle(nodes, edges, roles):
    """Remove an edge that closes a cycle -- the shape a retry storm rides on."""

    adjacency: Dict[str, List[str]] = {}
    for edge in edges:
        adjacency.setdefault(str(edge.get("source")), []).append(str(edge.get("target")))

    def reaches(start: str, goal: str, banned: Tuple[str, str]) -> bool:
        stack, seen = [start], set()
        while stack:
            current = stack.pop()
            if current == goal:
                return True
            if current in seen:
                continue
            seen.add(current)
            for neighbour in adjacency.get(current, []):
                if (current, neighbour) == banned:
                    continue
                stack.append(neighbour)
        return False

    for edge in edges:
        source, target = str(edge.get("source")), str(edge.get("target"))
        # This edge closes a cycle if the target already reaches the source.
        if not reaches(target, source, (source, target)):
            continue

        new_edges = [
            e for e in edges
            if not (str(e.get("source")) == source and str(e.get("target")) == target)
        ]
        yield (
            "break_cycle",
            f"Break the dependency cycle at {_label_of(nodes, source)} -> "
            f"{_label_of(nodes, target)}",
            f"{_label_of(nodes, target)} can already reach {_label_of(nodes, source)}, "
            f"so this edge closes a loop. Under load a loop lets retries feed "
            f"themselves, which is the structure a retry storm needs.",
            [source, target],
            copy.deepcopy(list(nodes)),
            new_edges,
        )


INTERVENTIONS: Tuple[Callable, ...] = (
    _cache_in_front_of_database,
    _partition_shared_database,
    _decouple_through_queue,
    _replicate_single_point_of_failure,
    _break_retry_cycle,
)

# Guard rail: a large architecture can generate hundreds of candidate edits and
# each one costs a forward pass. Evaluating the whole space would make the
# report slow for exactly the big diagrams this product exists to grade.
MAX_CANDIDATES_PER_KIND = 12


def recommend(
    model,
    nodes: Sequence[Dict],
    edges: Sequence[Dict],
    top_k: int = 5,
    min_improvement: float = 0.02,
) -> List[Recommendation]:
    """Rank concrete, node-attached changes by the risk the model says they remove."""

    baseline_risk, baseline_grade = score(model, nodes, edges)
    roles = _roles_of(nodes)

    results: List[Recommendation] = []
    for generator in INTERVENTIONS:
        for count, candidate in enumerate(generator(nodes, edges, roles)):
            if count >= MAX_CANDIDATES_PER_KIND:
                break
            kind, summary, detail, targets, new_nodes, new_edges = candidate
            try:
                new_risk, new_grade = score(model, new_nodes, new_edges)
            except (ValueError, AssertionError):
                continue
            if baseline_risk - new_risk < min_improvement:
                continue
            results.append(
                Recommendation(
                    kind=kind, summary=summary, detail=detail, target_nodes=targets,
                    risk_before=baseline_risk, risk_after=new_risk,
                    grade_before=baseline_grade, grade_after=new_grade,
                )
            )

    results.sort(key=lambda item: item.improvement, reverse=True)

    # One recommendation per targeted node: five variations on "fix this database"
    # is noise, and the flow is re-run after each accepted change anyway.
    seen_targets = set()
    deduplicated: List[Recommendation] = []
    for item in results:
        key = tuple(sorted(item.target_nodes))
        if key in seen_targets:
            continue
        seen_targets.add(key)
        deduplicated.append(item)
        if len(deduplicated) >= top_k:
            break
    return deduplicated
