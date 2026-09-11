"""The gate on the intervention-effect model.

Held-out accuracy cannot see the two ways this model fails most plausibly, so
they are asserted directly.

CHECK 1 -- it must beat the rule it replaces.
    The comparison is not 50% and it is not 33%. It is whichever direction is
    more common in the corpus, because "always say it gets slower" is a rule
    that needs no model. Beating it must survive a 95% interval, so a win of a
    fraction of a point on a small split does not count.

CHECK 2 -- it must disagree with itself across contexts.
    If the model predicts the same thing for every cache addition, it has
    learned "caches help" -- which is precisely the rule the matched-pair
    measurement says is a coin flip. A model that reproduces the rule while
    scoring well has found a shortcut, not the context.

CHECK 3 -- it must not collapse onto one class.
    A model that always answers "hurts" scores the majority baseline exactly and
    is worthless. The predicted distribution has to use its range.

Exit code is non-zero on any failure, so this can gate a commit.
"""

from __future__ import annotations

import math
import sys
from collections import defaultdict
from typing import Dict, List

import numpy as np
import torch
from torch_geometric.loader import DataLoader

from .config import RANDOM_SEED
from .evaluate_delta import load_model
from .pair_dataset import DEFAULT_DEAD_BAND, load_pairs, split_by_before_topology
from .train_delta import _direction_from_logits

# A model whose P(helps) varies by less than this within one intervention family
# is reproducing a rule. Chosen so that a spread of a couple of points either
# side of a fixed answer still fails.
MIN_CONTEXT_STD = 0.05

# No single predicted class may exceed this share of the held-out set.
MAX_CLASS_SHARE = 0.95


def main() -> int:
    failures: List[str] = []

    model, _ = load_model()
    records = load_pairs(dead_band=DEFAULT_DEAD_BAND)
    _, _, test_set = split_by_before_topology(records, seed=RANDOM_SEED)
    if not test_set:
        print("No held-out pairs; cannot run the gate.")
        return 1

    loader = DataLoader(test_set, batch_size=256)

    predicted_direction: List[int] = []
    true_direction: List[int] = []
    helps_probability: List[float] = []
    roles: List[str] = []

    cursor = 0
    with torch.no_grad():
        for batch in loader:
            logits, _ = model(batch)
            probabilities = torch.softmax(logits, dim=1)
            size = int(batch.y.size(0))
            predicted_direction.extend(_direction_from_logits(logits).tolist())
            true_direction.extend(batch.direction.tolist())
            helps_probability.extend(probabilities[:, 0].tolist())
            roles.extend([test_set[cursor + i].add_role for i in range(size)])
            cursor += size

    total = len(true_direction)
    hits = sum(1 for p, t in zip(predicted_direction, true_direction) if p == t)
    accuracy = hits / total
    error = math.sqrt(max(accuracy * (1 - accuracy), 1e-12) / total)
    lower = accuracy - 1.96 * error

    helps_fraction = sum(1 for t in true_direction if t == 0) / total
    majority = max(helps_fraction, 1 - helps_fraction)

    print("=" * 78)
    print("CHECK 1 -- must beat the rule it replaces")
    print("=" * 78)
    print("  held-out pairs        : {:,}".format(total))
    print("  direction accuracy    : {:.1%}  (95% CI lower bound {:.1%})".format(accuracy, lower))
    print("  coin flip             : 50.0%")
    print("  majority baseline     : {:.1%}".format(majority))
    if lower <= 0.5:
        failures.append(
            "direction accuracy does not beat a coin flip "
            "({:.1%}, CI lower {:.1%})".format(accuracy, lower)
        )
        print("  [FAIL] does not beat a coin flip")
    elif lower <= majority:
        failures.append(
            "direction accuracy does not beat always-guess-the-common-case "
            "({:.1%}, CI lower {:.1%} vs baseline {:.1%})".format(accuracy, lower, majority)
        )
        print("  [FAIL] beats a coin flip but not the majority rule")
    else:
        print("  [pass] beats both baselines")

    print()
    print("=" * 78)
    print("CHECK 2 -- must disagree with itself across contexts")
    print("=" * 78)
    grouped: Dict[str, List[float]] = defaultdict(list)
    for role, probability in zip(roles, helps_probability):
        grouped[role].append(probability)

    for role, values in sorted(grouped.items(), key=lambda item: -len(item[1])):
        if len(values) < 30:
            continue
        spread = float(np.std(values))
        verdict = "pass" if spread >= MIN_CONTEXT_STD else "FAIL"
        print("  {:<12} n={:>6,}  P(helps) mean {:.2f}  std {:.3f}   [{}]".format(
            role, len(values), float(np.mean(values)), spread, verdict))
        if spread < MIN_CONTEXT_STD:
            failures.append(
                "{} predictions barely vary with context (std {:.3f}) -- "
                "the model has learned a rule".format(role, spread)
            )

    print()
    print("=" * 78)
    print("CHECK 3 -- must not collapse onto one class")
    print("=" * 78)
    counts = np.bincount(np.array(predicted_direction), minlength=2).astype(np.float64)
    shares = counts / counts.sum()
    print("  predicted faster : {:.1%}".format(shares[0]))
    print("  predicted slower : {:.1%}".format(shares[1]))
    if shares.max() > MAX_CLASS_SHARE:
        failures.append(
            "the model answers the same way {:.1%} of the time".format(shares.max())
        )
        print("  [FAIL] effectively a constant predictor")
    else:
        print("  [pass] uses both answers")

    print()
    print("=" * 78)
    if failures:
        print("DELTA SANITY: {} FAILURE(S)".format(len(failures)))
        print("=" * 78)
        for failure in failures:
            print("  - " + failure)
        print()
        print("  A failure here is a real result, not a bug to work around. If the")
        print("  model cannot beat the rule, that is the finding worth reporting.")
        return 1

    print("DELTA SANITY: all checks passed")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
