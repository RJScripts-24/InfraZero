"""Load the simulator-labelled deployment corpus as supervised training data.

Why this module exists
----------------------
The grading head is fitted on Alibaba call traces, which record `rpctype` in
{rpc, http, db, mc, mq}. Three of the eight model roles -- `loadbalancer`,
`worker` and `batch` -- are therefore identically zero in every labelled example
the head sees, even though the encoder learned them during self-supervised
pretraining. Measured on the reference diagrams, that gap covers 38% of the
nodes in Uber and 29% in Netflix: the head meets a third of a real architecture
diagram for the first time at inference, and hedges accordingly.

Deployment manifests contain those roles in abundance but carry no measured
outcome. `simlabel/` supplies one by simulation.

What these labels are worth
---------------------------
Less than the Alibaba ones, and the code says so rather than pretending
otherwise. A trace-derived label is a *measurement* of what a real system did.
A simulated label is the engine's *verdict*, and the engine has been validated
only as a relative ranker -- it reproduces the correct ordering on six
architecture pairs whose better design is not in dispute, but predicts a
specific system's real latency at only rho=+0.115, because shape explains just
R^2=0.065 of Alibaba's measured tail.

Two consequences are encoded here:

* simulated records carry a lower sample weight, so they inform the head
  without overruling measurement;
* every record is tagged with its source, so `evaluate.py` can report accuracy
  per source instead of blending them into one flattering number.

The label is cut into terciles WITHIN size strata, exactly as `relabel.py` does
for the trace corpus -- the survivability score correlates with graph size for
the same structural reasons latency does, and a global cut would leave large
architectures with no low-risk examples.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
from torch_geometric.data import Data

from .config import CLASSES, DATASET_DIR, LABEL_TO_INDEX
from .features import encode_canvas_graph

DEPLOYMENTS_DIR = DATASET_DIR / "deployments"

# How much a simulated label counts relative to a measured one. Chosen rather
# than tuned: the simulator ranks architectures correctly but does not predict
# real latency, so its labels are worth having and not worth trusting equally.
SIMULATED_SAMPLE_WEIGHT = 0.6

NUM_SIZE_STRATA = 6


def _shard_files() -> List[Path]:
    if not DEPLOYMENTS_DIR.exists():
        return []
    return sorted(DEPLOYMENTS_DIR.glob("survivability.shard*.jsonl"))


def read_labelled_deployments() -> List[Dict]:
    """Every simulator-labelled graph across all shards."""

    records: List[Dict] = []
    for shard in _shard_files():
        with open(shard, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return records


def assign_risk_classes(records: List[Dict]) -> List[str]:
    """Tercile the survivability score within size strata.

    Survivability is "higher is better", so the ordering is inverted relative to
    a latency cut: the most survivable third is `low` risk.
    """

    if not records:
        return []

    scores = np.asarray([float(r["survivability"]) for r in records])
    order = sorted(range(len(records)), key=lambda i: len(records[i]["nodes"]))
    stratum_size = max(len(order) // NUM_SIZE_STRATA, 1)

    labels: List[str] = [""] * len(records)
    index = 0
    while index < len(order):
        chunk = order[index:index + stratum_size]
        remainder = order[index + stratum_size:]
        if 0 < len(remainder) < stratum_size // 2:
            chunk = order[index:]
        index += len(chunk)
        if not chunk:
            break

        values = scores[chunk]
        low_cut, high_cut = (float(x) for x in np.percentile(values, [100 / 3, 200 / 3]))
        for position in chunk:
            value = scores[position]
            if value >= high_cut:
                labels[position] = CLASSES[0]     # most survivable -> low risk
            elif value >= low_cut:
                labels[position] = CLASSES[1]
            else:
                labels[position] = CLASSES[2]     # least survivable -> high risk

    return labels


def _record_to_data(record: Dict, label: str) -> Optional[Data]:
    try:
        node_features, edge_index, edge_features, graph_features = encode_canvas_graph(
            record["nodes"], record["edges"]
        )
    except (ValueError, AssertionError, KeyError):
        return None
    if edge_index.shape[1] == 0:
        return None

    data = Data(
        x=torch.from_numpy(node_features),
        edge_index=torch.from_numpy(edge_index),
        edge_attr=torch.from_numpy(edge_features),
        y=torch.tensor([LABEL_TO_INDEX[label]], dtype=torch.long),
    )
    data.graph_features = torch.from_numpy(graph_features).view(1, -1)
    data.observations = torch.tensor([1], dtype=torch.long)
    data.confidence = torch.tensor([SIMULATED_SAMPLE_WEIGHT], dtype=torch.float)
    data.signature = str(record.get("source", ""))
    data.tail_ms = torch.tensor([0.0], dtype=torch.float)
    # Read by evaluate.py so simulated and measured accuracy stay separable.
    data.label_source = "simulated"
    return data


def load_deployment_dataset(verbose: bool = True) -> List[Data]:
    """Simulator-labelled deployment graphs, as PyG records."""

    records = read_labelled_deployments()
    if not records:
        if verbose:
            print("  no simulator-labelled deployments found "
                  "(run `node simlabel/label_corpus.mjs` first)")
        return []

    labels = assign_risk_classes(records)
    dataset: List[Data] = []
    for record, label in zip(records, labels):
        if not label:
            continue
        data = _record_to_data(record, label)
        if data is not None:
            dataset.append(data)

    if verbose:
        counts = {name: sum(1 for d in dataset if int(d.y.item()) == LABEL_TO_INDEX[name])
                  for name in CLASSES}
        sizes = [int(d.x.size(0)) for d in dataset]
        print(f"  simulator-labelled deployments: {len(dataset):,}  {counts}")
        if sizes:
            sizes.sort()
            print(f"    nodes min/median/max = {sizes[0]}/{sizes[len(sizes)//2]}/{sizes[-1]}")

    return dataset


def role_coverage(dataset: List[Data]) -> Dict[str, int]:
    """Count how often each model role fires across a dataset.

    The whole point of adding this corpus is to make the roles the traces cannot
    express non-zero in supervised training, so training prints this to prove it
    actually happened rather than assuming it did.
    """

    from .config import MODEL_ROLES, NUM_MODEL_ROLES

    totals = np.zeros(NUM_MODEL_ROLES, dtype=np.int64)
    for item in dataset:
        totals += item.x[:, :NUM_MODEL_ROLES].sum(dim=0).numpy().astype(np.int64)
    return {name: int(count) for name, count in zip(MODEL_ROLES, totals)}
