"""Re-cut the training label from SIZE-RESIDUALISED measured tail latency.

The problem with the original target
------------------------------------
The first label was the tercile of measured p95 end-to-end latency. It is a real
production measurement, but latency grows with how many hops a request makes, so
the label partly grades graph *size* rather than architectural quality.

A model trained on it scored 76.4% on its held-out split and still graded the
published Uber and Netflix architectures F, degraded a quality-invariant design
from A to C purely as it grew, and graded a 30-node anti-pattern A at 81%
confidence -- above a 32-node excellent design at C.

The target that looked right and wasn't
---------------------------------------
The obvious fix is `tail_amplification` (tail_ms / p50_ms), which is scale-free
by construction and does kill the size confound (rho -0.047 vs node count).

Measured on this dataset, it introduces a worse one. Amplification correlates
**+0.165 with cache fraction**: a cache makes latency bimodal -- p50 is a hit,
p95 is a miss plus the backend fetch -- so caching mechanically inflates
tail/median even though it is unambiguously good for the system. Amplification
measures latency *predictability*, not resilience, and a grader trained on it
penalises exactly the components that make architectures scale. It is kept
available as `--target fragility` only so the comparison is reproducible.

What this target measures
-------------------------
Log p95 latency with the component explained by node count, edge count and path
depth regressed out. The grade then answers: **is this architecture slower than
a system of its shape should be?**

Only size and depth are residualised away, and that split is the whole point.
More hops cost more time whether a design is good or bad, so that part is not
the designer's fault and is removed. Everything the designer *does* control --
where caches sit, what is shared, what is decoupled -- stays in the residual for
the model to learn.

Measured on all 42,001 architectures:

    target                  vs node count   vs cache fraction
    tail_ms      (first)        +0.188          -0.003
    amplification (second)      -0.047          +0.165   <- penalises caching
    residual      (this)        +0.010          -0.102   <- rewards caching

...and then cut within size strata
----------------------------------
Residualising fixes the *average* size effect but not the tails, and the tails
are where this product lives. Under a single global tercile cut the 35-60 node
band came out **1.4% low / 67.1% medium / 31.5% high** -- a model fitted on that
has almost no example of a large architecture being low risk, so it cannot grade
one that way no matter how well built it is. That is precisely the regime the
Uber and Netflix diagrams occupy, and it is why a quality-invariant design still
drifted from A to C as it grew.

So the terciles are cut inside eight equal-count size strata instead. Every
class is then present at every size by construction, which is a stronger
guarantee than regressing size out and hoping the residual is homoscedastic.

It also sharpens what a grade means, in the direction the product wants:
*compared with real production systems of comparable size*, is this one slow?
Pass `--global-cut` to reproduce the unstratified behaviour.

The previous label is preserved on every record as `label_tail_ms`, so every
switch is reversible and the targets stay directly comparable.

Run:  python -m microservices.relabel                      # residual (default)
      python -m microservices.relabel --global-cut         # unstratified
      python -m microservices.relabel --target latency     # the original cut
      python -m microservices.relabel --target fragility   # the amplification cut
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from typing import Dict, List, Tuple

import numpy as np
from collections import deque

from .config import CLASSES, DATASET_FILE, DATASET_STATS_FILE

TARGETS = {
    # The recommended target. See the module docstring.
    "residual": "tail_ms",
    "fragility": "tail_amplification",
    "latency": "tail_ms",
}


def _max_depth(num_nodes: int, edges: List) -> int:
    """Longest path from an entry point, breadth-first."""

    successors: Dict[int, List[int]] = {i: [] for i in range(num_nodes)}
    in_degree = [0] * num_nodes
    for source, target, _ in edges:
        successors[int(source)].append(int(target))
        in_degree[int(target)] += 1

    roots = [i for i in range(num_nodes) if in_degree[i] == 0] or [0]
    depth = [-1] * num_nodes
    queue = deque()
    for root in roots:
        depth[root] = 0
        queue.append(root)
    while queue:
        current = queue.popleft()
        for neighbour in successors[current]:
            if depth[neighbour] < 0:
                depth[neighbour] = depth[current] + 1
                queue.append(neighbour)
    return max(value for value in depth if value >= 0)


def read_records() -> List[Dict]:
    records: List[Dict] = []
    with open(DATASET_FILE, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def shape_matrix(records: List[Dict]) -> np.ndarray:
    """The size/shape variables the residual is taken against.

    Deliberately only size and depth. These are the properties that make a
    request slower for reasons that are not architectural quality -- a request
    crossing more hops takes longer whether the design is good or bad. Anything
    a designer can actually change (cache placement, sharing, decoupling) is
    kept OUT, so that it stays in the residual for the model to learn.
    """

    rows = []
    for record in records:
        num_nodes = len(record.get("roles", []))
        edges = record.get("edges", [])
        rows.append([
            np.log1p(num_nodes),
            np.log1p(len(edges)),
            _max_depth(num_nodes, edges) if num_nodes else 0.0,
            1.0,
        ])
    return np.asarray(rows, dtype=np.float64)


def residual_values(records: List[Dict]) -> np.ndarray:
    """log tail latency, with the part explained by size and depth removed."""

    observed = np.log1p(np.asarray([float(r["tail_ms"]) for r in records]))
    shape = shape_matrix(records)
    coefficients, *_ = np.linalg.lstsq(shape, observed, rcond=None)
    predicted = shape @ coefficients
    explained = 1.0 - (observed - predicted).var() / max(observed.var(), 1e-12)
    print(f"  shape alone explains R^2 = {explained:.4f} of log tail latency; "
          f"the rest is what the model is asked to learn")
    return observed - predicted


def classify(value: float, low_cut: float, high_cut: float) -> str:
    """A lower value is a better architecture, so the scale is ascending."""

    if value <= low_cut:
        return CLASSES[0]   # low risk
    if value <= high_cut:
        return CLASSES[1]   # medium
    return CLASSES[2]       # high


# Equal-count size strata. Enough of them to track the size distribution, few
# enough that the largest stratum still holds hundreds of architectures per
# class -- terciles cut over a handful of samples are noise, not a label.
NUM_SIZE_STRATA = 8


def stratified_labels(records: List[Dict], values: np.ndarray) -> Tuple[List[str], List[Dict]]:
    """Cut terciles WITHIN size strata rather than over the whole dataset.

    A global cut leaves the label size-dependent at the tails even after the
    residual has removed the average effect. Measured on this dataset, the
    35-60 node bucket came out **1.4% low / 67.1% medium / 31.5% high** -- so a
    model fitted on it has almost no evidence that a large architecture can be
    low risk, and cannot grade one that way however good it is. That is the
    regime the Uber and Netflix diagrams live in.

    Cutting within strata makes each class present at every size by
    construction, which is a stronger guarantee than regressing size out and
    hoping the residual is homoscedastic. It also changes what the grade means,
    and the new meaning is the one the product wants: *compared with real
    systems of comparable size*, is this one slow?
    """

    order = sorted(range(len(records)), key=lambda i: len(records[i].get("roles", [])))
    stratum_size = max(len(order) // NUM_SIZE_STRATA, 1)

    labels: List[str] = [""] * len(records)
    summary: List[Dict] = []

    index = 0
    while index < len(order):
        chunk = order[index:index + stratum_size]
        # Absorb a short trailing remainder rather than cutting terciles over a
        # stub, then stop -- the remainder is by definition the last stratum.
        remainder = order[index + stratum_size:]
        if 0 < len(remainder) < stratum_size // 2:
            chunk = order[index:]
        index += len(chunk)
        if not chunk:
            break

        chunk_values = values[chunk]
        low_cut, high_cut = (float(x) for x in np.percentile(chunk_values, [100 / 3, 200 / 3]))
        counts = {name: 0 for name in CLASSES}
        for position in chunk:
            label = classify(float(values[position]), low_cut, high_cut)
            labels[position] = label
            counts[label] += 1

        node_counts = [len(records[i].get("roles", [])) for i in chunk]
        summary.append({
            "nodes_min": min(node_counts),
            "nodes_max": max(node_counts),
            "count": len(chunk),
            "low_medium": round(low_cut, 5),
            "medium_high": round(high_cut, 5),
            "class_counts": counts,
        })

    return labels, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Re-cut the label from a chosen measurement.")
    parser.add_argument(
        "--target",
        choices=sorted(TARGETS),
        default="residual",
        help="Which measured quantity the tercile cut is taken over.",
    )
    parser.add_argument(
        "--global-cut",
        action="store_true",
        help="Cut terciles over the whole dataset instead of within size strata. "
             "Leaves the label size-dependent at the tails -- kept only so the "
             "stratified and unstratified cuts can be compared.",
    )
    arguments = parser.parse_args()
    field = TARGETS[arguments.target]

    if not DATASET_FILE.exists():
        raise SystemExit(f"{DATASET_FILE} not found. Run build_dataset first.")

    print(f"reading {DATASET_FILE} ...")
    records = read_records()
    if not records:
        raise SystemExit("dataset is empty.")

    print(f"target        : {arguments.target}  ({field})")
    if arguments.target == "residual":
        values = residual_values(records)
    else:
        values = np.asarray([float(r[field]) for r in records])

    if arguments.global_cut:
        low_cut, high_cut = (float(x) for x in np.percentile(values, [100 / 3, 200 / 3]))
        labels = [classify(float(v), low_cut, high_cut) for v in values]
        strata = []
        print(f"tercile cuts  : low <= {low_cut:.4f} < medium <= {high_cut:.4f} < high (global)")
    else:
        labels, strata = stratified_labels(records, values)
        print(f"tercile cuts  : within {len(strata)} equal-count size strata")
        print()
        print(f"  {'nodes':>9} {'n':>7}   {'low':>6} {'medium':>7} {'high':>6}")
        for band in strata:
            counts = band["class_counts"]
            total = max(sum(counts.values()), 1)
            print(
                f"  {str(band['nodes_min']) + '-' + str(band['nodes_max']):>9} {band['count']:>7,}   "
                f"{100 * counts['low'] / total:>5.1f}% {100 * counts['medium'] / total:>6.1f}% "
                f"{100 * counts['high'] / total:>5.1f}%"
            )

    counts: Dict[str, int] = {name: 0 for name in CLASSES}
    node_totals: Dict[str, int] = {name: 0 for name in CLASSES}
    rewritten = 0

    directory = DATASET_FILE.parent
    handle, temporary_path = tempfile.mkstemp(dir=directory, suffix=".jsonl")
    os.close(handle)

    cache_totals: Dict[str, float] = {name: 0.0 for name in CLASSES}
    with open(temporary_path, "w", encoding="utf-8") as sink:
        for record, value, label in zip(records, values, labels):
            # Keep whatever label the record arrived with, once, so the switch
            # is reversible and the targets stay comparable.
            if "label_tail_ms" not in record:
                record["label_tail_ms"] = record.get("label")

            record["label"] = label
            record["label_target"] = arguments.target
            if arguments.target == "residual":
                record["tail_residual"] = round(float(value), 6)

            roles = record.get("roles", [])
            counts[label] += 1
            node_totals[label] += len(roles)
            cache_totals[label] += sum(1 for r in roles if r == "cache") / max(len(roles), 1)
            rewritten += 1
            sink.write(json.dumps(record, separators=(",", ":")) + "\n")

    os.replace(temporary_path, DATASET_FILE)

    print(f"\nrewrote {rewritten:,} records")
    print("\nclass balance and mean size -- a flat size column means the label is")
    print("measuring the architecture rather than its node count:")
    print(f"  {'class':<8} {'count':>8} {'mean nodes':>12} {'mean cache frac':>17}")
    for name in CLASSES:
        mean_nodes = node_totals[name] / max(counts[name], 1)
        mean_cache = cache_totals[name] / max(counts[name], 1)
        print(f"  {name:<8} {counts[name]:>8,} {mean_nodes:>12.2f} {mean_cache:>17.3f}")

    stats = {}
    if DATASET_STATS_FILE.exists():
        stats = json.loads(DATASET_STATS_FILE.read_text(encoding="utf-8"))
    stats["label_target"] = arguments.target
    stats["label_field"] = field
    stats["size_stratified"] = not arguments.global_cut
    stats["size_strata"] = strata
    stats["class_counts"] = counts
    stats["mean_nodes_per_class"] = {
        name: round(node_totals[name] / max(counts[name], 1), 3) for name in CLASSES
    }
    definitions = {
        "residual": (
            "Tercile of SIZE-RESIDUALISED measured tail latency: log p95 end-to-end "
            "response time with the component explained by node count, edge count and "
            "path depth regressed out. Answers 'is this architecture slower than a "
            "system of its shape should be', so a large design is not penalised for "
            "being large, while cache and queue placement -- which a designer controls "
            "-- stays in the residual for the model to learn. Derived only from "
            "observed latency; no latency, CPU or memory measurement is ever a model "
            "input."
        ),
        "fragility": (
            "Tercile of measured tail amplification (p95 divided by median response "
            "time). NOT RECOMMENDED: measured on this dataset it correlates +0.165 "
            "with cache fraction, because a cache makes latency bimodal and so "
            "inflates tail/median. It measures latency predictability, not resilience, "
            "and penalises caching."
        ),
        "latency": (
            "Tercile of raw measured p95 end-to-end response time. NOT RECOMMENDED: "
            "correlates +0.188 with node count, so it partly grades graph size."
        ),
    }
    stats["label_definition"] = definitions.get(
        arguments.target, stats.get("label_definition", "")
    )
    DATASET_STATS_FILE.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print(f"\nupdated {DATASET_STATS_FILE}")


if __name__ == "__main__":
    main()
