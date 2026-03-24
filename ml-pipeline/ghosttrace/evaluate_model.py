from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path
from typing import Tuple

import matplotlib.gridspec as gridspec
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
import torch
from dotenv import load_dotenv
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    confusion_matrix,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)
from torch import nn
from torch.utils.data import Subset
from torch_geometric.loader import DataLoader

from graph_encoder import GhostTraceGNN, GraphDataset, LABEL_TO_INDEX, source_aware_split


ROOT_DIR = Path(__file__).resolve().parents[1]
BEST_MODEL_PATH = Path(__file__).resolve().parent / "ghosttrace_gnn_best.pt"
MODEL_OUTPUT_PATH = Path(__file__).resolve().parent / "ghosttrace_gnn.pt"
TRAINING_HISTORY_PATH = Path(__file__).resolve().parent / "training_history.json"

MODEL_LABELS_SORTED = [label for label, _ in sorted(LABEL_TO_INDEX.items(), key=lambda item: item[1])]
CLASSES = MODEL_LABELS_SORTED
DISPLAY_CLASSES = [class_name.replace("_", " ").title() for class_name in CLASSES]
_BASE_COLORS = ["blue", "orange", "green", "red", "purple", "brown", "pink", "gray"]
CLASS_COLORS = {class_name: _BASE_COLORS[idx % len(_BASE_COLORS)] for idx, class_name in enumerate(CLASSES)}

MODEL_TO_EVAL_INDEX = {
    LABEL_TO_INDEX[class_name]: idx for idx, class_name in enumerate(CLASSES)
}
EVAL_TO_MODEL_INDEX = {
    idx: LABEL_TO_INDEX[class_name] for idx, class_name in enumerate(CLASSES)
}

FULL_DATASET_LABELS: np.ndarray | None = None
VAL_DATASET_LABELS: np.ndarray | None = None


class EvalGraphClassifier(nn.Module):
    def __init__(self, encoder: GhostTraceGNN, num_classes: int = len(CLASSES)) -> None:
        super().__init__()
        self.encoder = encoder
        self.head = nn.Sequential(
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ELU(),
            nn.Dropout(p=0.3),
            nn.Linear(64, 32),
            nn.BatchNorm1d(32),
            nn.ELU(),
            nn.Dropout(p=0.2),
            nn.Linear(32, num_classes),
        )

    def forward(self, data):
        embedding = self.encoder(data)
        return self.head(embedding)


def _safe_roc_auc(y_true_bin: np.ndarray, y_score: np.ndarray) -> float:
    if len(np.unique(y_true_bin)) < 2:
        return float("nan")
    return float(roc_auc_score(y_true_bin, y_score))


def _safe_avg_precision(y_true_bin: np.ndarray, y_score: np.ndarray) -> float:
    if len(np.unique(y_true_bin)) < 2:
        return float("nan")
    return float(average_precision_score(y_true_bin, y_score))


def _resolve_model_path() -> Path:
    override = os.getenv("GHOSTTRACE_EVAL_MODEL", "").strip()
    if override:
        override_path = Path(override)
        if not override_path.is_absolute():
            override_path = (Path(__file__).resolve().parent / override_path).resolve()
        if not override_path.exists():
            raise FileNotFoundError(f"Model checkpoint not found: {override_path}")
        return override_path

    if not MODEL_OUTPUT_PATH.exists():
        raise FileNotFoundError(f"Model checkpoint not found: {MODEL_OUTPUT_PATH}")
    return MODEL_OUTPUT_PATH


def _load_eval_model(model: EvalGraphClassifier, checkpoint: object) -> float | None:
    if isinstance(checkpoint, dict):
        if "state_dict" in checkpoint:
            model.load_state_dict(checkpoint["state_dict"])
            return None
        if "encoder_state_dict" in checkpoint and "classifier_state_dict" in checkpoint:
            model.encoder.load_state_dict(checkpoint["encoder_state_dict"])
            model.head.load_state_dict(checkpoint["classifier_state_dict"])
            threshold = checkpoint.get("decision_threshold")
            if threshold is None:
                return None
            return float(threshold)

    model.load_state_dict(checkpoint)
    return None


def load_model_and_data() -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    global FULL_DATASET_LABELS, VAL_DATASET_LABELS

    load_dotenv(dotenv_path=ROOT_DIR / ".env")
    graphs_dir = os.getenv("GRAPHS_OUTPUT_DIR", "../data/graphs")
    graphs_path = Path(graphs_dir)
    if not graphs_path.is_absolute():
        graphs_path = (ROOT_DIR / graphs_path).resolve()

    dataset = GraphDataset(root_dir=graphs_path)
    if len(dataset) == 0:
        raise FileNotFoundError(f"No graph files found in {graphs_path}")

    full_labels_model_idx = np.array([int(dataset[i].y.item()) for i in range(len(dataset))], dtype=np.int64)
    FULL_DATASET_LABELS = np.array([MODEL_TO_EVAL_INDEX[idx] for idx in full_labels_model_idx], dtype=np.int64)

    train_indices, val_indices = source_aware_split(dataset)
    if len(val_indices) < 5:
        torch.manual_seed(42)
        total = len(dataset)
        train_size = int(0.8 * total)
        val_size = total - train_size
        _, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])
    else:
        val_dataset = Subset(dataset, val_indices)

    val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = EvalGraphClassifier(GhostTraceGNN(), num_classes=len(CLASSES)).to(device)

    model_path = _resolve_model_path()
    checkpoint = torch.load(model_path, map_location=device)
    decision_threshold = _load_eval_model(model, checkpoint)
    print(f"Loaded model checkpoint: {model_path}")
    if decision_threshold is not None:
        print(f"Using decision threshold: {decision_threshold:.2f}")

    model.eval()
    y_true_model_idx = []
    y_pred_model_idx = []
    y_proba_model_order = []

    with torch.no_grad():
        for batch in val_loader:
            batch = batch.to(device)
            logits = model(batch)
            probabilities = torch.softmax(logits, dim=1)
            if len(CLASSES) == 2 and decision_threshold is not None:
                predictions = (probabilities[:, 1] >= decision_threshold).long()
            else:
                predictions = torch.argmax(probabilities, dim=1)

            y_true_model_idx.extend(batch.y.cpu().numpy().tolist())
            y_pred_model_idx.extend(predictions.cpu().numpy().tolist())
            y_proba_model_order.extend(probabilities.cpu().numpy().tolist())

    y_true_model_idx_np = np.array(y_true_model_idx, dtype=np.int64)
    y_pred_model_idx_np = np.array(y_pred_model_idx, dtype=np.int64)
    y_proba_model_order_np = np.array(y_proba_model_order, dtype=np.float64)

    # Reorder labels/probabilities into requested class order.
    y_true = np.array([MODEL_TO_EVAL_INDEX[idx] for idx in y_true_model_idx_np], dtype=np.int64)
    y_pred = np.array([MODEL_TO_EVAL_INDEX[idx] for idx in y_pred_model_idx_np], dtype=np.int64)
    y_proba = np.column_stack(
        [y_proba_model_order_np[:, EVAL_TO_MODEL_INDEX[class_idx]] for class_idx in range(len(CLASSES))]
    )

    VAL_DATASET_LABELS = y_true.copy()

    return y_true, y_pred, y_proba


def plot_confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, save_path: str) -> None:
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(CLASSES))))
    row_sums = cm.sum(axis=1, keepdims=True)
    cm_pct = np.divide(cm, np.maximum(row_sums, 1), where=row_sums != 0)

    annot = np.empty_like(cm, dtype=object)
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            annot[i, j] = f"{cm[i, j]}\n({cm_pct[i, j] * 100:.1f}%)"

    plt.figure(figsize=(10, 8))
    sns.heatmap(
        cm_pct,
        annot=annot,
        fmt="",
        cmap="Blues",
        xticklabels=DISPLAY_CLASSES,
        yticklabels=DISPLAY_CLASSES,
        vmin=0,
        vmax=1,
    )
    plt.title("GhostTrace GNN — Confusion Matrix (Validation Set)")
    plt.xlabel("Predicted Label")
    plt.ylabel("True Label")
    plt.tight_layout()
    plt.savefig(save_path, dpi=200)
    plt.close()


def plot_roc_curves(y_true: np.ndarray, y_proba: np.ndarray, save_path: str) -> None:
    y_true_one_hot = np.eye(len(CLASSES))[y_true]

    plt.figure(figsize=(10, 8))

    macro_fpr = np.linspace(0, 1, 200)
    tprs = []

    for idx, class_name in enumerate(CLASSES):
        y_true_bin = y_true_one_hot[:, idx]
        y_score = y_proba[:, idx]
        if len(np.unique(y_true_bin)) < 2:
            continue
        fpr, tpr, _ = roc_curve(y_true_bin, y_score)
        auc = roc_auc_score(y_true_bin, y_score)
        tprs.append(np.interp(macro_fpr, fpr, tpr))
        plt.plot(
            fpr,
            tpr,
            color=CLASS_COLORS[class_name],
            linewidth=2,
            label=f"{class_name} (AUC={auc:.3f})",
        )

    if tprs:
        macro_tpr = np.mean(np.vstack(tprs), axis=0)
        macro_auc = np.trapezoid(macro_tpr, macro_fpr)
        plt.plot(
            macro_fpr,
            macro_tpr,
            color="black",
            linestyle="--",
            linewidth=2,
            label=f"macro-average (AUC={macro_auc:.3f})",
        )

    plt.plot([0, 1], [0, 1], color="gray", linestyle="--", linewidth=1.5, label="random baseline")
    plt.title("GhostTrace GNN — ROC Curves (One-vs-Rest)")
    plt.xlabel("False Positive Rate")
    plt.ylabel("True Positive Rate")
    plt.legend(loc="lower right")
    plt.tight_layout()
    plt.savefig(save_path, dpi=200)
    plt.close()


def plot_precision_recall_curves(y_true: np.ndarray, y_proba: np.ndarray, save_path: str) -> None:
    y_true_one_hot = np.eye(len(CLASSES))[y_true]

    plt.figure(figsize=(10, 8))

    for idx, class_name in enumerate(CLASSES):
        y_true_bin = y_true_one_hot[:, idx]
        y_score = y_proba[:, idx]
        if len(np.unique(y_true_bin)) < 2:
            continue

        precision, recall, _ = precision_recall_curve(y_true_bin, y_score)
        ap = average_precision_score(y_true_bin, y_score)
        baseline = float(np.mean(y_true_bin))

        plt.plot(
            recall,
            precision,
            color=CLASS_COLORS[class_name],
            linewidth=2,
            label=f"{class_name} (AP={ap:.3f})",
        )
        plt.hlines(
            baseline,
            xmin=0,
            xmax=1,
            colors=CLASS_COLORS[class_name],
            linestyles=":",
            linewidth=1,
            alpha=0.6,
        )

    plt.title("GhostTrace GNN — Precision-Recall Curves")
    plt.xlabel("Recall")
    plt.ylabel("Precision")
    plt.legend(loc="lower left")
    plt.tight_layout()
    plt.savefig(save_path, dpi=200)
    plt.close()


def plot_training_history(save_path: str) -> None:
    if not TRAINING_HISTORY_PATH.exists():
        return

    history = json.loads(TRAINING_HISTORY_PATH.read_text(encoding="utf-8"))
    epochs = history.get("epochs", [])
    train_loss = history.get("train_loss", [])
    val_accuracy = history.get("val_accuracy")
    if not val_accuracy:
        val_accuracy = history.get("val_balanced_accuracy", [])

    # Keep arrays aligned even when history schema changes across training versions.
    if not epochs:
        inferred_len = max(len(train_loss), len(val_accuracy))
        epochs = list(range(1, inferred_len + 1))

    if len(train_loss) != len(epochs):
        min_len = min(len(train_loss), len(epochs))
        train_loss = train_loss[:min_len]
    if len(val_accuracy) != len(epochs):
        min_len = min(len(val_accuracy), len(epochs))
        val_accuracy = val_accuracy[:min_len]

    if not epochs:
        return

    best_epoch = int(history.get("best_epoch", 0))
    best_val_accuracy = float(history.get("best_val_accuracy", 0.0))

    fig = plt.figure(figsize=(14, 5))
    gs = gridspec.GridSpec(1, 2, figure=fig)

    ax1 = fig.add_subplot(gs[0, 0])
    if train_loss:
        ax1.plot(epochs[: len(train_loss)], train_loss, color="tab:blue", linewidth=2)
    ax1.set_title("Training Loss")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Loss")
    if best_epoch > 0:
        ax1.axvline(best_epoch, color="gray", linestyle="--", linewidth=1.5)

    ax2 = fig.add_subplot(gs[0, 1])
    if val_accuracy:
        ax2.plot(epochs[: len(val_accuracy)], val_accuracy, color="tab:green", linewidth=2)
    ax2.set_title("Validation Accuracy")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Accuracy")
    if best_epoch > 0 and val_accuracy:
        ax2.axvline(best_epoch, color="gray", linestyle="--", linewidth=1.5)
        ax2.annotate(
            f"best={best_val_accuracy:.4f}\nepoch={best_epoch}",
            xy=(best_epoch, best_val_accuracy),
            xytext=(best_epoch + 2, min(1.0, best_val_accuracy + 0.05)),
            arrowprops={"arrowstyle": "->", "color": "black"},
            fontsize=9,
        )

    fig.suptitle("GhostTrace GNN — Training History")
    fig.tight_layout(rect=[0, 0, 1, 0.95])
    fig.savefig(save_path, dpi=200)
    plt.close(fig)


def plot_class_distribution(save_path: str) -> None:
    if FULL_DATASET_LABELS is None or VAL_DATASET_LABELS is None:
        return

    full_counts = Counter(int(x) for x in FULL_DATASET_LABELS.tolist())
    val_counts = Counter(int(x) for x in VAL_DATASET_LABELS.tolist())

    x = np.arange(len(CLASSES))
    colors = [CLASS_COLORS[c] for c in CLASSES]

    fig = plt.figure(figsize=(12, 5))
    gs = gridspec.GridSpec(1, 2, figure=fig)
    ax1 = fig.add_subplot(gs[0, 0])
    ax2 = fig.add_subplot(gs[0, 1])

    full_vals = [full_counts.get(i, 0) for i in range(len(CLASSES))]
    val_vals = [val_counts.get(i, 0) for i in range(len(CLASSES))]

    bars1 = ax1.bar(x, full_vals, color=colors)
    bars2 = ax2.bar(x, val_vals, color=colors)

    ax1.set_title("Full Dataset")
    ax2.set_title("Validation Set")

    for ax in (ax1, ax2):
        ax.set_xticks(x)
        ax.set_xticklabels(DISPLAY_CLASSES)
        ax.set_ylabel("Count")

    for bars, values, ax in ((bars1, full_vals, ax1), (bars2, val_vals, ax2)):
        for bar, val in zip(bars, values):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + max(1, int(max(values) * 0.01)),
                str(val),
                ha="center",
                va="bottom",
                fontsize=9,
            )

    fig.suptitle("GhostTrace GNN — Dataset Class Distribution")
    fig.tight_layout(rect=[0, 0, 1, 0.95])
    fig.savefig(save_path, dpi=200)
    plt.close(fig)


def plot_per_class_metrics(y_true: np.ndarray, y_pred: np.ndarray, save_path: str) -> None:
    report = classification_report(
        y_true,
        y_pred,
        labels=list(range(len(CLASSES))),
        target_names=CLASSES,
        output_dict=True,
        zero_division=0,
    )

    precision_vals = [report[class_name]["precision"] for class_name in CLASSES]
    recall_vals = [report[class_name]["recall"] for class_name in CLASSES]
    f1_vals = [report[class_name]["f1-score"] for class_name in CLASSES]

    x = np.arange(len(CLASSES))
    width = 0.24

    plt.figure(figsize=(12, 6))
    bars1 = plt.bar(x - width, precision_vals, width, label="Precision", color="blue")
    bars2 = plt.bar(x, recall_vals, width, label="Recall", color="orange")
    bars3 = plt.bar(x + width, f1_vals, width, label="F1", color="green")

    for bars in (bars1, bars2, bars3):
        for bar in bars:
            val = bar.get_height()
            plt.text(
                bar.get_x() + bar.get_width() / 2,
                val + 0.01,
                f"{val:.2f}",
                ha="center",
                va="bottom",
                fontsize=8,
            )

    plt.axhline(0.90, color="gray", linestyle="--", linewidth=1.5, label="Target threshold")
    plt.ylim(0, 1.05)
    plt.xticks(x, DISPLAY_CLASSES)
    plt.ylabel("Score")
    plt.title("GhostTrace GNN — Per-Class Precision / Recall / F1")
    plt.legend()
    plt.tight_layout()
    plt.savefig(save_path, dpi=200)
    plt.close()


def generate_metrics_report(y_true: np.ndarray, y_pred: np.ndarray, y_proba: np.ndarray) -> dict:
    report = classification_report(
        y_true,
        y_pred,
        labels=list(range(len(CLASSES))),
        target_names=CLASSES,
        output_dict=True,
        zero_division=0,
    )

    accuracy = float(np.mean(y_true == y_pred))
    macro_precision = float(report["macro avg"]["precision"])
    macro_recall = float(report["macro avg"]["recall"])
    macro_f1 = float(report["macro avg"]["f1-score"])
    weighted_f1 = float(report["weighted avg"]["f1-score"])

    per_class_ap_vals = []
    per_class_auc_vals = []
    per_class = {}
    for idx, class_name in enumerate(CLASSES):
        y_true_bin = (y_true == idx).astype(int)
        y_score = y_proba[:, idx]

        roc_auc = _safe_roc_auc(y_true_bin, y_score)
        avg_precision = _safe_avg_precision(y_true_bin, y_score)
        if not np.isnan(roc_auc):
            per_class_auc_vals.append(roc_auc)
        if not np.isnan(avg_precision):
            per_class_ap_vals.append(avg_precision)

        per_class[class_name] = {
            "precision": float(report[class_name]["precision"]),
            "recall": float(report[class_name]["recall"]),
            "f1": float(report[class_name]["f1-score"]),
            "support": int(report[class_name]["support"]),
            "roc_auc": roc_auc,
            "avg_precision": avg_precision,
        }

    macro_roc_auc = float(np.mean(per_class_auc_vals)) if per_class_auc_vals else float("nan")
    macro_avg_precision = float(np.mean(per_class_ap_vals)) if per_class_ap_vals else float("nan")

    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(CLASSES)))).astype(int).tolist()

    best_class = max(CLASSES, key=lambda c: per_class[c]["f1"])
    worst_class = min(CLASSES, key=lambda c: per_class[c]["f1"])
    best_f1 = per_class[best_class]["f1"]
    worst_f1 = per_class[worst_class]["f1"]

    return {
        "model": "GhostTrace GATv2 (2-layer, 2-head attention)",
        "dataset_size": int(len(y_true)),
        "num_classes": len(CLASSES),
        "classes": CLASSES,
        "overall": {
            "accuracy": accuracy,
            "macro_precision": macro_precision,
            "macro_recall": macro_recall,
            "macro_f1": macro_f1,
            "weighted_f1": weighted_f1,
            "macro_roc_auc": macro_roc_auc,
            "macro_avg_precision": macro_avg_precision,
        },
        "per_class": per_class,
        "confusion_matrix": cm,
        "research_summary": {
            "main_result": f"The GhostTrace GNN achieved {accuracy:.1%} accuracy on the held-out validation set.",
            "roc_statement": f"Macro-average AUC-ROC of {macro_roc_auc:.3f} indicates robust discriminative performance across failure modes.",
            "baseline_comparison": (
                f"Outperforms random baseline ({1.0 / len(CLASSES):.0%}) "
                f"by {accuracy - (1.0 / len(CLASSES)):.1%} absolute accuracy."
            ),
            "per_class_summary": (
                f"Best class: {best_class} ({best_f1:.1%} F1). "
                f"Most challenging: {worst_class} ({worst_f1:.1%} F1)."
            ),
        },
    }


def main() -> None:
    output_dir = os.path.join(os.path.dirname(__file__), "evaluation")
    os.makedirs(output_dir, exist_ok=True)

    y_true, y_pred, y_proba = load_model_and_data()

    print("\n" + "=" * 60)
    print("GHOSTTRACE GNN — EVALUATION REPORT")
    print("=" * 60)

    plot_confusion_matrix(y_true, y_pred, f"{output_dir}/confusion_matrix.png")
    plot_roc_curves(y_true, y_proba, f"{output_dir}/roc_curves.png")
    plot_precision_recall_curves(y_true, y_proba, f"{output_dir}/pr_curves.png")
    plot_training_history(f"{output_dir}/training_history.png")
    plot_class_distribution(f"{output_dir}/class_distribution.png")
    plot_per_class_metrics(y_true, y_pred, f"{output_dir}/per_class_metrics.png")

    report = generate_metrics_report(y_true, y_pred, y_proba)
    with open(f"{output_dir}/metrics_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\nOverall Accuracy:      {report['overall']['accuracy']:.4f}")
    print(f"Macro F1 Score:        {report['overall']['macro_f1']:.4f}")
    print(f"Macro ROC-AUC:         {report['overall']['macro_roc_auc']:.4f}")
    print(f"Macro Avg Precision:   {report['overall']['macro_avg_precision']:.4f}")
    print("\nPer-Class F1 Scores:")
    for cls, metrics in report["per_class"].items():
        bar = "█" * int(metrics["f1"] * 20)
        print(f"  {cls:22s} {bar:20s} {metrics['f1']:.4f}")

    print("\nResearch Summary:")
    for key, val in report["research_summary"].items():
        print(f"  {key}: {val}")

    print(f"\nAll plots saved to: {output_dir}/")
    print("Files: confusion_matrix.png, roc_curves.png, pr_curves.png,")
    print("       training_history.png, class_distribution.png, per_class_metrics.png")
    print("       metrics_report.json")


if __name__ == "__main__":
    main()
