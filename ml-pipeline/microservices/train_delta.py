"""Fit the intervention-effect model on matched architecture pairs.

The split is by *before-topology signature*, not by pair. Splitting by pair
would put "add a cache to topology X" in train and "add a queue to topology X"
in test; the encoder would have memorised X and the held-out number would be
measuring recall rather than generalisation.

Early stopping watches held-out **binary direction accuracy**, because that is
the number the product depends on and the number that has an external baseline
to beat. A model that improves its regression loss while getting the direction
wrong more often is getting worse at the only job that matters.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Dict, List

import numpy as np
import torch
from torch import nn
from torch_geometric.loader import DataLoader

from .build_pairs import PAIRS_FILE
from .config import BEST_MODEL_PATH, MODEL_DIR, RANDOM_SEED
from .delta_model import InterventionEffectModel, load_pretrained_encoder
from .pair_dataset import (
    DEFAULT_DEAD_BAND,
    SIGN_CLASSES,
    load_pairs,
    split_by_before_topology,
)

DELTA_MODEL_PATH = MODEL_DIR / "delta_model.pt"
DELTA_BEST_PATH = MODEL_DIR / "delta_model_best.pt"
DELTA_HISTORY_PATH = MODEL_DIR / "delta_training_history.json"


def _direction_from_logits(logits: torch.Tensor) -> torch.Tensor:
    """Collapse the 3-class head onto a binary helps/hurts call.

    "No clear effect" is not an option when the question is which way it goes,
    so the dead-band class is broken by whichever of helps/hurts the model
    scored higher. This keeps the headline number directly comparable to a coin
    flip instead of quietly scoring the abstentions as correct.
    """

    return (logits[:, 2] > logits[:, 0]).long()


def evaluate(model: nn.Module, loader: DataLoader, device) -> Dict:
    model.eval()
    sign_correct = 0
    direction_correct = 0
    total = 0
    squared_error = 0.0
    absolute_error = 0.0

    with torch.no_grad():
        for batch in loader:
            batch = batch.to(device)
            logits, magnitude = model(batch)
            sign_correct += int((logits.argmax(dim=1) == batch.y).sum())
            direction_correct += int((_direction_from_logits(logits) == batch.direction).sum())
            total += int(batch.y.size(0))
            error = magnitude - batch.log_delta
            squared_error += float((error ** 2).sum())
            absolute_error += float(error.abs().sum())

    if total == 0:
        return {"sign_accuracy": 0.0, "direction_accuracy": 0.0, "rmse": 0.0, "mae": 0.0, "n": 0}

    return {
        "sign_accuracy": sign_correct / total,
        "direction_accuracy": direction_correct / total,
        "rmse": (squared_error / total) ** 0.5,
        "mae": absolute_error / total,
        "n": total,
    }


def class_weights(records: List, device) -> torch.Tensor:
    counts = np.zeros(len(SIGN_CLASSES), dtype=np.float64)
    for record in records:
        counts[int(record.y.item())] += 1.0
    counts = np.maximum(counts, 1.0)
    weights = counts.sum() / (len(SIGN_CLASSES) * counts)
    return torch.tensor(weights, dtype=torch.float, device=device)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the intervention-effect model.")
    parser.add_argument("--pairs", type=Path, default=PAIRS_FILE)
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--dropout", type=float, default=0.25)
    parser.add_argument("--patience", type=int, default=12)
    parser.add_argument("--dead-band", type=float, default=DEFAULT_DEAD_BAND)
    parser.add_argument("--magnitude-weight", type=float, default=0.3)
    parser.add_argument("--max-records", type=int, default=0)
    parser.add_argument("--init-encoder", action="store_true",
                        help="warm-start the encoder from the trained grader")
    args = parser.parse_args()

    torch.manual_seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)
    device = torch.device("cpu")

    print("Loading matched pairs ...")
    records = load_pairs(args.pairs, max_records=args.max_records, dead_band=args.dead_band)
    if not records:
        raise SystemExit("No usable pairs. Run `python -m microservices.build_pairs` first.")

    train_set, validation_set, test_set = split_by_before_topology(records, seed=RANDOM_SEED)
    print("  {:,} pairs -> {:,} train / {:,} validation / {:,} test".format(
        len(records), len(train_set), len(validation_set), len(test_set)))
    print("  split by before-topology signature, so no base architecture spans two splits")

    directions = np.array([int(r.direction.item()) for r in train_set])
    majority = float(max((directions == 0).mean(), (directions == 1).mean()))
    print("  training-set direction balance: {:.1%} faster / {:.1%} slower".format(
        float((directions == 0).mean()), float((directions == 1).mean())))
    print("  BASELINE TO BEAT: {:.1%} (always predicting the majority direction)".format(majority))

    model = InterventionEffectModel(dropout=args.dropout).to(device)
    warm_started = False
    if args.init_encoder:
        warm_started = load_pretrained_encoder(model, BEST_MODEL_PATH)
        print("  encoder warm start from the grader: "
              + ("yes" if warm_started else "NO -- training the encoder from scratch"))

    train_loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True)
    validation_loader = DataLoader(validation_set, batch_size=256)
    test_loader = DataLoader(test_set, batch_size=256)

    optimiser = torch.optim.AdamW(
        model.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay
    )
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimiser, mode="max", factor=0.5, patience=4
    )
    sign_loss_fn = nn.CrossEntropyLoss(weight=class_weights(train_set, device), reduction="none")
    magnitude_loss_fn = nn.SmoothL1Loss(reduction="none")

    history = []
    best_direction = 0.0
    best_epoch = -1
    epochs_without_gain = 0
    started = time.time()

    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        seen = 0
        for batch in train_loader:
            batch = batch.to(device)
            optimiser.zero_grad()
            logits, magnitude = model(batch)

            weight = batch.confidence.view(-1)
            sign_loss = (sign_loss_fn(logits, batch.y) * weight).mean()
            magnitude_loss = (
                magnitude_loss_fn(magnitude, batch.log_delta) * weight
            ).mean()
            loss = sign_loss + args.magnitude_weight * magnitude_loss

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimiser.step()

            running += float(loss) * int(batch.y.size(0))
            seen += int(batch.y.size(0))

        train_loss = running / max(seen, 1)
        validation = evaluate(model, validation_loader, device)
        scheduler.step(validation["direction_accuracy"])

        history.append({
            "epoch": epoch,
            "train_loss": round(train_loss, 5),
            "validation_sign_accuracy": round(validation["sign_accuracy"], 5),
            "validation_direction_accuracy": round(validation["direction_accuracy"], 5),
            "validation_rmse": round(validation["rmse"], 5),
        })

        marker = ""
        if validation["direction_accuracy"] > best_direction + 1e-5:
            best_direction = validation["direction_accuracy"]
            best_epoch = epoch
            epochs_without_gain = 0
            torch.save({
                "model_state_dict": model.state_dict(),
                "epoch": epoch,
                "validation_direction_accuracy": best_direction,
                "dead_band": args.dead_band,
                "hidden_dim": model.hidden_dim,
                "num_layers": model.num_layers,
            }, DELTA_BEST_PATH)
            marker = "  <- best"
        else:
            epochs_without_gain += 1

        print("  epoch {:>3}  loss {:.4f}  val direction {:.3f}  val sign {:.3f}{}".format(
            epoch, train_loss, validation["direction_accuracy"],
            validation["sign_accuracy"], marker))

        if epochs_without_gain >= args.patience:
            print("  early stop: {} epochs without a direction gain".format(args.patience))
            break

    elapsed = time.time() - started

    if DELTA_BEST_PATH.exists():
        checkpoint = torch.load(DELTA_BEST_PATH, map_location=device, weights_only=False)
        model.load_state_dict(checkpoint["model_state_dict"])

    test = evaluate(model, test_loader, device)

    torch.save({
        "model_state_dict": model.state_dict(),
        "epoch": best_epoch,
        "dead_band": args.dead_band,
        "hidden_dim": model.hidden_dim,
        "num_layers": model.num_layers,
        "test_direction_accuracy": test["direction_accuracy"],
        "test_sign_accuracy": test["sign_accuracy"],
        "majority_baseline": majority,
        "warm_started": warm_started,
    }, DELTA_MODEL_PATH)

    with open(DELTA_HISTORY_PATH, "w", encoding="utf-8") as handle:
        json.dump({
            "history": history,
            "best_epoch": best_epoch,
            "majority_baseline": majority,
            "test": test,
            "elapsed_seconds": round(elapsed, 1),
            "hyperparameters": vars(args) | {"pairs": str(args.pairs)},
        }, handle, indent=2, default=str)

    print()
    print("=" * 78)
    print("TRAINED -- held-out test split, read once")
    print("=" * 78)
    print("  direction accuracy   : {:.1%}".format(test["direction_accuracy"]))
    print("  majority baseline    : {:.1%}".format(majority))
    print("  coin flip            : 50.0%")
    print("  3-class sign accuracy: {:.1%}".format(test["sign_accuracy"]))
    print("  log-delta RMSE       : {:.3f}".format(test["rmse"]))
    print()
    print("  saved to " + str(DELTA_MODEL_PATH))
    print("  Now run: python -m microservices.evaluate_delta")


if __name__ == "__main__":
    main()
