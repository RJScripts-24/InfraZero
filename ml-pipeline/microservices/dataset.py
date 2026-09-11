"""Load the labelled architecture dataset into PyTorch Geometric records."""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
from torch_geometric.data import Data

from .config import DATASET_FILE, LABEL_TO_INDEX
from .features import encode_graph


def _record_to_data(record: Dict) -> Optional[Data]:
    """Convert one dataset line into a PyG Data object."""

    roles = record["roles"]
    pairs: List[Tuple[int, int]] = []
    kinds: List[str] = []
    for source, target, kind in record["edges"]:
        pairs.append((int(source), int(target)))
        kinds.append(kind)

    try:
        node_features, edge_index, edge_features, graph_features = encode_graph(roles, pairs, kinds)
    except (ValueError, AssertionError):
        return None

    label = str(record.get("label", "")).strip().lower()
    if label not in LABEL_TO_INDEX:
        return None

    observations = int(record.get("observations", 1))

    data = Data(
        x=torch.from_numpy(node_features),
        edge_index=torch.from_numpy(edge_index),
        edge_attr=torch.from_numpy(edge_features),
        y=torch.tensor([LABEL_TO_INDEX[label]], dtype=torch.long),
    )
    data.graph_features = torch.from_numpy(graph_features).view(1, -1)
    data.observations = torch.tensor([observations], dtype=torch.long)
    # Labels cut from a p99 over more traces are more trustworthy. Damped with a
    # log so that a structure seen a million times cannot dominate the epoch.
    data.confidence = torch.tensor([math.log1p(observations)], dtype=torch.float)
    data.signature = record.get("sig", "")
    data.tail_ms = torch.tensor([float(record.get("tail_ms", 0.0))], dtype=torch.float)
    # These labels are cut from production measurement, unlike the simulated
    # ones in deployment_dataset.py. Evaluation reports the two separately so a
    # modelled label can never be mistaken for a measured result.
    data.label_source = "measured"
    return data


# Hard ceiling on how many architectures are held in memory at once. Encoded
# records average roughly 4 KB, so this caps the dataset around 600 MB -- chosen
# to stay comfortable on an 8 GB machine that is also running an editor and a
# browser. Raise it with --max-records on a roomier box.
DEFAULT_MEMORY_CAP = 150_000


def load_dataset(
    path: Path = DATASET_FILE,
    max_records: int = 0,
    seed: int = 42,
) -> List[Data]:
    """Read architectures.jsonl into a list of PyG records.

    When the file holds more architectures than the memory cap allows, a uniform
    random subsample is taken via reservoir sampling rather than truncating at
    the head -- the file is written in signature order, so reading only the
    first N would bias the sample toward whichever structures hashed low.
    """

    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Run `python -m microservices.build_dataset` first."
        )

    cap = max_records if max_records > 0 else DEFAULT_MEMORY_CAP
    rng = random.Random(seed)

    reservoir: List[Data] = []
    seen = 0
    skipped = 0

    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            data = _record_to_data(json.loads(line))
            if data is None:
                skipped += 1
                continue

            seen += 1
            if len(reservoir) < cap:
                reservoir.append(data)
            else:
                # Reservoir sampling: every record has an equal chance of
                # surviving, and memory never grows past the cap.
                position = rng.randrange(seen)
                if position < cap:
                    reservoir[position] = data

    records = reservoir
    if seen > cap:
        print(f"  (subsampled {cap:,} of {seen:,} architectures to respect the memory cap)")
    if skipped:
        print(f"  ({skipped:,} records skipped as unencodable)")

    # Normalise the confidence weights to average 1.0 and clamp the extremes, so
    # weighting nudges the loss rather than reshaping the whole objective.
    weights = np.array([float(item.confidence) for item in records], dtype=np.float64)
    if len(weights):
        weights = weights / max(weights.mean(), 1e-9)
        weights = np.clip(weights, 0.5, 2.0)
        for item, weight in zip(records, weights):
            item.confidence = torch.tensor([float(weight)], dtype=torch.float)

    return records


def label_array(records: List[Data]) -> np.ndarray:
    return np.array([int(item.y.item()) for item in records], dtype=np.int64)
