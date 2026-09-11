"""Held-out report for the intervention-effect model.

The baseline is not 33%. Three-class accuracy against a random guess is the
wrong comparison, because nobody deploys a random guess -- they deploy a rule
("add a cache"), and a rule always predicts the same direction. So the number
that has to be beaten is whichever direction is more common in the corpus, and
the report says so in the same breath as the accuracy.

A per-intervention breakdown is printed alongside the aggregate. The model will
be better at some changes than others, and "68% on cache additions, 51% on queue
additions" is both more useful and more credible than one pooled number -- it
tells you which recommendations are safe to show a user.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

import numpy as np
import torch
from torch_geometric.loader import DataLoader

from .build_pairs import PAIRS_FILE
from .config import EVALUATION_DIR, RANDOM_SEED
from .delta_model import InterventionEffectModel
from .pair_dataset import (
    DEFAULT_DEAD_BAND,
    SIGN_CLASSES,
    load_pairs,
    split_by_before_topology,
)
from .train_delta import DELTA_MODEL_PATH, _direction_from_logits

DELTA_METRICS_PATH = EVALUATION_DIR / "delta_metrics_report.json"


def load_model(path: Path = DELTA_MODEL_PATH):
    if not path.exists():
        raise SystemExit(
            "No trained delta model at " + str(path)
            + ". Run `python -m microservices.train_delta --init-encoder` first."
        )
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    model = InterventionEffectModel(
        hidden_dim=checkpoint.get("hidden_dim", 96),
        num_layers=checkpoint.get("num_layers", 3),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model, checkpoint


def _proportion_interval(successes: int, total: int):
    if total == 0:
        return 0.0, 0.0, 0.0
    accuracy = successes / total
    error = math.sqrt(max(accuracy * (1 - accuracy), 1e-12) / total)
    return accuracy, accuracy - 1.96 * error, accuracy + 1.96 * error


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the intervention-effect model.")
    parser.add_argument("--pairs", type=Path, default=PAIRS_FILE)
    parser.add_argument("--dead-band", type=float, default=DEFAULT_DEAD_BAND)
    parser.add_argument("--max-records", type=int, default=0)
    args = parser.parse_args()

    model, checkpoint = load_model()

    print("Loading matched pairs ...")
    records = load_pairs(args.pairs, max_records=args.max_records, dead_band=args.dead_band)
    _, _, test_set = split_by_before_topology(records, seed=RANDOM_SEED)
    print("  {:,} held-out pairs (split by before-topology signature)".format(len(test_set)))

    loader = DataLoader(test_set, batch_size=256)

    predicted_direction: List[int] = []
    true_direction: List[int] = []
    predicted_sign: List[int] = []
    true_sign: List[int] = []
    predicted_magnitude: List[float] = []
    true_magnitude: List[float] = []
    helps_probability: List[float] = []
    roles: List[str] = []

    cursor = 0
    with torch.no_grad():
        for batch in loader:
            logits, magnitude = model(batch)
            probabilities = torch.softmax(logits, dim=1)
            size = int(batch.y.size(0))

            predicted_direction.extend(_direction_from_logits(logits).tolist())
            true_direction.extend(batch.direction.tolist())
            predicted_sign.extend(logits.argmax(dim=1).tolist())
            true_sign.extend(batch.y.tolist())
            predicted_magnitude.extend(magnitude.tolist())
            true_magnitude.extend(batch.log_delta.tolist())
            helps_probability.extend(probabilities[:, 0].tolist())
            roles.extend([test_set[cursor + i].add_role for i in range(size)])
            cursor += size

    total = len(true_direction)
    if total == 0:
        raise SystemExit("Held-out split is empty.")

    direction_hits = sum(1 for p, t in zip(predicted_direction, true_direction) if p == t)
    accuracy, lower, upper = _proportion_interval(direction_hits, total)

    helps_fraction = sum(1 for t in true_direction if t == 0) / total
    majority = max(helps_fraction, 1 - helps_fraction)

    sign_hits = sum(1 for p, t in zip(predicted_sign, true_sign) if p == t)
    sign_accuracy = sign_hits / total

    predicted_array = np.array(predicted_magnitude, dtype=np.float64)
    true_array = np.array(true_magnitude, dtype=np.float64)
    rmse = float(np.sqrt(np.mean((predicted_array - true_array) ** 2)))
    mae = float(np.mean(np.abs(predicted_array - true_array)))
    magnitude_correlation = 0.0
    if total > 2 and predicted_array.std() > 1e-9:
        magnitude_correlation = float(np.corrcoef(predicted_array, true_array)[0, 1])
        if not math.isfinite(magnitude_correlation):
            magnitude_correlation = 0.0

    # Context sensitivity. If the model predicts the same thing for every
    # instance of an intervention, it has learned a rule, not a context -- and a
    # rule is exactly what the matched-pair measurement says does not work.
    by_role_probabilities: Dict[str, List[float]] = defaultdict(list)
    for role, probability in zip(roles, helps_probability):
        by_role_probabilities[role].append(probability)

    context_spread = {
        role: {
            "n": len(values),
            "mean_p_helps": round(float(np.mean(values)), 5),
            "std_p_helps": round(float(np.std(values)), 5),
            "p10": round(float(np.percentile(values, 10)), 5),
            "p90": round(float(np.percentile(values, 90)), 5),
        }
        for role, values in sorted(by_role_probabilities.items(), key=lambda x: -len(x[1]))
    }

    by_role_accuracy: Dict[str, Dict] = {}
    grouped: Dict[str, List[int]] = defaultdict(list)
    for role, p, t in zip(roles, predicted_direction, true_direction):
        grouped[role].append(1 if p == t else 0)
    for role, hits in sorted(grouped.items(), key=lambda x: -len(x[1])):
        role_accuracy, role_lower, role_upper = _proportion_interval(sum(hits), len(hits))
        role_true = [t for r, t in zip(roles, true_direction) if r == role]
        role_helps = sum(1 for t in role_true if t == 0) / max(len(role_true), 1)
        by_role_accuracy[role] = {
            "n": len(hits),
            "direction_accuracy": round(role_accuracy, 5),
            "confidence_interval_95": [round(role_lower, 5), round(role_upper, 5)],
            "majority_baseline": round(max(role_helps, 1 - role_helps), 5),
            "beats_majority": bool(role_lower > max(role_helps, 1 - role_helps)),
        }

    report = {
        "model": "InfraZero intervention-effect model -- shared encoder, sign + magnitude heads",
        "task": "predict the direction and size of one architectural change",
        "data_source": "matched pairs from Alibaba cluster-trace-microservices v2021 + v2022",
        "test_set_size": total,
        "protocol": "split by before-topology signature; no base architecture spans two splits",
        "dead_band_log": args.dead_band,
        "headline": {
            "direction_accuracy": round(accuracy, 5),
            "confidence_interval_95": [round(lower, 5), round(upper, 5)],
            "coin_flip_baseline": 0.5,
            "majority_baseline": round(majority, 5),
            "beats_coin_flip": bool(lower > 0.5),
            "beats_majority_baseline": bool(lower > majority),
        },
        "three_class": {
            "sign_accuracy": round(sign_accuracy, 5),
            "classes": SIGN_CLASSES,
        },
        "magnitude": {
            "rmse_log": round(rmse, 5),
            "mae_log": round(mae, 5),
            "correlation_with_measured": round(magnitude_correlation, 5),
        },
        "per_intervention": by_role_accuracy,
        "context_sensitivity": context_spread,
        "training_checkpoint": {
            "epoch": checkpoint.get("epoch"),
            "warm_started": checkpoint.get("warm_started"),
        },
    }

    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)
    with open(DELTA_METRICS_PATH, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    print()
    print("=" * 78)
    print("INTERVENTION-EFFECT MODEL -- held-out test split")
    print("=" * 78)
    print("  direction accuracy    : {:.1%}   (95% CI {:.1%} - {:.1%})".format(
        accuracy, lower, upper))
    print("  coin flip             : 50.0%")
    print("  majority baseline     : {:.1%}".format(majority))
    print("  beats coin flip       : {}".format("YES" if lower > 0.5 else "NO"))
    print("  beats majority        : {}".format("YES" if lower > majority else "NO"))
    print()
    print("  3-class sign accuracy : {:.1%}".format(sign_accuracy))
    print("  log-delta RMSE        : {:.3f}".format(rmse))
    print("  magnitude correlation : {:+.3f}".format(magnitude_correlation))
    print()
    print("  per intervention:")
    for role, stats in by_role_accuracy.items():
        print("    {:<12} n={:>6,}  acc {:.1%}  vs majority {:.1%}   {}".format(
            role, stats["n"], stats["direction_accuracy"],
            stats["majority_baseline"],
            "beats it" if stats["beats_majority"] else "-"))
    print()
    print("  context sensitivity (spread of P(helps) within one intervention):")
    for role, stats in context_spread.items():
        print("    {:<12} mean {:.2f}  std {:.3f}  p10-p90 {:.2f}-{:.2f}".format(
            role, stats["mean_p_helps"], stats["std_p_helps"],
            stats["p10"], stats["p90"]))
    print()
    print("  written to " + str(DELTA_METRICS_PATH))


if __name__ == "__main__":
    main()
