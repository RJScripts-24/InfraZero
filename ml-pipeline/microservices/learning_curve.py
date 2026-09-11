"""Does more training data help? Measure it rather than assume it.

Downloading and parsing another slice of the Alibaba traces costs hours, so it
is worth knowing first whether data volume is what limits accuracy.

The method is the standard one: hold the validation set fixed, train on
increasing fractions of the training data, and look at the shape of the curve.

  * still climbing at 100%  -> more data will help, go and get it;
  * flat by 50%            -> the limit is the model or the task, and more data
                              would only buy compute time.

Run:  python -m microservices.learning_curve
"""

from __future__ import annotations

import argparse
import json
import time

import numpy as np
import torch
from torch_geometric.loader import DataLoader

from .config import CLASSES, EVALUATION_DIR, RANDOM_SEED
from .dataset import label_array, load_dataset
from .train import evaluate_split, run_training, set_seed, stratified_splits

FRACTIONS = (0.10, 0.25, 0.50, 1.00)


def main() -> None:
    parser = argparse.ArgumentParser(description="Measure accuracy against training-set size.")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--hidden-dim", type=int, default=160)
    parser.add_argument("--num-layers", type=int, default=4)
    parser.add_argument("--dropout", type=float, default=0.2)
    arguments = parser.parse_args()

    set_seed()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    print("loading dataset...")
    records = load_dataset()
    labels = label_array(records)
    train_idx, val_idx, _ = stratified_splits(labels)

    full_train = [records[i] for i in train_idx]
    validation = [records[i] for i in val_idx]
    train_labels = labels[train_idx]
    print(f"  {len(full_train):,} train / {len(validation):,} val (validation held fixed)\n")

    rng = np.random.default_rng(RANDOM_SEED)
    results = []

    for fraction in FRACTIONS:
        if fraction >= 1.0:
            subset = full_train
        else:
            # Stratified subsample so class balance is identical at every size --
            # otherwise the curve would confound size with class skew.
            keep = []
            for class_index in range(len(CLASSES)):
                pool = np.where(train_labels == class_index)[0]
                take = max(1, int(round(len(pool) * fraction)))
                keep.extend(rng.choice(pool, size=take, replace=False).tolist())
            subset = [full_train[i] for i in keep]

        started = time.time()
        model, history = run_training(
            subset,
            validation,
            device,
            epochs=arguments.epochs,
            patience=arguments.epochs,
            hidden_dim=arguments.hidden_dim,
            num_layers=arguments.num_layers,
            dropout=arguments.dropout,
            verbose=False,
        )
        accuracy, macro_f1, _, _ = evaluate_split(
            model, DataLoader(validation, batch_size=256, shuffle=False), device
        )
        train_accuracy, _, _, _ = evaluate_split(
            model, DataLoader(subset, batch_size=256, shuffle=False), device
        )
        elapsed = time.time() - started

        results.append(
            {
                "fraction": fraction,
                "train_size": len(subset),
                "val_accuracy": round(accuracy, 4),
                "val_macro_f1": round(macro_f1, 4),
                "train_accuracy": round(train_accuracy, 4),
                "gap": round(train_accuracy - accuracy, 4),
                "seconds": round(elapsed, 1),
            }
        )
        print(
            f"  {fraction:>5.0%}  n={len(subset):>6,}  "
            f"val_acc={accuracy:.4f}  val_f1={macro_f1:.4f}  "
            f"gap={train_accuracy - accuracy:+.4f}  ({elapsed:.0f}s)"
        )

    print("\n" + "=" * 72)
    print("LEARNING CURVE -- validation accuracy against training-set size")
    print("=" * 72)
    print(f"{'fraction':>9} {'train n':>9} {'val acc':>9} {'val F1':>9} {'gap':>9}")
    print("-" * 72)
    for row in results:
        print(
            f"{row['fraction']:>8.0%} {row['train_size']:>9,} "
            f"{row['val_accuracy']:>9.4f} {row['val_macro_f1']:>9.4f} {row['gap']:>+9.4f}"
        )
    print("=" * 72)

    # The verdict: how much did the last doubling of data actually buy?
    if len(results) >= 2:
        gain = results[-1]["val_accuracy"] - results[-2]["val_accuracy"]
        doubling = results[-1]["train_size"] / max(results[-2]["train_size"], 1)
        print(
            f"\nGoing from {results[-2]['train_size']:,} to {results[-1]['train_size']:,} "
            f"architectures ({doubling:.1f}x the data) changed validation accuracy by "
            f"{gain:+.4f}."
        )
        if gain < 0.01:
            projected = results[-1]["val_accuracy"] + gain * 3
            print(
                "The curve has flattened. Extrapolating the same trend, another "
                f"{doubling ** 3:.0f}x the data would reach roughly {projected:.1%} -- "
                "so more traces are not the way to raise this number."
            )
        else:
            print("The curve is still climbing; more data is worth collecting.")

    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)
    (EVALUATION_DIR / "learning_curve.json").write_text(
        json.dumps(results, indent=2), encoding="utf-8"
    )

    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        sizes = [r["train_size"] for r in results]
        figure, axis = plt.subplots(figsize=(7, 4.5))
        axis.plot(sizes, [r["val_accuracy"] for r in results], "o-", label="validation accuracy")
        axis.plot(sizes, [r["train_accuracy"] for r in results], "s--", label="train accuracy")
        axis.set_xscale("log")
        axis.set_xlabel("training architectures (log scale)")
        axis.set_ylabel("accuracy")
        axis.set_title("Learning curve: is accuracy limited by data volume?")
        axis.grid(alpha=0.3)
        axis.legend()
        figure.tight_layout()
        figure.savefig(EVALUATION_DIR / "learning_curve.png", dpi=140)
        plt.close(figure)
        print(f"\nfigure -> {EVALUATION_DIR / 'learning_curve.png'}")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
