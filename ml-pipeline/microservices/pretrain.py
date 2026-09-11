"""Self-supervised encoder pretraining on real deployed architectures.

Why this stage exists
---------------------
`config.py` widened the model role vocabulary from 5 to 12 so that a load
balancer, a CDN edge, a batch tier and an object store stop being collapsed onto
"gateway" or "service". That widening is only safe if those dimensions are
actually populated by training data. An Alibaba call trace can never populate
them -- it records `rpctype` in {rpc, http, db, mc, mq} and nothing else -- so if
the trace-supervised fit were the only stage, seven of the twelve role columns
would be zero in every training example and the model would meet a load balancer
for the first time at inference. That is precisely the failure mode the original
five-role collapse was written to avoid.

Deployment manifests populate them. A `docker-compose.yml` or a Kubernetes
manifest tree names nginx, Kafka, Redis, S3 and Spark explicitly, so the roles
the traces cannot express are exactly the ones the manifests can. This stage
teaches the encoder to read them, before any grading head is attached.

The two objectives
------------------
**Masked role modelling.** Blank the role one-hot on a random 15% of nodes and
ask the encoder to recover it from structure and neighbours alone. To do that it
has to learn what each role's structural signature is: that caches are read by
many and read nothing, that a batch tier hangs off a queue rather than sitting on
the request path, that a load balancer fans out to peers of the same kind. This
is the objective that gives the seven new dimensions meaning.

**Link prediction.** Score real edges against sampled non-edges. This teaches
which wirings occur in systems people actually deploy -- and it is the closest
thing available to learning "what a working architecture looks like" from a
corpus that is, by construction, entirely made of systems that shipped.

Neither objective needs a label, which is what makes the manifest corpus usable
at all: those graphs carry no latency ground truth and must never be assigned one
by heuristic.

Run:  python -m microservices.pretrain --epochs 30
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.loader import DataLoader

from .config import (
    DATASET_DIR,
    DATASET_FILE,
    MODEL_DIR,
    NUM_MODEL_ROLES,
    RANDOM_SEED,
)
from .features import encode_canvas_graph, encode_graph
from .model import ArchitectureEncoder

PRETRAIN_CHECKPOINT = MODEL_DIR / "encoder_pretrained.pt"

DEPLOYMENTS_FILE = DATASET_DIR / "deployments" / "deployments.jsonl"
LARGE_SYSTEMS_FILE = DATASET_DIR / "deployments" / "large_systems.jsonl"

MASK_FRACTION = 0.15


def _wiring_is_plausible(num_nodes: int, num_edges: int) -> bool:
    """Reject graphs whose edges were mostly not recovered.

    Manifest parsing sometimes finds many workloads but little wiring -- one
    scraped repo yielded 34 nodes and 4 edges. Such a graph is mostly isolated
    vertices, and training link prediction on it teaches that real systems are
    disconnected, which is the opposite of true.
    """

    return num_edges >= max(3, int(num_nodes * 0.5))


def _load_canvas_graphs(path: Path, limit: int = 0) -> List[Data]:
    records: List[Data] = []
    if not path.exists():
        return records
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            graph = json.loads(line)
            nodes, edges = graph.get("nodes", []), graph.get("edges", [])
            if len(nodes) < 3 or not _wiring_is_plausible(len(nodes), len(edges)):
                continue
            try:
                node_features, edge_index, edge_features, _ = encode_canvas_graph(nodes, edges)
            except (ValueError, AssertionError):
                continue
            if edge_index.shape[1] == 0:
                continue
            records.append(
                Data(
                    x=torch.from_numpy(node_features),
                    edge_index=torch.from_numpy(edge_index),
                    edge_attr=torch.from_numpy(edge_features),
                )
            )
            if limit and len(records) >= limit:
                break
    return records


def _load_trace_graphs(limit: int) -> List[Data]:
    """Alibaba topologies, so pretraining covers the shapes the head is fit on."""

    records: List[Data] = []
    if not DATASET_FILE.exists() or limit <= 0:
        return records
    with open(DATASET_FILE, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            graph = json.loads(line)
            roles = graph.get("roles", [])
            pairs = [(int(s), int(t)) for s, t, _ in graph.get("edges", [])]
            kinds = [k for _, _, k in graph.get("edges", [])]
            if len(roles) < 3 or not pairs:
                continue
            try:
                node_features, edge_index, edge_features, _ = encode_graph(roles, pairs, kinds)
            except (ValueError, AssertionError):
                continue
            records.append(
                Data(
                    x=torch.from_numpy(node_features),
                    edge_index=torch.from_numpy(edge_index),
                    edge_attr=torch.from_numpy(edge_features),
                )
            )
            if len(records) >= limit:
                break
    return records


class PretrainHeads(nn.Module):
    """Two lightweight heads over the shared encoder, discarded after this stage."""

    def __init__(self, hidden_dim: int):
        super().__init__()
        self.role_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, NUM_MODEL_ROLES),
        )
        self.link_head = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def predict_roles(self, node_embeddings: torch.Tensor) -> torch.Tensor:
        return self.role_head(node_embeddings)

    def score_links(self, node_embeddings: torch.Tensor, pairs: torch.Tensor) -> torch.Tensor:
        source = node_embeddings[pairs[0]]
        target = node_embeddings[pairs[1]]
        return self.link_head(torch.cat([source, target], dim=1)).squeeze(-1)


def _sample_negative_edges(edge_index: torch.Tensor, num_nodes: int,
                           count: int, generator: random.Random) -> torch.Tensor:
    """Node pairs that are NOT edges, as the negative class for link prediction."""

    existing = set(zip(edge_index[0].tolist(), edge_index[1].tolist()))
    sources, targets = [], []
    attempts = 0
    while len(sources) < count and attempts < count * 20:
        attempts += 1
        source = generator.randrange(num_nodes)
        target = generator.randrange(num_nodes)
        if source == target or (source, target) in existing:
            continue
        sources.append(source)
        targets.append(target)
    if not sources:
        return torch.zeros((2, 0), dtype=torch.long)
    return torch.tensor([sources, targets], dtype=torch.long)


def run_epoch(encoder, heads, loader, optimiser, generator, train: bool) -> Dict[str, float]:
    encoder.train(train)
    heads.train(train)

    totals = {"role_loss": 0.0, "link_loss": 0.0, "role_correct": 0,
              "role_total": 0, "link_correct": 0, "link_total": 0, "batches": 0}

    for batch in loader:
        num_nodes = batch.x.size(0)
        if num_nodes < 4 or batch.edge_index.numel() == 0:
            continue

        # --- masked role modelling --------------------------------------- #
        # The role one-hot occupies the first NUM_MODEL_ROLES columns, so the
        # target is recoverable from the features themselves before masking.
        role_targets = batch.x[:, :NUM_MODEL_ROLES].argmax(dim=1)
        mask = torch.rand(num_nodes) < MASK_FRACTION
        if not bool(mask.any()):
            mask[torch.randint(0, num_nodes, (1,))] = True

        masked_x = batch.x.clone()
        masked_x[mask, :NUM_MODEL_ROLES] = 0.0
        masked_batch = Data(
            x=masked_x, edge_index=batch.edge_index, edge_attr=batch.edge_attr
        )
        masked_batch.batch = batch.batch

        with torch.set_grad_enabled(train):
            node_embeddings = encoder.encode_nodes(masked_batch)
            role_logits = heads.predict_roles(node_embeddings[mask])
            role_loss = F.cross_entropy(role_logits, role_targets[mask])

            # --- link prediction ------------------------------------------ #
            positive = batch.edge_index
            negative = _sample_negative_edges(
                positive, num_nodes, positive.size(1), generator
            )
            if negative.size(1):
                link_pairs = torch.cat([positive, negative], dim=1)
                link_targets = torch.cat([
                    torch.ones(positive.size(1)),
                    torch.zeros(negative.size(1)),
                ])
                link_scores = heads.score_links(node_embeddings, link_pairs)
                link_loss = F.binary_cross_entropy_with_logits(link_scores, link_targets)
            else:
                link_loss = torch.zeros((), requires_grad=train)
                link_scores = torch.zeros(0)
                link_targets = torch.zeros(0)

            loss = role_loss + link_loss

        if train:
            optimiser.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                list(encoder.parameters()) + list(heads.parameters()), 5.0
            )
            optimiser.step()

        totals["role_loss"] += float(role_loss)
        totals["link_loss"] += float(link_loss)
        totals["role_correct"] += int((role_logits.argmax(1) == role_targets[mask]).sum())
        totals["role_total"] += int(mask.sum())
        if link_targets.numel():
            predicted = (torch.sigmoid(link_scores) > 0.5).float()
            totals["link_correct"] += int((predicted == link_targets).sum())
            totals["link_total"] += int(link_targets.numel())
        totals["batches"] += 1

    batches = max(totals["batches"], 1)
    return {
        "role_loss": totals["role_loss"] / batches,
        "link_loss": totals["link_loss"] / batches,
        "role_acc": totals["role_correct"] / max(totals["role_total"], 1),
        "link_acc": totals["link_correct"] / max(totals["link_total"], 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Self-supervised encoder pretraining.")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--hidden-dim", type=int, default=96)
    parser.add_argument("--num-layers", type=int, default=3)
    parser.add_argument("--trace-graphs", type=int, default=12000,
                        help="Alibaba topologies mixed in, so pretraining covers "
                             "the shapes the grading head is later fitted on.")
    arguments = parser.parse_args()

    torch.manual_seed(RANDOM_SEED)
    generator = random.Random(RANDOM_SEED)

    print("loading real deployment architectures...")
    compose = _load_canvas_graphs(DEPLOYMENTS_FILE)
    large = _load_canvas_graphs(LARGE_SYSTEMS_FILE)
    traces = _load_trace_graphs(arguments.trace_graphs)
    print(f"  docker-compose / single-manifest : {len(compose):,}")
    print(f"  merged Kubernetes repositories   : {len(large):,}")
    print(f"  Alibaba trace topologies         : {len(traces):,}")

    records = compose + large + traces
    if len(records) < 50:
        raise SystemExit("not enough graphs to pretrain on.")

    # Report which role dimensions the corpus actually populates -- the entire
    # justification for widening the vocabulary rests on this not being sparse.
    role_counts = np.zeros(NUM_MODEL_ROLES, dtype=np.int64)
    for record in records:
        role_counts += record.x[:, :NUM_MODEL_ROLES].sum(dim=0).numpy().astype(np.int64)
    from .config import MODEL_ROLES
    print("\n  role coverage across the pretraining corpus:")
    for name, count in zip(MODEL_ROLES, role_counts):
        bar = "#" * min(40, int(count / max(role_counts.max(), 1) * 40))
        flag = "" if count else "   <- NEVER OBSERVED"
        print(f"    {name:<13} {count:>8,}  {bar}{flag}")

    generator.shuffle(records)
    split = int(len(records) * 0.9)
    train_records, validation_records = records[:split], records[split:]
    print(f"\n  {len(train_records):,} train / {len(validation_records):,} validation graphs")

    train_loader = DataLoader(train_records, batch_size=arguments.batch_size, shuffle=True)
    validation_loader = DataLoader(validation_records, batch_size=arguments.batch_size)

    encoder = ArchitectureEncoder(
        hidden_dim=arguments.hidden_dim, num_layers=arguments.num_layers
    )
    heads = PretrainHeads(arguments.hidden_dim)
    optimiser = torch.optim.AdamW(
        list(encoder.parameters()) + list(heads.parameters()),
        lr=arguments.learning_rate, weight_decay=1e-4,
    )

    best_score = -1.0
    history = []
    print()
    for epoch in range(1, arguments.epochs + 1):
        train_stats = run_epoch(encoder, heads, train_loader, optimiser, generator, True)
        validation_stats = run_epoch(encoder, heads, validation_loader, optimiser, generator, False)
        score = validation_stats["role_acc"] + validation_stats["link_acc"]
        marker = ""
        if score > best_score:
            best_score = score
            marker = "  <- best"
            torch.save(
                {
                    "encoder_state_dict": encoder.state_dict(),
                    "architecture": {
                        "hidden_dim": arguments.hidden_dim,
                        "num_layers": arguments.num_layers,
                    },
                    "corpus": {
                        "compose": len(compose),
                        "kubernetes_repos": len(large),
                        "trace_topologies": len(traces),
                    },
                    "validation": validation_stats,
                },
                PRETRAIN_CHECKPOINT,
            )
        history.append({"epoch": epoch, "train": train_stats, "validation": validation_stats})
        print(
            f"epoch {epoch:>3} | role {train_stats['role_acc']:.3f}/"
            f"{validation_stats['role_acc']:.3f} | link {train_stats['link_acc']:.3f}/"
            f"{validation_stats['link_acc']:.3f} | loss "
            f"{train_stats['role_loss'] + train_stats['link_loss']:.4f}{marker}"
        )

    (MODEL_DIR / "pretrain_history.json").write_text(
        json.dumps(history, indent=1), encoding="utf-8"
    )
    print(f"\nbest encoder written to {PRETRAIN_CHECKPOINT}")
    print("Fine-tune with:  python -m microservices.train --init-encoder")


if __name__ == "__main__":
    main()
