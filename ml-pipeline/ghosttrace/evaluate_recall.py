"""Recall evaluation helpers for GhostTrace incident ranking."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List


ROOT_DIR = Path(__file__).resolve().parents[1]
GRAPHS_DIR = (ROOT_DIR / "data" / "graphs").resolve()


def compute_recall_score(
    predicted_risks: List[Dict],
    actual_incidents: List[Dict],
    threshold: float = 0.3,
) -> Dict:
    """Compute precision, recall, and F1 for incident recovery."""

    predicted_positive_edges = {
        str(item.get("edgeId", ""))
        for item in predicted_risks
        if str(item.get("edgeId", "")) and float(item.get("riskScore", 0.0)) > threshold
    }
    actual_positive_edges = {
        str(item.get("affectedEdgeId", ""))
        for item in actual_incidents
        if str(item.get("affectedEdgeId", ""))
    }

    true_positives = len(predicted_positive_edges & actual_positive_edges)
    false_positives = len(predicted_positive_edges - actual_positive_edges)
    false_negatives = len(actual_positive_edges - predicted_positive_edges)

    precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) else 0.0
    recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) else 0.0
    f1_score = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    return {
        "precision": precision,
        "recall": recall,
        "f1Score": f1_score,
        "truePositives": true_positives,
        "falsePositives": false_positives,
        "falseNegatives": false_negatives,
        "threshold": threshold,
    }


def generate_recall_report(scores: Dict, graph_name: str) -> str:
    """Render a compact markdown report suitable for a paper appendix."""

    return (
        f"## GhostTrace Recall Report: {graph_name}\n\n"
        "| Graph | Threshold | Precision | Recall | F1 | TP | FP | FN |\n"
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n"
        f"| {graph_name} | {scores['threshold']:.2f} | {scores['precision']:.3f} | "
        f"{scores['recall']:.3f} | {scores['f1Score']:.3f} | {scores['truePositives']} | "
        f"{scores['falsePositives']} | {scores['falseNegatives']} |\n"
    )


def main() -> None:
    """Run a tiny local demo report for the first available graph."""

    graph_files = sorted(path for path in GRAPHS_DIR.rglob("*.json") if path.is_file())
    graph_name = graph_files[0].stem if graph_files else "sample-graph"

    sample_predicted_risks = [
        {"edgeId": "edge-a", "riskScore": 0.82},
        {"edgeId": "edge-b", "riskScore": 0.44},
        {"edgeId": "edge-c", "riskScore": 0.12},
    ]
    sample_actual_incidents = [
        {"affectedNodeId": "node-1", "affectedEdgeId": "edge-a", "severity": "high"},
        {"affectedNodeId": "node-4", "affectedEdgeId": "edge-d", "severity": "medium"},
    ]

    scores = compute_recall_score(sample_predicted_risks, sample_actual_incidents)
    print(json.dumps(scores, indent=2))
    print()
    print(generate_recall_report(scores, graph_name))


if __name__ == "__main__":
    main()
