"""Train the GhostTrace architecture-grading GNN.

Protocol
--------
A stratified 70/15/15 split into train / validation / test. Validation drives
early stopping and every hyper-parameter choice; the test split is read exactly
once, at the end, by `evaluate.py`. Reporting a number that was itself used to
pick the stopping epoch would inflate it, which is the whole reason the third
split exists.

Each sample is a *distinct* topology -- the dataset builder collapsed traces
onto their structural signature -- so no architecture can appear in more than
one split. The model is therefore always judged on topologies it has never seen.

Over- and under-fitting are watched directly: the train/validation accuracy gap
is logged every epoch and lands in the training history, and early stopping on
validation macro-F1 halts the run once generalisation stops improving.
"""

from __future__ import annotations

import argparse
import json
import random
import time
from typing import Dict, List, Tuple

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from torch_geometric.loader import DataLoader

from .config import (
    BEST_MODEL_PATH,
    CLASSES,
    MODEL_PATH,
    RANDOM_SEED,
    TRAINING_HISTORY_PATH,
)
from .dataset import label_array, load_dataset
from .deployment_dataset import load_deployment_dataset, role_coverage
from .model import ArchitectureGrader
from .pretrain import PRETRAIN_CHECKPOINT
from .pretrain import PRETRAIN_CHECKPOINT

TRAIN_FRACTION = 0.70
VAL_FRACTION = 0.15
TEST_FRACTION = 0.15


def set_seed(seed: int = RANDOM_SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def stratified_splits(labels: np.ndarray, seed: int = RANDOM_SEED):
    """Stratified 70/15/15 index split."""

    indices = np.arange(len(labels))
    train_idx, holdout_idx = train_test_split(
        indices,
        test_size=VAL_FRACTION + TEST_FRACTION,
        stratify=labels,
        random_state=seed,
    )
    relative_test = TEST_FRACTION / (VAL_FRACTION + TEST_FRACTION)
    val_idx, test_idx = train_test_split(
        holdout_idx,
        test_size=relative_test,
        stratify=labels[holdout_idx],
        random_state=seed,
    )
    return train_idx, val_idx, test_idx


def build_splits(measured_records, include_simulated: bool, verbose: bool = True):
    """Split every label source separately, then concatenate.

    Both `train.py` and `evaluate.py` call this, so the two cannot disagree
    about which records are held out. That matters more than usual here: the
    checkpoint can no longer store plain indices into a single pooled list,
    because the pool is now built from two corpora with different label
    semantics.

    Splitting each source separately, rather than pooling first and splitting
    once, keeps their proportions identical across train, validation and test.
    Pooled splitting would let the mix drift between splits, so a change in test
    accuracy could be nothing more than a change in how much of the test set came
    from the simulator instead of from measurement.
    """

    def split_one(source_records):
        if not source_records:
            return [], [], []
        source_labels = label_array(source_records)
        train_i, val_i, test_i = stratified_splits(source_labels)
        return (
            [source_records[i] for i in train_i],
            [source_records[i] for i in val_i],
            [source_records[i] for i in test_i],
        )

    measured_train, measured_val, measured_test = split_one(measured_records)

    simulated = []
    if include_simulated:
        if verbose:
            print("\nloading simulator-labelled deployments...")
        simulated = load_deployment_dataset(verbose=verbose)
        if simulated and verbose:
            coverage = role_coverage(simulated)
            trace_only = ("loadbalancer", "worker", "batch")
            gained = {name: coverage.get(name, 0) for name in trace_only}
            print(f"    roles the traces cannot express, now supervised: {gained}")
    simulated_train, simulated_val, simulated_test = split_one(simulated)

    train_records = measured_train + simulated_train
    val_records = measured_val + simulated_val
    test_records = measured_test + simulated_test

    if verbose:
        print(
            f"\n  split: {len(train_records):,} train / {len(val_records):,} val / "
            f"{len(test_records):,} test (test held out until evaluation)"
        )
        if simulated:
            print(f"    measured  : {len(measured_train):,} / {len(measured_val):,} / "
                  f"{len(measured_test):,}")
            print(f"    simulated : {len(simulated_train):,} / {len(simulated_val):,} / "
                  f"{len(simulated_test):,}")
        print()

    return train_records, val_records, test_records


def weighted_cross_entropy(
    logits: torch.Tensor,
    targets: torch.Tensor,
    sample_weights: torch.Tensor,
    class_weights: torch.Tensor,
    label_smoothing: float = 0.05,
) -> torch.Tensor:
    """Cross-entropy weighted per-sample by how well-observed the label is."""

    losses = F.cross_entropy(
        logits,
        targets,
        weight=class_weights,
        reduction="none",
        label_smoothing=label_smoothing,
    )
    return (losses * sample_weights).sum() / sample_weights.sum().clamp(min=1e-9)


@torch.no_grad()
def evaluate_split(model, loader, device) -> Tuple[float, float, np.ndarray, np.ndarray]:
    """Return (accuracy, macro F1, predictions, targets) for a loader."""

    model.eval()
    predictions: List[int] = []
    targets: List[int] = []

    for batch in loader:
        batch = batch.to(device)
        logits = model(batch)
        predictions.extend(logits.argmax(dim=1).cpu().tolist())
        targets.extend(batch.y.cpu().tolist())

    if not targets:
        return 0.0, 0.0, np.array([]), np.array([])

    predictions_np = np.array(predictions)
    targets_np = np.array(targets)
    accuracy = float((predictions_np == targets_np).mean())
    macro_f1 = float(f1_score(targets_np, predictions_np, average="macro", zero_division=0))
    return accuracy, macro_f1, predictions_np, targets_np


def run_training(
    train_records,
    val_records,
    device,
    epochs: int = 120,
    batch_size: int = 128,
    learning_rate: float = 1e-3,
    weight_decay: float = 1e-4,
    dropout: float = 0.25,
    patience: int = 25,
    hidden_dim: int = 96,
    num_layers: int = 3,
    verbose: bool = True,
    init_encoder: bool = False,
) -> Tuple[ArchitectureGrader, Dict]:
    """Train one model, early-stopping on validation macro-F1."""

    train_loader = DataLoader(train_records, batch_size=batch_size, shuffle=True, drop_last=True)
    eval_train_loader = DataLoader(train_records, batch_size=256, shuffle=False)
    val_loader = DataLoader(val_records, batch_size=256, shuffle=False)

    train_labels = label_array(train_records)
    counts = np.bincount(train_labels, minlength=len(CLASSES)).astype(np.float64)
    class_weights = torch.tensor(
        counts.sum() / (len(CLASSES) * np.maximum(counts, 1.0)), dtype=torch.float, device=device
    )

    model = ArchitectureGrader(
        num_classes=len(CLASSES), hidden_dim=hidden_dim, num_layers=num_layers, dropout=dropout
    ).to(device)

    if init_encoder:
        # Start from the self-supervised encoder rather than from scratch. This
        # is what makes the widened role vocabulary legitimate: seven of the
        # twelve role dimensions never occur in an Alibaba call trace, so a
        # from-scratch fit here would leave them meaningless and the model would
        # meet a load balancer or a batch tier for the first time at inference.
        # Pretraining on real deployment manifests populates them beforehand.
        if not PRETRAIN_CHECKPOINT.exists():
            raise SystemExit(
                f"--init-encoder given but {PRETRAIN_CHECKPOINT} does not exist. "
                "Run `python -m microservices.pretrain` first."
            )
        checkpoint = torch.load(PRETRAIN_CHECKPOINT, map_location=device, weights_only=False)
        pretrained = checkpoint.get("architecture", {})
        if (pretrained.get("hidden_dim") != hidden_dim
                or pretrained.get("num_layers") != num_layers):
            raise SystemExit(
                f"pretrained encoder is {pretrained.get('hidden_dim')}x"
                f"{pretrained.get('num_layers')} but training was asked for "
                f"{hidden_dim}x{num_layers}. Re-run pretrain with matching shape."
            )
        model.encoder.load_state_dict(checkpoint["encoder_state_dict"])
        if verbose:
            corpus = checkpoint.get("corpus", {})
            print(
                f"  encoder initialised from {PRETRAIN_CHECKPOINT.name} "
                f"(pretrained on {sum(corpus.values()):,} real architectures)"
            )
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer,
        max_lr=learning_rate,
        total_steps=max(epochs * max(len(train_loader), 1), 1),
        pct_start=0.25,
    )

    history = {
        "epoch": [],
        "train_loss": [],
        "train_accuracy": [],
        "val_accuracy": [],
        "val_macro_f1": [],
        "generalisation_gap": [],
    }
    best_state = None
    best_val_f1 = -1.0
    best_epoch = 0
    stale_epochs = 0

    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        batches = 0

        for batch in train_loader:
            batch = batch.to(device)
            optimizer.zero_grad()
            logits = model(batch)
            loss = weighted_cross_entropy(
                logits, batch.y, batch.confidence.view(-1), class_weights
            )
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=2.0)
            optimizer.step()
            scheduler.step()
            running_loss += float(loss.item())
            batches += 1

        train_accuracy, _, _, _ = evaluate_split(model, eval_train_loader, device)
        val_accuracy, val_macro_f1, _, _ = evaluate_split(model, val_loader, device)
        average_loss = running_loss / max(batches, 1)
        gap = train_accuracy - val_accuracy

        history["epoch"].append(epoch)
        history["train_loss"].append(round(average_loss, 5))
        history["train_accuracy"].append(round(train_accuracy, 5))
        history["val_accuracy"].append(round(val_accuracy, 5))
        history["val_macro_f1"].append(round(val_macro_f1, 5))
        history["generalisation_gap"].append(round(gap, 5))

        if val_macro_f1 > best_val_f1 + 1e-5:
            best_val_f1 = val_macro_f1
            best_epoch = epoch
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            stale_epochs = 0
            marker = "  <- best"
        else:
            stale_epochs += 1
            marker = ""

        if verbose:
            print(
                f"epoch {epoch:3d} | loss {average_loss:.4f} | "
                f"train_acc {train_accuracy:.4f} | val_acc {val_accuracy:.4f} | "
                f"val_f1 {val_macro_f1:.4f} | gap {gap:+.4f}{marker}"
            )

        if stale_epochs >= patience:
            if verbose:
                print(f"early stop at epoch {epoch} (no val gain for {patience} epochs)")
            break

    if best_state is not None:
        model.load_state_dict(best_state)

    history["best_epoch"] = best_epoch
    history["best_val_macro_f1"] = round(best_val_f1, 5)
    if best_epoch:
        position = history["epoch"].index(best_epoch)
        history["best_val_accuracy"] = history["val_accuracy"][position]
        history["best_train_accuracy"] = history["train_accuracy"][position]
        history["best_generalisation_gap"] = history["generalisation_gap"][position]

    return model, history


def cross_validate(records, device, folds: int = 5, **kwargs) -> Dict:
    """Stratified k-fold on train+val, to show the result is not a lucky split."""

    labels = label_array(records)
    splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=RANDOM_SEED)
    accuracies: List[float] = []
    macro_f1s: List[float] = []

    for fold, (train_positions, val_positions) in enumerate(splitter.split(np.zeros(len(labels)), labels), start=1):
        fold_train = [records[i] for i in train_positions]
        fold_val = [records[i] for i in val_positions]
        model, _ = run_training(fold_train, fold_val, device, verbose=False, **kwargs)
        loader = DataLoader(fold_val, batch_size=256, shuffle=False)
        accuracy, macro_f1, _, _ = evaluate_split(model, loader, device)
        accuracies.append(accuracy)
        macro_f1s.append(macro_f1)
        print(f"  fold {fold}/{folds}: accuracy {accuracy:.4f}  macro-F1 {macro_f1:.4f}")

    return {
        "folds": folds,
        "accuracy_mean": round(float(np.mean(accuracies)), 5),
        "accuracy_std": round(float(np.std(accuracies)), 5),
        "macro_f1_mean": round(float(np.mean(macro_f1s)), 5),
        "macro_f1_std": round(float(np.std(macro_f1s)), 5),
        "accuracy_per_fold": [round(a, 5) for a in accuracies],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the architecture-grading GNN.")
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--dropout", type=float, default=0.25)
    parser.add_argument("--patience", type=int, default=25)
    parser.add_argument("--hidden-dim", type=int, default=96)
    parser.add_argument("--num-layers", type=int, default=3)
    parser.add_argument("--max-records", type=int, default=0)
    parser.add_argument("--cross-validate", action="store_true", help="Also run 5-fold CV.")
    parser.add_argument(
        "--include-simulated",
        action="store_true",
        help="Also train on the simulator-labelled deployment corpus. This is "
             "what gives the grading head labelled examples of load balancers, "
             "batch tiers and async workers -- roles an Alibaba call trace "
             "cannot express, which nonetheless make up roughly a third of a "
             "real architecture diagram.",
    )
    parser.add_argument(
        "--init-encoder",
        action="store_true",
        help="Initialise the encoder from the self-supervised pretraining "
             "checkpoint instead of from scratch. Required for the widened "
             "role vocabulary to be meaningful -- see pretrain.py.",
    )
    arguments = parser.parse_args()

    set_seed()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")

    started = time.time()
    print("loading dataset...")
    records = load_dataset(max_records=arguments.max_records)
    labels = label_array(records)
    print(f"  {len(records):,} architectures loaded in {time.time() - started:.1f}s")
    distribution = {name: int((labels == index).sum()) for index, name in enumerate(CLASSES)}
    print(f"  class distribution: {distribution}")

    train_records, val_records, test_records = build_splits(
        records, include_simulated=arguments.include_simulated
    )

    hyperparameters = dict(
        epochs=arguments.epochs,
        batch_size=arguments.batch_size,
        learning_rate=arguments.learning_rate,
        weight_decay=arguments.weight_decay,
        dropout=arguments.dropout,
        patience=arguments.patience,
        hidden_dim=arguments.hidden_dim,
        num_layers=arguments.num_layers,
        init_encoder=arguments.init_encoder,
    )

    model, history = run_training(train_records, val_records, device, **hyperparameters)

    cv_summary = None
    if arguments.cross_validate:
        print("\n5-fold cross-validation on train+val:")
        cv_summary = cross_validate(train_records + val_records, device, folds=5, **hyperparameters)
        print(
            f"  CV accuracy {cv_summary['accuracy_mean']:.4f} +/- {cv_summary['accuracy_std']:.4f}"
        )

    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "classes": CLASSES,
            "num_node_features": model.encoder.input_proj.in_features,
            # Recorded so evaluation and the inference server rebuild the same
            # shape rather than assuming the defaults this run may not have used.
            "architecture": {
                "hidden_dim": model.hidden_dim,
                "num_layers": model.num_layers,
            },
            "hyperparameters": hyperparameters,
            # The split is no longer a set of indices into one pooled list: the
            # pool is built from two corpora with different label semantics, so
            # what is recorded is the RECIPE. `evaluate.py` calls the same
            # `build_splits` with this flag and reconstructs the identical
            # held-out set.
            "include_simulated": arguments.include_simulated,
            "cross_validation": cv_summary,
        },
        MODEL_PATH,
    )
    torch.save(model.state_dict(), BEST_MODEL_PATH)

    history["cross_validation"] = cv_summary
    history["class_distribution"] = distribution
    history["split_sizes"] = {
        "train": len(train_records),
        "val": len(val_records),
        "test": len(test_records),
    }
    history["total_seconds"] = round(time.time() - started, 1)
    TRAINING_HISTORY_PATH.write_text(json.dumps(history, indent=2), encoding="utf-8")

    print(f"\nbest epoch {history['best_epoch']}: "
          f"val accuracy {history.get('best_val_accuracy', 0):.4f}, "
          f"macro-F1 {history['best_val_macro_f1']:.4f}, "
          f"train/val gap {history.get('best_generalisation_gap', 0):+.4f}")
    print(f"saved model  -> {MODEL_PATH}")
    print(f"saved history-> {TRAINING_HISTORY_PATH}")
    print("\nRun `python -m microservices.evaluate` for the held-out test report.")


if __name__ == "__main__":
    main()
