"""The intervention-effect model: what will *this change* do to this topology?

Deliberately reuses `ArchitectureEncoder` unchanged. That encoder was pretrained
self-supervised on real deployment manifests and then fitted on Alibaba traces,
and whatever it learned about how microservice topologies are shaped is just as
relevant here. Re-deriving it from scratch on a smaller dataset would throw that
away for nothing.

What is new is the head. The pooled before-topology embedding is concatenated
with the intervention descriptor and the whole-graph summary, and two heads sit
on top:

  sign_head       3 classes -- helps / no clear effect / hurts. The headline.
  magnitude_head  regression on log(tail_after / tail_before), for ranking.

Two heads rather than one regression because the two jobs have different error
tolerances. Getting the direction right is what makes a recommendation safe to
follow; getting the magnitude approximately right is what lets several correct
recommendations be ordered. A single regression optimises neither cleanly, since
the loss is dominated by the long tail of large effects.
"""

from __future__ import annotations

import torch
from torch import nn

from .config import NUM_GRAPH_FEATURES
from .model import ArchitectureEncoder, HIDDEN_DIM, NUM_LAYERS
from .pair_dataset import NUM_INTERVENTION_FEATURES

NUM_SIGN_CLASSES = 3


class InterventionEffectModel(nn.Module):
    """Predict the direction and size of one architectural change."""

    def __init__(
        self,
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
        self.intervention_norm = nn.BatchNorm1d(NUM_INTERVENTION_FEATURES)

        fused = hidden_dim * 3 + NUM_GRAPH_FEATURES + NUM_INTERVENTION_FEATURES

        # A shared trunk before the two heads: direction and magnitude are two
        # readings of the same underlying quantity, so letting them share
        # representation costs nothing and regularises both.
        self.trunk = nn.Sequential(
            nn.Linear(fused, 192),
            nn.BatchNorm1d(192),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(192, 96),
            nn.BatchNorm1d(96),
            nn.ReLU(),
            nn.Dropout(dropout * 0.5),
        )

        self.sign_head = nn.Linear(96, NUM_SIGN_CLASSES)
        self.magnitude_head = nn.Linear(96, 1)

    def _fuse(self, data) -> torch.Tensor:
        embedding = self.encoder(data)
        batch_size = embedding.size(0)
        graph_features = self.graph_feature_norm(
            data.graph_features.view(batch_size, -1)
        )
        intervention = self.intervention_norm(
            data.intervention.view(batch_size, -1)
        )
        return self.trunk(torch.cat([embedding, graph_features, intervention], dim=1))

    def forward(self, data):
        shared = self._fuse(data)
        return self.sign_head(shared), self.magnitude_head(shared).view(-1)

    @torch.no_grad()
    def predict(self, data):
        """Direction probabilities and predicted log-delta, for serving."""

        self.eval()
        logits, magnitude = self.forward(data)
        return torch.softmax(logits, dim=1), magnitude


def load_pretrained_encoder(model: InterventionEffectModel, checkpoint_path) -> bool:
    """Warm-start the encoder from the grader or the self-supervised checkpoint.

    Returns False rather than raising when the checkpoint is missing or shaped
    differently -- a cold start is a worse model, not a broken run, and the
    training script says which one happened.
    """

    try:
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    except (OSError, RuntimeError):
        return False

    state = checkpoint.get("model_state_dict", checkpoint)
    encoder_state = {}
    for key, value in state.items():
        if key.startswith("encoder."):
            encoder_state[key[len("encoder."):]] = value
        elif not key.startswith(("head.", "sign_head.", "magnitude_head.", "trunk.")):
            encoder_state[key] = value

    if not encoder_state:
        return False

    try:
        missing, unexpected = model.encoder.load_state_dict(encoder_state, strict=False)
    except RuntimeError:
        return False

    # A checkpoint that shares nothing but the odd buffer is not a warm start.
    return len(encoder_state) - len(unexpected) > 4
