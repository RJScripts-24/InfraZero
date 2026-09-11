"""The GhostTrace architecture-grading GNN.

An edge-aware message-passing encoder over microservice topologies. Edge type
matters a great deal here -- a call into a cache behaves nothing like a call
into a database -- so the network uses GINEConv, which folds edge features into
every message rather than treating the graph as untyped.

Sized deliberately for CPU training on a modest machine: ~350k parameters,
three message-passing rounds, which is enough receptive field to cover the depth
of the call graphs in the data (median depth 3-4, tail around 10) without the
over-smoothing that deeper stacks bring on small graphs.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn
from torch_geometric.nn import GINEConv, global_add_pool, global_max_pool, global_mean_pool

from .config import (
    NUM_EDGE_FEATURES,
    NUM_GRAPH_FEATURES,
    NUM_NODE_FEATURES,
)

HIDDEN_DIM = 96
NUM_LAYERS = 3
GRAPH_EMBED_DIM = HIDDEN_DIM * 3  # mean + max + sum pooling


def _mlp(in_dim: int, out_dim: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Linear(in_dim, out_dim),
        nn.BatchNorm1d(out_dim),
        nn.ReLU(),
        nn.Linear(out_dim, out_dim),
    )


class ArchitectureEncoder(nn.Module):
    """Encode a topology into a fixed-width embedding."""

    def __init__(self, hidden_dim: int = HIDDEN_DIM, num_layers: int = NUM_LAYERS, dropout: float = 0.25):
        super().__init__()
        self.input_proj = nn.Linear(NUM_NODE_FEATURES, hidden_dim)
        self.edge_proj = nn.Linear(NUM_EDGE_FEATURES, hidden_dim)

        self.convs = nn.ModuleList(
            GINEConv(_mlp(hidden_dim, hidden_dim), train_eps=True) for _ in range(num_layers)
        )
        self.norms = nn.ModuleList(nn.BatchNorm1d(hidden_dim) for _ in range(num_layers))
        self.dropout = nn.Dropout(dropout)

    def encode_nodes(self, data) -> torch.Tensor:
        """Per-node embeddings, before pooling.

        Split out from `forward` because self-supervised pretraining needs the
        node-level view: masked-role prediction asks what a node is from its
        neighbourhood, and link prediction scores node pairs. Pooling would
        destroy exactly the information both tasks are trained on.
        """

        x, edge_index = data.x, data.edge_index
        edge_attr = data.edge_attr

        x = self.input_proj(x)

        if edge_index.numel() == 0:
            # A topology with no edges still has to produce an embedding: the
            # role histogram and node features alone carry real signal.
            edge_attr = torch.zeros((0, self.edge_proj.out_features), device=x.device)
        else:
            edge_attr = self.edge_proj(edge_attr)

        for conv, norm in zip(self.convs, self.norms):
            residual = x
            x = conv(x, edge_index, edge_attr)
            x = norm(x)
            x = F.relu(x)
            x = self.dropout(x)
            x = x + residual  # keeps gradients healthy on shallow, wide graphs

        return x

    def forward(self, data) -> torch.Tensor:
        x = self.encode_nodes(data)
        batch = data.batch

        # Three pooling views: mean for the typical node, max for the worst
        # offender (the bottleneck that decides tail latency), sum for scale.
        return torch.cat(
            [
                global_mean_pool(x, batch),
                global_max_pool(x, batch),
                global_add_pool(x, batch) / 32.0,
            ],
            dim=1,
        )


class ArchitectureGrader(nn.Module):
    """Encoder plus a classification head fed the graph-level summary too.

    Some risk signals -- overall density, SPOF ratio, the mix of databases to
    caches -- are properties of the whole topology rather than of any node, so
    they are concatenated onto the pooled embedding instead of being smeared
    across every node.
    """

    def __init__(
        self,
        num_classes: int,
        hidden_dim: int = HIDDEN_DIM,
        num_layers: int = NUM_LAYERS,
        dropout: float = 0.25,
    ):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.encoder = ArchitectureEncoder(
            hidden_dim=hidden_dim, num_layers=num_layers, dropout=dropout
        )

        self.graph_feature_norm = nn.BatchNorm1d(NUM_GRAPH_FEATURES)
        head_input = hidden_dim * 3 + NUM_GRAPH_FEATURES

        self.head = nn.Sequential(
            nn.Linear(head_input, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(dropout * 0.5),
            nn.Linear(64, num_classes),
        )

    def forward(self, data) -> torch.Tensor:
        embedding = self.encoder(data)
        graph_features = self.graph_feature_norm(data.graph_features.view(embedding.size(0), -1))
        return self.head(torch.cat([embedding, graph_features], dim=1))

    def embed(self, data) -> torch.Tensor:
        """Pooled topology embedding, surfaced by the inference server."""

        return self.encoder(data)
