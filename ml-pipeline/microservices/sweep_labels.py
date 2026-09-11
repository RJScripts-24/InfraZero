"""Choose the label estimator on evidence rather than by guessing.

The risk grade is cut from a measured latency quantile, and two choices govern
how noisy that label is:

  * which tail quantile to use (p90 / p95 / p99);
  * how many traces a topology must be observed in before its tail is trusted.

Set the observation floor too low and the label is mostly sampling noise -- the
p99 of 8 samples is just the maximum -- which puts a ceiling on accuracy that no
model change can lift. Set it too high and the dataset shrinks until the model
has nothing to learn from.

This sweeps the grid, trains a short run at each setting, and prints the
trade-off so the final configuration can be justified rather than asserted. It
reports dataset size alongside accuracy on purpose: a setting that scores well
only because it kept 400 easy architectures is not a better setting, and the
table is meant to make that visible instead of hiding it behind one number.

Run:  python -m microservices.sweep_labels
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List

import numpy as np
import torch

from .build_dataset import merge_and_label
from .config import CLASSES, DATASET_DIR, RANDOM_SEED
from .dataset import label_array, load_dataset
from .train import evaluate_split, run_training, set_seed, stratified_splits
from torch_geometric.loader import DataLoader

SWEEP_DIR = DATASET_DIR / "sweep"


def evaluate_setting(
    quantile: float,
    min_observations: int,
    epochs: int,
    max_records: int,
) -> Dict:
    """Build a dataset at one setting and train a short model on it."""

    SWEEP_DIR.mkdir(parents=True, exist_ok=True)
    dataset_path = SWEEP_DIR / f"q{int(quantile * 100)}_n{min_observations}.jsonl"

    if not dataset_path.exists():
        merge_and_label(
            quantile=quantile,
            min_observations=min_observations,
            output_path=dataset_path,
        )

    set_seed(RANDOM_SEED)
    records = load_dataset(path=dataset_path, max_records=max_records)
    if len(records) < 300:
        return {
            "quantile": quantile,
            "min_observations": min_observations,
            "dataset_size": len(records),
            "skipped": "too few architectures to train on",
        }

    labels = label_array(records)
    train_idx, val_idx, test_idx = stratified_splits(labels)
    train_records = [records[i] for i in train_idx]
    val_records = [records[i] for i in val_idx]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, history = run_training(
        train_records, val_records, device, epochs=epochs, patience=epochs, verbose=False
    )

    val_accuracy, val_macro_f1, _, _ = evaluate_split(
        model, DataLoader(val_records, batch_size=256, shuffle=False), device
    )
    train_accuracy, _, _, _ = evaluate_split(
        model, DataLoader(train_records, batch_size=256, shuffle=False), device
    )

    median_observations = float(np.median([int(item.observations) for item in records]))

    return {
        "quantile": quantile,
        "min_observations": min_observations,
        "dataset_size": len(records),
        "median_observations": median_observations,
        "val_accuracy": round(val_accuracy, 4),
        "val_macro_f1": round(val_macro_f1, 4),
        "train_accuracy": round(train_accuracy, 4),
        "gap": round(train_accuracy - val_accuracy, 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Sweep label-estimator settings.")
    parser.add_argument("--epochs", type=int, default=35, help="Short runs -- this ranks settings, it does not produce the final model.")
    parser.add_argument("--max-records", type=int, default=40000)
    parser.add_argument(
        "--quantiles", type=float, nargs="+", default=[0.90, 0.95, 0.99]
    )
    parser.add_argument(
        "--min-observations", type=int, nargs="+", default=[8, 25, 50, 100, 250]
    )
    arguments = parser.parse_args()

    results: List[Dict] = []
    for quantile in arguments.quantiles:
        for min_observations in arguments.min_observations:
            print(f"\n{'=' * 70}")
            print(f"setting: p{int(quantile * 100)}, min {min_observations} observations")
            print("=" * 70)
            outcome = evaluate_setting(
                quantile, min_observations, arguments.epochs, arguments.max_records
            )
            results.append(outcome)
            if "skipped" in outcome:
                print(f"  skipped: {outcome['skipped']} ({outcome['dataset_size']} records)")
            else:
                print(
                    f"  n={outcome['dataset_size']:,}  "
                    f"val_acc={outcome['val_accuracy']:.4f}  "
                    f"val_f1={outcome['val_macro_f1']:.4f}  "
                    f"gap={outcome['gap']:+.4f}"
                )

    usable = [r for r in results if "skipped" not in r]
    print("\n" + "=" * 78)
    print("LABEL ESTIMATOR SWEEP")
    print("=" * 78)
    print(f"{'quantile':>9} {'min obs':>8} {'n':>9} {'med obs':>9} {'val acc':>9} {'val F1':>9} {'gap':>8}")
    print("-" * 78)
    for row in sorted(usable, key=lambda r: -r["val_accuracy"]):
        print(
            f"{'p' + str(int(row['quantile'] * 100)):>9} {row['min_observations']:>8,} "
            f"{row['dataset_size']:>9,} {row['median_observations']:>9,.0f} "
            f"{row['val_accuracy']:>9.4f} {row['val_macro_f1']:>9.4f} {row['gap']:>+8.4f}"
        )
    print("=" * 78)

    if usable:
        best = max(usable, key=lambda r: r["val_accuracy"])
        print(
            f"\nhighest validation accuracy: p{int(best['quantile'] * 100)} at "
            f"min {best['min_observations']} observations "
            f"({best['val_accuracy']:.1%} on {best['dataset_size']:,} architectures)"
        )
        print(
            "Read this alongside the dataset size: a setting that wins by discarding "
            "most of the data has bought accuracy with coverage, not with skill."
        )


if __name__ == "__main__":
    main()
