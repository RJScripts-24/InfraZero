"""Held-out test evaluation for the architecture-grading GNN.

Reads the test split exactly once -- the indices were frozen at training time
and never touched by early stopping or hyper-parameter choice, so the numbers
here are an honest estimate of performance on unseen topologies.

Reports the metrics a reviewer would expect for a 3-class ordinal problem:

  * accuracy, balanced accuracy, macro / weighted precision-recall-F1
  * per-class breakdown with support
  * confusion matrix
  * macro one-vs-rest ROC-AUC and average precision
  * Cohen's kappa, and quadratic-weighted kappa -- the right agreement statistic
    when classes are ordered (low < medium < high), because it penalises a
    low->high mistake far more than a low->medium one
  * Matthews correlation coefficient
  * expected calibration error, so a reported confidence means something
  * adjacent accuracy: how often the grade is right or off by one

and grounds them against three baselines: random, majority class, and gradient
boosting on the hand-crafted graph summary alone. That last one is the honest
test of whether message passing earns its keep over plain feature engineering.
"""

from __future__ import annotations

import argparse
import json
from typing import Dict, List

import numpy as np
import torch
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    matthews_corrcoef,
    precision_recall_curve,
    precision_recall_fscore_support,
    roc_auc_score,
    roc_curve,
)
from torch_geometric.loader import DataLoader

from .config import (
    CLASSES,
    EVALUATION_DIR,
    METRICS_REPORT_PATH,
    MODEL_PATH,
    TRAINING_HISTORY_PATH,
)
from .dataset import label_array, load_dataset
from .model import ArchitectureGrader


@torch.no_grad()
def collect_predictions(model, records, device, batch_size: int = 256):
    """Return (probabilities, predictions, targets) for a set of records."""

    loader = DataLoader(records, batch_size=batch_size, shuffle=False)
    model.eval()
    all_probabilities: List[np.ndarray] = []
    all_targets: List[int] = []

    for batch in loader:
        batch = batch.to(device)
        logits = model(batch)
        all_probabilities.append(torch.softmax(logits, dim=1).cpu().numpy())
        all_targets.extend(batch.y.cpu().tolist())

    probabilities = np.concatenate(all_probabilities, axis=0)
    return probabilities, probabilities.argmax(axis=1), np.array(all_targets)


def expected_calibration_error(probabilities: np.ndarray, targets: np.ndarray, bins: int = 15) -> float:
    """Gap between stated confidence and observed accuracy, averaged over bins."""

    confidences = probabilities.max(axis=1)
    predictions = probabilities.argmax(axis=1)
    correct = (predictions == targets).astype(np.float64)

    edges = np.linspace(0.0, 1.0, bins + 1)
    error = 0.0
    for lower, upper in zip(edges[:-1], edges[1:]):
        mask = (confidences > lower) & (confidences <= upper)
        if not mask.any():
            continue
        error += mask.mean() * abs(correct[mask].mean() - confidences[mask].mean())
    return float(error)


def graph_feature_matrix(records) -> np.ndarray:
    """Hand-crafted graph summary vectors, for the non-GNN baseline."""

    return np.stack([item.graph_features.view(-1).numpy() for item in records], axis=0)


def baseline_scores(train_records, test_records) -> Dict:
    """Random, majority-class and gradient-boosted-features baselines."""

    train_labels = label_array(train_records)
    test_labels = label_array(test_records)

    majority_class = int(np.bincount(train_labels, minlength=len(CLASSES)).argmax())
    majority_accuracy = float((test_labels == majority_class).mean())

    gradient_boosting = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.1, random_state=42
    )
    gradient_boosting.fit(graph_feature_matrix(train_records), train_labels)
    boosted_predictions = gradient_boosting.predict(graph_feature_matrix(test_records))

    return {
        "random": round(1.0 / len(CLASSES), 5),
        "majority_class": round(majority_accuracy, 5),
        "gradient_boosting_on_graph_summary": {
            "accuracy": round(float(accuracy_score(test_labels, boosted_predictions)), 5),
            "macro_f1": round(
                float(f1_score(test_labels, boosted_predictions, average="macro", zero_division=0)), 5
            ),
            "note": (
                "Hand-crafted whole-graph summary only, no message passing. "
                "The GNN has to beat this for the graph layers to be justified."
            ),
        },
    }


def make_plots(probabilities, predictions, targets, history: Dict) -> None:
    """Write the figure set used in the report."""

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)
    one_hot = np.eye(len(CLASSES))[targets]

    # --- confusion matrix ------------------------------------------------- #
    matrix = confusion_matrix(targets, predictions, labels=range(len(CLASSES)))
    normalised = matrix.astype(float) / np.maximum(matrix.sum(axis=1, keepdims=True), 1)
    figure, axis = plt.subplots(figsize=(6, 5))
    image = axis.imshow(normalised, cmap="Blues", vmin=0, vmax=1)
    axis.set_xticks(range(len(CLASSES)), CLASSES)
    axis.set_yticks(range(len(CLASSES)), CLASSES)
    axis.set_xlabel("predicted grade")
    axis.set_ylabel("true grade")
    axis.set_title("Confusion matrix (row-normalised)")
    for i in range(len(CLASSES)):
        for j in range(len(CLASSES)):
            axis.text(
                j, i, f"{matrix[i, j]}\n{normalised[i, j]:.1%}",
                ha="center", va="center",
                color="white" if normalised[i, j] > 0.5 else "black",
                fontsize=9,
            )
    figure.colorbar(image, ax=axis)
    figure.tight_layout()
    figure.savefig(EVALUATION_DIR / "confusion_matrix.png", dpi=140)
    plt.close(figure)

    # --- ROC + PR --------------------------------------------------------- #
    for kind in ("roc", "pr"):
        figure, axis = plt.subplots(figsize=(6, 5))
        for index, name in enumerate(CLASSES):
            if kind == "roc":
                fpr, tpr, _ = roc_curve(one_hot[:, index], probabilities[:, index])
                score = roc_auc_score(one_hot[:, index], probabilities[:, index])
                axis.plot(fpr, tpr, label=f"{name} (AUC {score:.3f})")
            else:
                precision, recall, _ = precision_recall_curve(one_hot[:, index], probabilities[:, index])
                score = average_precision_score(one_hot[:, index], probabilities[:, index])
                axis.plot(recall, precision, label=f"{name} (AP {score:.3f})")
        if kind == "roc":
            axis.plot([0, 1], [0, 1], "k--", linewidth=0.8, label="chance")
            axis.set_xlabel("false positive rate")
            axis.set_ylabel("true positive rate")
            axis.set_title("ROC, one-vs-rest")
        else:
            axis.set_xlabel("recall")
            axis.set_ylabel("precision")
            axis.set_title("Precision-recall, one-vs-rest")
        axis.legend(loc="lower right" if kind == "roc" else "lower left", fontsize=9)
        axis.grid(alpha=0.3)
        figure.tight_layout()
        figure.savefig(EVALUATION_DIR / f"{kind}_curves.png", dpi=140)
        plt.close(figure)

    # --- per-class bars ---------------------------------------------------- #
    precision, recall, f1, support = precision_recall_fscore_support(
        targets, predictions, labels=range(len(CLASSES)), zero_division=0
    )
    figure, axis = plt.subplots(figsize=(7, 4.5))
    positions = np.arange(len(CLASSES))
    width = 0.26
    axis.bar(positions - width, precision, width, label="precision")
    axis.bar(positions, recall, width, label="recall")
    axis.bar(positions + width, f1, width, label="F1")
    axis.set_xticks(positions, [f"{name}\n(n={count})" for name, count in zip(CLASSES, support)])
    axis.set_ylim(0, 1)
    axis.set_title("Per-class performance on the held-out test set")
    axis.legend()
    axis.grid(axis="y", alpha=0.3)
    figure.tight_layout()
    figure.savefig(EVALUATION_DIR / "per_class_metrics.png", dpi=140)
    plt.close(figure)

    # --- training curves --------------------------------------------------- #
    if history.get("epoch"):
        figure, (left, right) = plt.subplots(1, 2, figsize=(12, 4.5))
        left.plot(history["epoch"], history["train_loss"], label="train loss")
        left.set_xlabel("epoch")
        left.set_ylabel("loss")
        left.set_title("Training loss")
        left.grid(alpha=0.3)
        left.legend()

        right.plot(history["epoch"], history["train_accuracy"], label="train accuracy")
        right.plot(history["epoch"], history["val_accuracy"], label="validation accuracy")
        if history.get("best_epoch"):
            right.axvline(history["best_epoch"], color="grey", linestyle="--",
                          linewidth=0.9, label=f"best epoch ({history['best_epoch']})")
        right.set_xlabel("epoch")
        right.set_ylabel("accuracy")
        right.set_title("Accuracy: the gap between the curves is the overfit")
        right.grid(alpha=0.3)
        right.legend()
        figure.tight_layout()
        figure.savefig(EVALUATION_DIR / "training_history.png", dpi=140)
        plt.close(figure)

    # --- calibration ------------------------------------------------------- #
    confidences = probabilities.max(axis=1)
    correct = (predictions == targets).astype(float)
    edges = np.linspace(0, 1, 16)
    centres, accuracies = [], []
    for lower, upper in zip(edges[:-1], edges[1:]):
        mask = (confidences > lower) & (confidences <= upper)
        if mask.sum() >= 5:
            centres.append(confidences[mask].mean())
            accuracies.append(correct[mask].mean())
    figure, axis = plt.subplots(figsize=(5.5, 5))
    axis.plot([0, 1], [0, 1], "k--", linewidth=0.9, label="perfect calibration")
    axis.plot(centres, accuracies, "o-", label="model")
    axis.set_xlabel("stated confidence")
    axis.set_ylabel("observed accuracy")
    axis.set_title("Reliability diagram")
    axis.grid(alpha=0.3)
    axis.legend()
    figure.tight_layout()
    figure.savefig(EVALUATION_DIR / "calibration.png", dpi=140)
    plt.close(figure)


def build_report(probabilities, predictions, targets, extras: Dict) -> Dict:
    """Assemble the full metrics dictionary."""

    one_hot = np.eye(len(CLASSES))[targets]
    accuracy = float(accuracy_score(targets, predictions))
    macro_precision, macro_recall, macro_f1, _ = precision_recall_fscore_support(
        targets, predictions, average="macro", zero_division=0
    )
    per_class = classification_report(
        targets, predictions, labels=range(len(CLASSES)),
        target_names=CLASSES, output_dict=True, zero_division=0,
    )

    # Ordinal-aware: how often the predicted grade is right or one step away.
    adjacent = float((np.abs(predictions - targets) <= 1).mean())

    report = {
        "model": "GhostTrace architecture grader -- 3-layer GINEConv GNN (edge-aware)",
        "task": "3-class microservice architecture risk grading (low / medium / high)",
        "data_source": "Alibaba cluster-trace-microservices v2021 + v2022",
        "test_set_size": int(len(targets)),
        "overall": {
            "accuracy": round(accuracy, 5),
            "balanced_accuracy": round(float(balanced_accuracy_score(targets, predictions)), 5),
            "macro_precision": round(float(macro_precision), 5),
            "macro_recall": round(float(macro_recall), 5),
            "macro_f1": round(float(macro_f1), 5),
            "weighted_f1": round(
                float(f1_score(targets, predictions, average="weighted", zero_division=0)), 5
            ),
            "macro_roc_auc_ovr": round(
                float(roc_auc_score(one_hot, probabilities, average="macro", multi_class="ovr")), 5
            ),
            "macro_average_precision": round(
                float(average_precision_score(one_hot, probabilities, average="macro")), 5
            ),
            "cohen_kappa": round(float(cohen_kappa_score(targets, predictions)), 5),
            "quadratic_weighted_kappa": round(
                float(cohen_kappa_score(targets, predictions, weights="quadratic")), 5
            ),
            "matthews_corrcoef": round(float(matthews_corrcoef(targets, predictions)), 5),
            "adjacent_accuracy": round(adjacent, 5),
            "expected_calibration_error": round(
                expected_calibration_error(probabilities, targets), 5
            ),
        },
        "per_class": {
            name: {
                "precision": round(per_class[name]["precision"], 5),
                "recall": round(per_class[name]["recall"], 5),
                "f1": round(per_class[name]["f1-score"], 5),
                "support": int(per_class[name]["support"]),
                "roc_auc": round(
                    float(roc_auc_score(one_hot[:, index], probabilities[:, index])), 5
                ),
                "average_precision": round(
                    float(average_precision_score(one_hot[:, index], probabilities[:, index])), 5
                ),
            }
            for index, name in enumerate(CLASSES)
        },
        "confusion_matrix": confusion_matrix(
            targets, predictions, labels=range(len(CLASSES))
        ).tolist(),
        "confusion_matrix_labels": CLASSES,
    }
    report.update(extras)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the architecture grader on held-out data.")
    parser.add_argument("--max-records", type=int, default=0)
    parser.add_argument("--no-plots", action="store_true")
    arguments = parser.parse_args()

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"{MODEL_PATH} not found. Train the model first.")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint = torch.load(MODEL_PATH, map_location=device, weights_only=False)

    print("loading dataset...")
    records = load_dataset(max_records=arguments.max_records)
    labels = label_array(records)

    # Rebuild the split from the recipe the checkpoint recorded, rather than
    # from stored indices: the pool may be assembled from two corpora, so an
    # index into it is only meaningful alongside how it was assembled.
    from .train import build_splits

    include_simulated = bool(checkpoint.get("include_simulated", False))
    train_records, val_records, test_records = build_splits(
        records, include_simulated=include_simulated, verbose=False
    )
    print(
        f"  {len(train_records):,} train / {len(val_records):,} val / "
        f"{len(test_records):,} test"
        + ("  (measured + simulated)" if include_simulated else "")
    )

    architecture = checkpoint.get("architecture", {})
    model = ArchitectureGrader(
        num_classes=len(CLASSES),
        hidden_dim=architecture.get("hidden_dim", 96),
        num_layers=architecture.get("num_layers", 3),
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])

    print("scoring the held-out test split...")
    probabilities, predictions, targets = collect_predictions(model, test_records, device)

    # Train and validation accuracy alongside test, to state plainly whether the
    # model over- or under-fits rather than leaving it to be inferred.
    train_probabilities, train_predictions, train_targets = collect_predictions(
        model, train_records, device
    )
    val_probabilities, val_predictions, val_targets = collect_predictions(model, val_records, device)
    train_accuracy = float(accuracy_score(train_targets, train_predictions))
    val_accuracy = float(accuracy_score(val_targets, val_predictions))
    test_accuracy = float(accuracy_score(targets, predictions))

    print("fitting baselines...")
    baselines = baseline_scores(train_records, test_records)

    history = {}
    if TRAINING_HISTORY_PATH.exists():
        history = json.loads(TRAINING_HISTORY_PATH.read_text(encoding="utf-8"))

    gap = train_accuracy - test_accuracy
    if gap > 0.10:
        verdict = "overfitting: train accuracy exceeds test by more than 10 points"
    elif test_accuracy < 0.60:
        verdict = "underfitting: test accuracy is low in absolute terms"
    else:
        verdict = "well fitted: train and test accuracy agree within 10 points"

    extras = {
        "fit_diagnostics": {
            "train_accuracy": round(train_accuracy, 5),
            "validation_accuracy": round(val_accuracy, 5),
            "test_accuracy": round(test_accuracy, 5),
            "train_minus_test": round(gap, 5),
            "verdict": verdict,
        },
        "baselines": baselines,
        "cross_validation": checkpoint.get("cross_validation"),
        "hyperparameters": checkpoint.get("hyperparameters"),
        "label_definition": (
            "Tercile of measured p99 end-to-end response time, pooled across every "
            "production trace realising the same topology. Response time is never a "
            "model input -- the network sees only structure and node roles."
        ),
        "protocol": (
            "Stratified 70/15/15 split over distinct topologies. Validation drove early "
            "stopping; the test split was read once, here. No topology appears in more "
            "than one split."
        ),
    }

    report = build_report(probabilities, predictions, targets, extras)

    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)
    METRICS_REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if not arguments.no_plots:
        print("writing figures...")
        make_plots(probabilities, predictions, targets, history)

    overall = report["overall"]
    print("\n" + "=" * 66)
    print("HELD-OUT TEST RESULTS")
    print("=" * 66)
    print(f"  test set size          {report['test_set_size']:,} unseen architectures")
    print(f"  accuracy               {overall['accuracy']:.4f}")
    print(f"  balanced accuracy      {overall['balanced_accuracy']:.4f}")
    print(f"  macro F1               {overall['macro_f1']:.4f}")
    print(f"  macro ROC-AUC (OvR)    {overall['macro_roc_auc_ovr']:.4f}")
    print(f"  quadratic kappa        {overall['quadratic_weighted_kappa']:.4f}")
    print(f"  MCC                    {overall['matthews_corrcoef']:.4f}")
    print(f"  adjacent accuracy      {overall['adjacent_accuracy']:.4f}")
    print(f"  calibration error      {overall['expected_calibration_error']:.4f}")
    # Accuracy per label source. Blending a measured label with a simulated one
    # into a single headline number would let the simulator's own consistency
    # inflate a figure that reads as production accuracy, so the two are never
    # reported together without also being reported apart.
    sources = [getattr(item, "label_source", "measured") for item in test_records]
    if len(set(sources)) > 1:
        print("-" * 66)
        for source in sorted(set(sources)):
            mask = np.array([s == source for s in sources])
            if not mask.any():
                continue
            accuracy = float((predictions[mask] == targets[mask]).mean())
            label = "measured (Alibaba)" if source == "measured" else "simulated (deployments)"
            print(f"  {label:<22} {accuracy:.4f}   n={int(mask.sum()):,}")

    print("-" * 66)
    print(f"  train / val / test     {train_accuracy:.4f} / {val_accuracy:.4f} / {test_accuracy:.4f}")
    print(f"  verdict                {verdict}")
    print("-" * 66)
    print(f"  random baseline        {baselines['random']:.4f}")
    print(f"  majority baseline      {baselines['majority_class']:.4f}")
    print(f"  boosted-features       {baselines['gradient_boosting_on_graph_summary']['accuracy']:.4f}")
    print("=" * 66)
    print(f"\nreport -> {METRICS_REPORT_PATH}")


if __name__ == "__main__":
    main()
