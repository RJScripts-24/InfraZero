"""Grading sanity gate: the checks held-out accuracy cannot make.

A model can score well on a held-out split of Alibaba topologies and still be
useless for the product, because the split contains nothing that resembles what
users actually upload. The previous grader scored 76.4% on its test split while:

  * grading the published Uber and Netflix architectures F;
  * degrading a *quality-invariant* design from A to C purely as it grew;
  * grading a 30-node anti-pattern A at 81% confidence, above a 32-node
    excellent design at C -- the ordering inverted at exactly the scale the
    product targets.

Each of those is a falsifiable statement about the grader, and each is asserted
here. These are not accuracy measurements -- a handful of graphs cannot measure
accuracy. They are contradiction tests: a grader that fails one is wrong,
whatever its test-split number says.

Run:  python -m microservices.test_grading_sanity
"""

from __future__ import annotations

import sys
from typing import Dict, List, Tuple

import torch
from torch_geometric.data import Data

from .config import CLASSES, CLASS_TO_LETTER, MODEL_PATH
from .features import encode_canvas_graph
from .model import ArchitectureGrader
from .reference_architectures import (
    REFERENCE_ARCHITECTURES,
    scaled_excellent,
    scaled_terrible,
)


def load_model() -> ArchitectureGrader:
    if not MODEL_PATH.exists():
        raise SystemExit(f"No trained model at {MODEL_PATH}. Train first.")
    checkpoint = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
    architecture = checkpoint.get("architecture", {})
    model = ArchitectureGrader(
        num_classes=len(CLASSES),
        hidden_dim=architecture.get("hidden_dim", 96),
        num_layers=architecture.get("num_layers", 3),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def grade(model: ArchitectureGrader, nodes: List[Dict], edges: List[Dict]) -> Dict:
    node_features, edge_index, edge_features, graph_features = encode_canvas_graph(nodes, edges)
    data = Data(
        x=torch.from_numpy(node_features),
        edge_index=torch.from_numpy(edge_index),
        edge_attr=torch.from_numpy(edge_features),
    )
    data.graph_features = torch.from_numpy(graph_features).view(1, -1)
    data.batch = torch.zeros(data.x.size(0), dtype=torch.long)
    with torch.no_grad():
        probabilities = torch.softmax(model(data), dim=1)[0]
    index = int(probabilities.argmax())
    return {
        "class": CLASSES[index],
        "letter": CLASS_TO_LETTER[CLASSES[index]],
        "confidence": float(probabilities[index]),
        # Expected position on the ordered low<medium<high scale. Continuous, so
        # two architectures can be ranked even when they share a class.
        "risk": float(sum(i * float(probabilities[i]) for i in range(len(CLASSES)))),
        "nodes": len(nodes),
    }


def check_reference_architectures(model) -> Tuple[bool, List[str]]:
    """Published architectures serving enormous traffic must not grade F."""

    print("=" * 78)
    print("CHECK 1 -- published reference architectures must not grade F")
    print("=" * 78)
    failures = []
    for name, builder in sorted(REFERENCE_ARCHITECTURES.items()):
        nodes, edges = builder()
        result = grade(model, nodes, edges)
        verdict = "FAIL" if result["class"] == "high" else "pass"
        if verdict == "FAIL":
            failures.append(
                f"{name} graded {result['letter']} ({result['confidence']:.1%}) -- "
                f"this architecture demonstrably serves production traffic at scale"
            )
        print(
            f"  {name:<10} {result['nodes']:>3} nodes -> {result['class']:<7}"
            f"{result['letter']}  conf {result['confidence']:>5.1%}  risk {result['risk']:.2f}"
            f"   [{verdict}]"
        )
    return not failures, failures


def check_size_invariance(model) -> Tuple[bool, List[str]]:
    """Quality is held constant across this family, so the grade must be too."""

    print()
    print("=" * 78)
    print("CHECK 2 -- a quality-invariant design must not degrade as it grows")
    print("=" * 78)
    widths = [1, 2, 3, 4, 6, 8, 10, 12]
    results = []
    for width in widths:
        nodes, edges = scaled_excellent(width)
        results.append(grade(model, nodes, edges))
        print(
            f"  width {width:>2} ({results[-1]['nodes']:>3} nodes) -> "
            f"{results[-1]['class']:<7}{results[-1]['letter']}  risk {results[-1]['risk']:.2f}"
        )

    failures = []
    risks = [r["risk"] for r in results]
    drift = risks[-1] - risks[0]
    # Spearman without scipy: rank correlation over a monotone size sequence.
    ranks = list(range(len(risks)))
    order = sorted(ranks, key=lambda i: risks[i])
    risk_ranks = [0] * len(risks)
    for position, index in enumerate(order):
        risk_ranks[index] = position
    n = len(risks)
    d_squared = sum((ranks[i] - risk_ranks[i]) ** 2 for i in range(n))
    rho = 1 - (6 * d_squared) / (n * (n * n - 1))

    print(f"\n  risk drift from smallest to largest : {drift:+.2f}")
    print(f"  rank correlation of risk with size  : {rho:+.2f}")
    if drift > 0.5:
        failures.append(
            f"risk rose {drift:+.2f} across a family whose quality does not change -- "
            f"the grader is reading graph size"
        )
    if rho > 0.8:
        failures.append(f"risk tracks size almost perfectly (rho={rho:+.2f})")
    return not failures, failures


def check_ordering_at_matched_size(model) -> Tuple[bool, List[str]]:
    """At the same node count, the good design must outrank the bad one."""

    print()
    print("=" * 78)
    print("CHECK 3 -- at matched size, excellent must outrank terrible")
    print("=" * 78)
    failures = []
    # scaled_excellent adds 5 nodes per width plus 2 fixed; scaled_terrible adds
    # 1 per width plus 2. These pairs land within a node or two of each other.
    for good_width, bad_width in ((2, 9), (4, 19), (6, 29), (8, 39)):
        good_nodes, good_edges = scaled_excellent(good_width)
        bad_nodes, bad_edges = scaled_terrible(bad_width)
        good = grade(model, good_nodes, good_edges)
        bad = grade(model, bad_nodes, bad_edges)
        inverted = good["risk"] >= bad["risk"]
        print(
            f"  {good['nodes']:>3}n excellent -> {good['letter']} risk {good['risk']:.2f}"
            f"   |   {bad['nodes']:>3}n terrible -> {bad['letter']} risk {bad['risk']:.2f}"
            f"   [{'INVERTED' if inverted else 'pass'}]"
        )
        if inverted:
            failures.append(
                f"at ~{good['nodes']} nodes the excellent design ({good['risk']:.2f}) "
                f"scored no better than the anti-pattern ({bad['risk']:.2f})"
            )
    return not failures, failures


def main() -> None:
    model = load_model()

    all_failures: List[str] = []
    for check in (check_reference_architectures, check_size_invariance,
                  check_ordering_at_matched_size):
        _, failures = check(model)
        all_failures.extend(failures)

    print()
    print("=" * 78)
    if all_failures:
        print(f"GRADING SANITY: {len(all_failures)} FAILURE(S)")
        print("=" * 78)
        for failure in all_failures:
            print(f"  - {failure}")
        sys.exit(1)
    print("GRADING SANITY: all checks passed")
    print("=" * 78)


if __name__ == "__main__":
    main()
