"""Does the CURRENT recommender's advice agree with measured reality?

This is the cheapest honest test available, and it should be run before any
effort goes into replacing the recommender.

`recommend.py` ranks a change by the drop in the grader's own predicted risk:
it mutates the graph, re-encodes it, re-scores it, and reports the difference.
Nothing anywhere checks that this corresponds to a real improvement. The model
is grading its own homework.

Matched pairs make the check direct. Each pair is a real before-topology, a real
after-topology differing by one component, and a *measured* tail latency for
both. So:

  the recommender's prediction  =  sign of (risk_before - risk_after)
  measured reality              =  sign of (tail_before - tail_after)

and the question is how often those agree on held-out data. The honest
comparison point is not 50% but whichever direction is more common in the
corpus, because "always say it gets slower" is a rule that requires no model at
all and must be beaten before anything else is claimed.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Dict, List

import numpy as np
import torch
from torch_geometric.data import Data

from .build_pairs import PAIRS_FILE
from .config import CLASSES, DATASET_DIR, MODEL_PATH
from .features import encode_graph
from .model import ArchitectureGrader

REPORT_PATH = DATASET_DIR / "current_recommender_validation.json"


def load_grader(path: Path = MODEL_PATH):
    if not path.exists():
        raise SystemExit("No trained grader at " + str(path))
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    model = ArchitectureGrader(num_classes=len(CLASSES))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def risk_of(model, roles, edges) -> float:
    """Expected risk on the ordered low<medium<high scale, as recommend.py computes it."""

    pairs = [(int(s), int(t)) for s, t, _ in edges]
    kinds = [str(k) for _, _, k in edges]
    node_features, edge_index, edge_features, graph_features = encode_graph(roles, pairs, kinds)

    data = Data(
        x=torch.from_numpy(node_features),
        edge_index=torch.from_numpy(edge_index),
        edge_attr=torch.from_numpy(edge_features),
    )
    data.graph_features = torch.from_numpy(graph_features).view(1, -1)
    data.batch = torch.zeros(data.x.size(0), dtype=torch.long)
    with torch.no_grad():
        probabilities = torch.softmax(model(data), dim=1)[0]
    return float(sum(index * float(probabilities[index]) for index in range(len(CLASSES))))


def reconstruct_after(pair: Dict):
    """Rebuild the after-topology from the before-topology plus the attachment."""

    roles = list(pair["roles"]) + [str(pair["add_role"])]
    new_index = len(roles) - 1
    edges = [(int(s), int(t), str(k)) for s, t, k in pair["edges"]]
    for index, kind in pair.get("attach_in", []):
        edges.append((int(index), new_index, str(kind)))
    for index, kind in pair.get("attach_out", []):
        edges.append((new_index, int(index), str(kind)))
    return roles, edges


def main() -> None:
    parser = argparse.ArgumentParser(description=
        "Check the current recommender's predicted direction against measured deltas.")
    parser.add_argument("--pairs", type=Path, default=PAIRS_FILE)
    parser.add_argument("--limit", type=int, default=6000,
                        help="pairs to score (each costs two forward passes)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not args.pairs.exists():
        raise SystemExit(str(args.pairs) + " not found. Run `python -m microservices.build_pairs`.")

    rows: List[Dict] = []
    with open(args.pairs, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    rng = np.random.default_rng(args.seed)
    if args.limit and len(rows) > args.limit:
        chosen = rng.choice(len(rows), size=args.limit, replace=False)
        rows = [rows[int(i)] for i in chosen]

    print("Scoring {:,} matched pairs with the trained grader ...".format(len(rows)))
    model = load_grader()

    agreements = 0
    scored = 0
    predicted_deltas: List[float] = []
    measured_deltas: List[float] = []
    by_role: Dict[str, Dict[str, int]] = {}
    predicted_helps = 0

    for position, pair in enumerate(rows):
        if position and position % 1000 == 0:
            print("  {:,} / {:,}".format(position, len(rows)))
        before_roles = list(pair["roles"])
        before_edges = [(int(s), int(t), str(k)) for s, t, k in pair["edges"]]
        after_roles, after_edges = reconstruct_after(pair)

        try:
            risk_before = risk_of(model, before_roles, before_edges)
            risk_after = risk_of(model, after_roles, after_edges)
        except (ValueError, AssertionError):
            continue

        # The recommender's own criterion, verbatim: a change is worth making
        # when it lowers the grader's expected risk.
        predicted_improvement = risk_before - risk_after
        model_says_helps = predicted_improvement > 0
        measured_helps = float(pair["log_delta"]) < 0

        if model_says_helps:
            predicted_helps += 1
        if model_says_helps == measured_helps:
            agreements += 1
        scored += 1

        predicted_deltas.append(-predicted_improvement)
        measured_deltas.append(float(pair["log_delta"]))

        role = str(pair["add_role"])
        bucket = by_role.setdefault(role, {"n": 0, "agree": 0})
        bucket["n"] += 1
        bucket["agree"] += 1 if model_says_helps == measured_helps else 0

    if scored == 0:
        raise SystemExit("Nothing could be scored.")

    measured_helps_fraction = sum(1 for d in measured_deltas if d < 0) / scored
    majority_baseline = max(measured_helps_fraction, 1 - measured_helps_fraction)
    accuracy = agreements / scored

    correlation = 0.0
    if len(predicted_deltas) > 2:
        correlation = float(np.corrcoef(predicted_deltas, measured_deltas)[0, 1])
        if not math.isfinite(correlation):
            correlation = 0.0

    # A 95% interval on a proportion, so "beats the baseline" is a claim with a
    # margin attached rather than a bare point estimate.
    standard_error = math.sqrt(max(accuracy * (1 - accuracy), 1e-12) / scored)
    lower = accuracy - 1.96 * standard_error
    upper = accuracy + 1.96 * standard_error

    beats_coin_flip = lower > 0.5
    beats_majority = lower > majority_baseline

    report = {
        "pairs_scored": scored,
        "direction_agreement": round(accuracy, 5),
        "confidence_interval_95": [round(lower, 5), round(upper, 5)],
        "coin_flip_baseline": 0.5,
        "majority_baseline": round(majority_baseline, 5),
        "measured_helps_fraction": round(measured_helps_fraction, 5),
        "model_predicted_helps_fraction": round(predicted_helps / scored, 5),
        "correlation_predicted_vs_measured": round(correlation, 5),
        "beats_coin_flip": bool(beats_coin_flip),
        "beats_majority_baseline": bool(beats_majority),
        "by_added_role": {
            role: {
                "n": bucket["n"],
                "agreement": round(bucket["agree"] / bucket["n"], 5),
            }
            for role, bucket in sorted(by_role.items(), key=lambda item: -item[1]["n"])
        },
    }

    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    print()
    print("=" * 78)
    print("DOES THE CURRENT RECOMMENDER AGREE WITH MEASUREMENT?")
    print("=" * 78)
    print("  pairs scored                  : {:,}".format(scored))
    print("  direction agreement           : {:.1%}  (95% CI {:.1%} - {:.1%})".format(
        accuracy, lower, upper))
    print("  coin flip                     : 50.0%")
    print("  majority baseline             : {:.1%}  (always say '{}')".format(
        majority_baseline,
        "faster" if measured_helps_fraction > 0.5 else "slower"))
    print("  correlation, predicted v real : {:+.3f}".format(correlation))
    print()
    print("  by added component:")
    for role, bucket in report["by_added_role"].items():
        print("    {:<12} n={:>6,}   agreement {:.1%}".format(
            role, bucket["n"], bucket["agreement"]))
    print()
    print("  beats a coin flip?        {}".format("YES" if beats_coin_flip else "NO"))
    print("  beats always-guess-one?   {}".format("YES" if beats_majority else "NO"))
    print()
    if not beats_majority:
        print("  VERDICT: the current recommendation ranking carries no measurable")
        print("           signal about real outcomes beyond guessing the common case.")
        print("           Its risk numbers should not be shown as predicted effects.")
    else:
        print("  VERDICT: the current ranking carries real signal. A delta model")
        print("           should still beat it, but this is not a rebuild from zero.")
    print()
    print("  written to " + str(REPORT_PATH))


if __name__ == "__main__":
    main()
