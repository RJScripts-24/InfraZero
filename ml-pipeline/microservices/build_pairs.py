"""Extract matched pairs of architectures that differ by exactly one component.

Why this file exists
--------------------
The grader answers "is this architecture slow for its shape?". Useful, but not
what a user actually asks, which is "what happens if I make this change?".

Those are different questions and only the second one has a clean label. A pair
of real production topologies that are identical except for one added component,
both with measured tail latency, gives a *measured effect of that change* --
with size, depth and survivorship controlled for by construction, because the
two sides differ by one node and nothing else.

The extraction
--------------
1. Give every topology a canonical signature that ignores node ordering.
2. For each topology, drop one node and re-sign the remainder.
3. If that reduced signature matches a topology observed in its own right, the
   two form a matched pair: the smaller is `before`, the larger is `after`, and
   the dropped node is the intervention.
4. Emit the before-topology, a description of what was added and where it
   attached, and log(tail_after / tail_before) as the measured effect.

The canonical signature is a Weisfeiler-Lehman colour refinement over
role-labelled, kind-labelled edges. It is not a full isomorphism test -- WL
cannot separate every non-isomorphic pair -- but the failure mode is benign
here: two genuinely different topologies colliding just adds a little label
noise, whereas node-ordering sensitivity would have destroyed most true matches.

What is deliberately NOT done
-----------------------------
No pair is discarded for having an inconvenient sign. The whole point of the
exercise is that the sign is close to a coin flip, and hiding half the data
would manufacture the result the measurement is supposed to test.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from hashlib import blake2b
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from .config import DATASET_DIR, DATASET_FILE, MIN_TRACE_INSTANCES

PAIRS_FILE = DATASET_DIR / "matched_pairs.jsonl"
PAIRS_STATS_FILE = DATASET_DIR / "matched_pairs_stats.json"

WL_ROUNDS = 3


# --------------------------------------------------------------------------- #
# Canonical signature
# --------------------------------------------------------------------------- #


def _digest(payload: str) -> str:
    return blake2b(payload.encode("utf-8"), digest_size=12).hexdigest()


def wl_signature(roles, edges, rounds: int = WL_ROUNDS) -> str:
    """Order-invariant signature of a role- and kind-labelled directed graph.

    Two topologies that are the same architecture drawn with the nodes numbered
    differently must produce the same string, or almost every true matched pair
    is missed. Colour refinement gives that: a node colour is its role folded
    with the multiset of its neighbour colours, iterated, so the final colour
    multiset is a property of the shape rather than of the numbering.
    """

    num_nodes = len(roles)
    if num_nodes == 0:
        return _digest("empty")

    out_adjacency = [[] for _ in range(num_nodes)]
    in_adjacency = [[] for _ in range(num_nodes)]
    for source, target, kind in edges:
        out_adjacency[source].append((target, kind))
        in_adjacency[target].append((source, kind))

    colours = [_digest("r:" + str(role)) for role in roles]

    for _ in range(rounds):
        refreshed = []
        for node in range(num_nodes):
            outgoing = sorted("o|" + kind + "|" + colours[target]
                              for target, kind in out_adjacency[node])
            incoming = sorted("i|" + kind + "|" + colours[source]
                              for source, kind in in_adjacency[node])
            refreshed.append(_digest(colours[node] + "".join(outgoing) + "".join(incoming)))
        colours = refreshed

    header = str(num_nodes) + "|" + str(len(edges)) + "|"
    return _digest(header + "".join(sorted(colours)))


def _drop_node(roles, edges, victim: int):
    """Return (roles, edges) for the topology with `victim` and its edges removed.

    Indices are compacted, so the result is a standalone topology rather than a
    graph with a hole in it.
    """

    remap = {}
    kept_roles = []
    for index, role in enumerate(roles):
        if index == victim:
            continue
        remap[index] = len(kept_roles)
        kept_roles.append(role)

    kept_edges = []
    for source, target, kind in edges:
        if source == victim or target == victim:
            continue
        kept_edges.append((remap[source], remap[target], kind))

    return kept_roles, kept_edges


# --------------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------------- #


def _normalise_edges(raw: Iterable) -> List[Tuple[int, int, str]]:
    edges = []
    for entry in raw:
        if len(entry) < 2:
            continue
        source, target = int(entry[0]), int(entry[1])
        kind = str(entry[2]) if len(entry) > 2 else "unknown"
        if source == target:
            continue  # a self-loop carries no structure the encoder can read
        edges.append((source, target, kind))
    return edges


def load_topologies(path: Path, min_observations: int) -> List[Dict]:
    """Read architectures.jsonl into records carrying a canonical signature."""

    topologies = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            observations = int(record.get("observations", 0))
            tail = float(record.get("tail_ms", 0.0))
            if observations < min_observations or tail <= 0.0:
                continue
            roles = [str(role) for role in record.get("roles", [])]
            edges = _normalise_edges(record.get("edges", []))
            if len(roles) < 2:
                continue
            topologies.append({
                "roles": roles,
                "edges": edges,
                "tail_ms": tail,
                "observations": observations,
                "wl": wl_signature(roles, edges),
            })
    return topologies


# --------------------------------------------------------------------------- #
# Pair extraction
# --------------------------------------------------------------------------- #


def _attachment(edges, victim: int, before_roles):
    """How the dropped node was wired into the rest of the topology.

    Returned in *before-topology* indices, so the descriptor can be read against
    the graph the model is shown. This is the "where it goes" half of the
    question -- a cache in front of a shared database is a completely different
    intervention from a cache hanging off a leaf service, and without this the
    two would be indistinguishable to the model.
    """

    def shift(index):
        return index - 1 if index > victim else index

    inbound = []
    outbound = []
    for source, target, kind in edges:
        if source == victim and target != victim:
            outbound.append((shift(target), kind))
        elif target == victim and source != victim:
            inbound.append((shift(source), kind))

    touched = set()
    for index, _ in inbound:
        touched.add(index)
    for index, _ in outbound:
        touched.add(index)
    neighbour_roles = sorted({before_roles[index] for index in touched
                              if 0 <= index < len(before_roles)})

    return inbound, outbound, neighbour_roles


def _count(values) -> Dict[str, int]:
    counts = defaultdict(int)
    for value in values:
        counts[value] += 1
    return dict(counts)


def build_pairs(topologies: List[Dict], max_nodes: int = 0):
    """Match every topology against every one-node-smaller topology in the corpus."""

    by_signature = {}
    collisions = 0
    for record in topologies:
        signature = record["wl"]
        if signature in by_signature:
            # Same shape observed twice. Keep the better-observed measurement
            # rather than whichever happened to be read first.
            collisions += 1
            if record["observations"] > by_signature[signature]["observations"]:
                by_signature[signature] = record
        else:
            by_signature[signature] = record

    pairs = []
    seen = set()
    considered = 0

    for after in topologies:
        roles, edges = after["roles"], after["edges"]
        if max_nodes and len(roles) > max_nodes:
            continue
        for victim in range(len(roles)):
            considered += 1
            before_roles, before_edges = _drop_node(roles, edges, victim)
            if len(before_roles) < 2:
                continue
            before_signature = wl_signature(before_roles, before_edges)
            before = by_signature.get(before_signature)
            if before is None:
                continue
            if before_signature == after["wl"]:
                continue  # dropping a node cannot leave the graph unchanged

            key = (before_signature, after["wl"], roles[victim])
            if key in seen:
                continue
            seen.add(key)

            inbound, outbound, neighbour_roles = _attachment(edges, victim, before_roles)
            if not inbound and not outbound:
                continue  # a disconnected addition is not an intervention

            log_delta = math.log(after["tail_ms"] / before["tail_ms"])
            pairs.append({
                "before_sig": before_signature,
                "after_sig": after["wl"],
                "roles": before_roles,
                "edges": [[s, t, k] for s, t, k in before_edges],
                "add_role": roles[victim],
                "attach_in": [[index, kind] for index, kind in inbound],
                "attach_out": [[index, kind] for index, kind in outbound],
                "neighbour_roles": neighbour_roles,
                "tail_before": before["tail_ms"],
                "tail_after": after["tail_ms"],
                "log_delta": log_delta,
                # A pair is only as trustworthy as its thinner side: a topology
                # seen 13 times is far noisier than one seen 600, and averaging
                # the two counts would hide that.
                "observations": min(before["observations"], after["observations"]),
                "nodes_before": len(before_roles),
            })

    helped = sum(1 for pair in pairs if pair["log_delta"] < 0)
    stats = {
        "topologies_read": len(topologies),
        "distinct_signatures": len(by_signature),
        "signature_collisions": collisions,
        "node_drops_considered": considered,
        "pairs_found": len(pairs),
        "faster_after_change": helped,
        "slower_after_change": len(pairs) - helped,
        "faster_fraction": round(helped / len(pairs), 5) if pairs else None,
        "by_added_role": dict(sorted(
            _count(pair["add_role"] for pair in pairs).items(),
            key=lambda item: -item[1],
        )),
    }
    return pairs, stats


def _percentile(values, fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = min(len(ordered) - 1, max(0, int(round(fraction * (len(ordered) - 1)))))
    return ordered[position]


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract matched architecture pairs.")
    parser.add_argument("--dataset", type=Path, default=DATASET_FILE)
    parser.add_argument("--out", type=Path, default=PAIRS_FILE)
    parser.add_argument("--min-observations", type=int, default=MIN_TRACE_INSTANCES,
                        help="observation floor BOTH sides of a pair must clear")
    parser.add_argument("--max-nodes", type=int, default=0,
                        help="skip topologies larger than this (0 = no limit)")
    args = parser.parse_args()

    print("Reading " + str(args.dataset) + " ...")
    topologies = load_topologies(args.dataset, args.min_observations)
    print("  {:,} topologies clear the {}-observation floor".format(
        len(topologies), args.min_observations))

    print("Matching one-node-apart topologies ...")
    pairs, stats = build_pairs(topologies, max_nodes=args.max_nodes)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        for pair in pairs:
            handle.write(json.dumps(pair) + "\n")

    deltas = [pair["log_delta"] for pair in pairs]
    stats["log_delta_p10"] = round(_percentile(deltas, 0.10), 5)
    stats["log_delta_p50"] = round(_percentile(deltas, 0.50), 5)
    stats["log_delta_p90"] = round(_percentile(deltas, 0.90), 5)
    stats["effect_p10_percent"] = round((math.exp(stats["log_delta_p10"]) - 1) * 100, 1)
    stats["effect_p90_percent"] = round((math.exp(stats["log_delta_p90"]) - 1) * 100, 1)

    with open(PAIRS_STATS_FILE, "w", encoding="utf-8") as handle:
        json.dump(stats, handle, indent=2)

    print()
    print("=" * 78)
    print("MATCHED PAIRS")
    print("=" * 78)
    print("  pairs found                : {:,}".format(stats["pairs_found"]))
    if stats["pairs_found"]:
        print("  change made it FASTER      : {:,} ({:.1f}%)".format(
            stats["faster_after_change"], stats["faster_fraction"] * 100))
        print("  change made it SLOWER      : {:,} ({:.1f}%)".format(
            stats["slower_after_change"], (1 - stats["faster_fraction"]) * 100))
        print("  10th percentile effect     : {:+.0f}% latency".format(
            stats["effect_p10_percent"]))
        print("  90th percentile effect     : {:+.0f}% latency".format(
            stats["effect_p90_percent"]))
        print()
        print("  by added component:")
        for role, count in list(stats["by_added_role"].items())[:12]:
            print("    {:<14} {:>8,}".format(role, count))
    print()
    print("  written to " + str(args.out))
    print("  stats      " + str(PAIRS_STATS_FILE))


if __name__ == "__main__":
    main()
