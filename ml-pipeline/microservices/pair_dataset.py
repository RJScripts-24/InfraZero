"""Load matched architecture pairs into PyTorch Geometric records.

The model is shown the *before* topology, encoded by exactly the same
`encode_graph` the grader uses, plus a separate descriptor tensor saying what
was added and where it attached. Keeping the intervention out of the graph is
deliberate: if the added node were encoded as part of the topology, the network
could read the answer off the node count instead of reasoning about placement.

The descriptor is the "where it goes" half of the question. A cache in front of
a shared database and a cache hanging off a leaf service are the same component
and completely different interventions, so the descriptor carries the structural
properties of the attachment points -- their fan-in, their blast radius, whether
any of them is a single point of failure -- read out of the before-graph the
encoder is already computing.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
from torch_geometric.data import Data

from .build_pairs import PAIRS_FILE
from .config import (
    LINK_TO_INDEX,
    MODEL_ROLE_TO_INDEX,
    NUM_LINK_KINDS,
    NUM_MODEL_ROLES,
)
from .features import encode_graph, to_model_role

# Descriptor layout, in order:
#   [0 : 8]    added-component role, one-hot over the trained vocabulary
#   [8 : 10]   normalised inbound / outbound edge count of the addition
#   [10 : 16]  link-kind histogram over the edges the addition brings
#   [16 : 24]  role histogram of the components it attaches to
#   [24]       the addition is an entry point (nothing calls it)
#   [25]       share of the existing topology it touches
#   [26 : 32]  structural properties of the attachment points, read from the
#              before-graph: mean/max fan-in, mean/max blast radius,
#              mean/max single-point-of-failure flag
NUM_INTERVENTION_FEATURES = 2 * NUM_MODEL_ROLES + NUM_LINK_KINDS + 2 + 2 + 6

# Offsets into the per-node feature block produced by features.encode_graph.
_FANIN_OFFSET = NUM_MODEL_ROLES + 0
_BLAST_OFFSET = NUM_MODEL_ROLES + 9
_SPOF_OFFSET = NUM_MODEL_ROLES + 11

# Effects smaller than this in log space are called "no clear effect" rather
# than being forced into helps/hurts. exp(0.1) - 1 is about 10%, and a 10%
# tail-latency move between two different production systems is well inside the
# noise of an observational comparison.
DEFAULT_DEAD_BAND = 0.1

SIGN_CLASSES = ["helps", "no clear effect", "hurts"]


def sign_class(log_delta: float, dead_band: float = DEFAULT_DEAD_BAND) -> int:
    if log_delta < -dead_band:
        return 0
    if log_delta > dead_band:
        return 2
    return 1


def intervention_descriptor(pair: Dict, node_features: np.ndarray) -> np.ndarray:
    """Encode what was added and where it went, as a fixed-width vector."""

    descriptor = np.zeros(NUM_INTERVENTION_FEATURES, dtype=np.float32)
    num_before = max(int(pair.get("nodes_before", node_features.shape[0])), 1)

    descriptor[MODEL_ROLE_TO_INDEX[to_model_role(str(pair["add_role"]))]] = 1.0

    attach_in = pair.get("attach_in", []) or []
    attach_out = pair.get("attach_out", []) or []

    descriptor[NUM_MODEL_ROLES + 0] = min(len(attach_in) / 8.0, 1.0)
    descriptor[NUM_MODEL_ROLES + 1] = min(len(attach_out) / 8.0, 1.0)

    kind_base = NUM_MODEL_ROLES + 2
    incident = list(attach_in) + list(attach_out)
    for _, kind in incident:
        descriptor[kind_base + LINK_TO_INDEX.get(str(kind), LINK_TO_INDEX["unknown"])] += 1.0
    if incident:
        descriptor[kind_base:kind_base + NUM_LINK_KINDS] /= float(len(incident))

    role_base = kind_base + NUM_LINK_KINDS
    roles = pair.get("roles", [])
    touched = []
    for index, _ in incident:
        if 0 <= int(index) < len(roles):
            touched.append(int(index))
    for index in touched:
        descriptor[role_base + MODEL_ROLE_TO_INDEX[to_model_role(str(roles[index]))]] += 1.0
    if touched:
        descriptor[role_base:role_base + NUM_MODEL_ROLES] /= float(len(touched))

    flag_base = role_base + NUM_MODEL_ROLES
    descriptor[flag_base] = 1.0 if not attach_in else 0.0
    descriptor[flag_base + 1] = min(len(set(touched)) / float(num_before), 1.0)

    # Structural properties of the attachment points. This is what separates
    # "a cache in front of the database everything shares" from "a cache on a
    # leaf" -- same component, opposite consequences.
    stat_base = flag_base + 2
    unique = sorted(set(touched))
    if unique and node_features.shape[0] > 0:
        valid = [i for i in unique if i < node_features.shape[0]]
        if valid:
            fan_in = node_features[valid, _FANIN_OFFSET]
            blast = node_features[valid, _BLAST_OFFSET]
            spof = node_features[valid, _SPOF_OFFSET]
            descriptor[stat_base + 0] = float(fan_in.mean())
            descriptor[stat_base + 1] = float(fan_in.max())
            descriptor[stat_base + 2] = float(blast.mean())
            descriptor[stat_base + 3] = float(blast.max())
            descriptor[stat_base + 4] = float(spof.mean())
            descriptor[stat_base + 5] = float(spof.max())

    return descriptor


def _pair_to_data(pair: Dict, dead_band: float) -> Optional[Data]:
    roles = pair.get("roles", [])
    if len(roles) < 2:
        return None

    pairs_list = []
    kinds = []
    for entry in pair.get("edges", []):
        if len(entry) < 2:
            continue
        pairs_list.append((int(entry[0]), int(entry[1])))
        kinds.append(str(entry[2]) if len(entry) > 2 else "unknown")

    try:
        node_features, edge_index, edge_features, graph_features = encode_graph(
            roles, pairs_list, kinds
        )
    except (ValueError, AssertionError):
        return None

    log_delta = float(pair.get("log_delta", 0.0))
    if not math.isfinite(log_delta):
        return None

    descriptor = intervention_descriptor(pair, node_features)

    data = Data(
        x=torch.from_numpy(node_features),
        edge_index=torch.from_numpy(edge_index),
        edge_attr=torch.from_numpy(edge_features),
        y=torch.tensor([sign_class(log_delta, dead_band)], dtype=torch.long),
    )
    data.graph_features = torch.from_numpy(graph_features).view(1, -1)
    data.intervention = torch.from_numpy(descriptor).view(1, -1)
    data.log_delta = torch.tensor([log_delta], dtype=torch.float)
    # Binary direction, ignoring the dead band. This is the number that is
    # directly comparable to the 50% coin flip, so it is carried separately
    # rather than being derived from the 3-class label at report time.
    data.direction = torch.tensor([0 if log_delta < 0 else 1], dtype=torch.long)
    data.before_sig = str(pair.get("before_sig", ""))
    data.add_role = str(pair.get("add_role", "unknown"))
    data.observations = torch.tensor([int(pair.get("observations", 1))], dtype=torch.long)
    data.confidence = torch.tensor(
        [math.log1p(int(pair.get("observations", 1)))], dtype=torch.float
    )
    data.nodes_before = int(pair.get("nodes_before", len(roles)))
    return data


DEFAULT_MEMORY_CAP = 400_000


def load_pairs(
    path: Path = PAIRS_FILE,
    max_records: int = 0,
    dead_band: float = DEFAULT_DEAD_BAND,
    seed: int = 42,
) -> List[Data]:
    """Read matched_pairs.jsonl into PyG records."""

    if not path.exists():
        raise FileNotFoundError(
            str(path) + " not found. Run `python -m microservices.build_pairs` first."
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
            data = _pair_to_data(json.loads(line), dead_band)
            if data is None:
                skipped += 1
                continue
            seen += 1
            if len(reservoir) < cap:
                reservoir.append(data)
            else:
                position = rng.randrange(seen)
                if position < cap:
                    reservoir[position] = data

    if seen > cap:
        print("  (subsampled {:,} of {:,} pairs to respect the memory cap)".format(cap, seen))
    if skipped:
        print("  ({:,} pairs skipped as unencodable)".format(skipped))

    weights = np.array([float(item.confidence) for item in reservoir], dtype=np.float64)
    if len(weights):
        weights = weights / max(weights.mean(), 1e-9)
        weights = np.clip(weights, 0.5, 2.0)
        for item, weight in zip(reservoir, weights):
            item.confidence = torch.tensor([float(weight)], dtype=torch.float)

    return reservoir


def split_by_before_topology(records: List[Data], seed: int = 42,
                             train: float = 0.7, validation: float = 0.15):
    """Split so that the same base architecture never spans two splits.

    Splitting at random would put "add a cache to topology X" in train and "add
    a queue to topology X" in test. The encoder would have memorised X, and the
    held-out number would be measuring recall rather than generalisation.
    """

    by_signature: Dict[str, List[int]] = {}
    for index, record in enumerate(records):
        by_signature.setdefault(record.before_sig, []).append(index)

    signatures = sorted(by_signature.keys())
    rng = random.Random(seed)
    rng.shuffle(signatures)

    train_cut = int(len(signatures) * train)
    validation_cut = int(len(signatures) * (train + validation))

    def gather(names):
        out = []
        for name in names:
            out.extend(by_signature[name])
        return [records[i] for i in sorted(out)]

    return (
        gather(signatures[:train_cut]),
        gather(signatures[train_cut:validation_cut]),
        gather(signatures[validation_cut:]),
    )
