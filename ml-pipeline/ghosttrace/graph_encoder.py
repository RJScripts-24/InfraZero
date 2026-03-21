"""GhostTrace graph encoder training pipeline."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

import torch
import torch.nn.functional as F
from sklearn.model_selection import train_test_split
from torch import nn
from torch_geometric.data import Data, Dataset
from torch_geometric.loader import DataLoader
from torch_geometric.nn import GATv2Conv, global_max_pool, global_mean_pool


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_GRAPH_DIR = (ROOT_DIR / "data" / "graphs").resolve()
MODEL_OUTPUT_PATH = Path(__file__).resolve().parent / "ghosttrace_gnn.pt"
BEST_MODEL_PATH = Path(__file__).resolve().parent / "ghosttrace_gnn_best.pt"
TRAINING_HISTORY_PATH = Path(__file__).resolve().parent / "training_history.json"

LABEL_TO_INDEX = {
    "cascading_failure": 0,
    "thundering_herd": 1,
    "retry_storm": 2,
    "stable": 3,
}

NODE_TYPE_TO_ID = {
    "gateway": 1,
    "postgresql": 2,
    "cache": 3,
    "rabbitmq": 4,
    "service": 5,
}


def to_float(value: object, default: float = 0.0) -> float:
    """Safely convert arbitrary input to float."""

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def resolve_nodes(graph: Dict) -> List[Dict]:
    """Return graph nodes as a list."""

    nodes = graph.get("nodes", [])
    return nodes if isinstance(nodes, list) else []


def resolve_edges(graph: Dict) -> List[Dict]:
    """Return graph edges as a list."""

    edges = graph.get("edges", [])
    return edges if isinstance(edges, list) else []


def extract_node_type(node: Dict) -> str:
    """Normalize the node type string."""

    node_data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
    raw_type = node_data.get("type", node.get("type", ""))
    return str(raw_type).strip().lower()


def extract_node_label(node: Dict) -> str:
    """Normalize the node label string."""

    node_data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
    raw_label = node_data.get("label", node.get("label", ""))
    return str(raw_label).strip()


def extract_node_metric(node: Dict, field_name: str, default: float = 0.0) -> float:
    """Read metric from either node.data or the node root."""

    node_data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
    if field_name in node_data:
        return to_float(node_data.get(field_name), default)
    return to_float(node.get(field_name), default)


def edge_source(edge: Dict) -> str:
    """Return normalized edge source id."""

    return str(edge.get("source", edge.get("from", "")))


def edge_target(edge: Dict) -> str:
    """Return normalized edge target id."""

    return str(edge.get("target", edge.get("to", "")))


def build_degree_maps(nodes: Sequence[Dict], edges: Sequence[Dict]) -> tuple[Dict[str, int], Dict[str, int]]:
    """Build incoming and outgoing degree maps."""

    in_degree = {str(node.get("id", "")): 0 for node in nodes}
    out_degree = {str(node.get("id", "")): 0 for node in nodes}

    for edge in edges:
        source = edge_source(edge)
        target = edge_target(edge)
        if source in out_degree:
            out_degree[source] += 1
        if target in in_degree:
            in_degree[target] += 1

    return in_degree, out_degree


def encode_node_type(node: Dict) -> int:
    """Map domain-specific node types to a compact id space."""

    raw_type = extract_node_type(node)
    if raw_type in NODE_TYPE_TO_ID:
        return NODE_TYPE_TO_ID[raw_type]
    if "gateway" in raw_type:
        return NODE_TYPE_TO_ID["gateway"]
    if "postgres" in raw_type:
        return NODE_TYPE_TO_ID["postgresql"]
    if "cache" in raw_type:
        return NODE_TYPE_TO_ID["cache"]
    if "rabbit" in raw_type or "queue" in raw_type:
        return NODE_TYPE_TO_ID["rabbitmq"]
    if "service" in raw_type:
        return NODE_TYPE_TO_ID["service"]
    return 0


def build_node_features(nodes: Sequence[Dict], edges: Sequence[Dict]) -> torch.Tensor:
    """Create the requested 8-dimensional node feature tensor."""

    in_degree, out_degree = build_degree_maps(nodes, edges)
    features: List[List[float]] = []

    for node in nodes:
        node_id = str(node.get("id", ""))
        incoming = in_degree.get(node_id, 0)
        outgoing = out_degree.get(node_id, 0)
        fan_out = outgoing
        is_spof = 1.0 if incoming == 1 and outgoing == 0 else 0.0

        features.append(
            [
                extract_node_metric(node, "processingPowerMs", 100.0) / 1000.0,
                extract_node_metric(node, "coldStartLatencyMs", 0.0) / 1000.0,
                extract_node_metric(node, "failureRatePercent", 0.0) / 100.0,
                incoming / 10.0,
                outgoing / 10.0,
                fan_out / 8.0,
                is_spof,
                encode_node_type(node) / 10.0,
            ]
        )

    return torch.tensor(features, dtype=torch.float32)


def build_edge_index(nodes: Sequence[Dict], edges: Sequence[Dict]) -> torch.Tensor:
    """Create a PyG edge index tensor from graph edges."""

    node_index = {str(node.get("id", "")): index for index, node in enumerate(nodes)}
    pairs: List[List[int]] = []

    for edge in edges:
        source = node_index.get(edge_source(edge))
        target = node_index.get(edge_target(edge))
        if source is None or target is None:
            continue
        pairs.append([source, target])

    if not pairs:
        return torch.empty((2, 0), dtype=torch.long)

    return torch.tensor(pairs, dtype=torch.long).t().contiguous()


def graph_to_data(graph: Dict) -> Data:
    """Convert one graph JSON object to a PyG Data record."""

    nodes = resolve_nodes(graph)
    edges = resolve_edges(graph)
    if not nodes:
        raise ValueError("Graph has no nodes.")

    x = build_node_features(nodes, edges)
    edge_index = build_edge_index(nodes, edges)
    label = str(graph.get("label", "stable")).strip().lower()
    y = torch.tensor(LABEL_TO_INDEX.get(label, LABEL_TO_INDEX["stable"]), dtype=torch.long)

    return Data(x=x, edge_index=edge_index, y=y)


class GhostTraceGNN(nn.Module):
    """Three-layer GATv2 encoder that produces a graph-level embedding."""

    def __init__(self) -> None:
        super().__init__()
        self.conv1 = GATv2Conv(8, 64, heads=2, concat=True)
        self.conv2 = GATv2Conv(128, 64, heads=2, concat=True)
        self.conv3 = GATv2Conv(128, 32, heads=1, concat=False)
        self.dropout = nn.Dropout(p=0.5)

    def forward(self, data: Data) -> torch.Tensor:
        """Encode a graph into a single 64-dimensional embedding."""

        x, edge_index = data.x, data.edge_index
        batch = getattr(data, "batch", None)
        if batch is None:
            batch = torch.zeros(x.size(0), dtype=torch.long, device=x.device)

        x = self.conv1(x, edge_index)
        x = F.elu(x)
        x = self.dropout(x)
        x = self.conv2(x, edge_index)
        x = F.elu(x)
        x = self.dropout(x)
        x = self.conv3(x, edge_index)
        x = F.elu(x)

        # Concatenate mean and max graph pooling for both average and peak signals.
        pooled_mean = global_mean_pool(x, batch)
        pooled_max = global_max_pool(x, batch)
        return torch.cat([pooled_mean, pooled_max], dim=1)


class GraphDataset(Dataset):
    """Load labeled graph JSON files from data/graphs."""

    def __init__(self, root_dir: Path | str | None = None) -> None:
        super().__init__()
        self.root_dir = Path(root_dir or DEFAULT_GRAPH_DIR).resolve()
        self.graph_files = sorted(
            path
            for path in self.root_dir.rglob("*.json")
            if path.is_file()
        )

    def len(self) -> int:
        return len(self.graph_files)

    def get(self, index: int) -> Data:
        file_path = self.graph_files[index]
        graph = json.loads(file_path.read_text(encoding="utf-8"))
        data = graph_to_data(graph)
        data.graph_name = file_path.stem
        return data


class GraphClassifier(nn.Module):
    """A linear classifier on top of the graph embedding."""

    def __init__(self, encoder: GhostTraceGNN, num_classes: int) -> None:
        super().__init__()
        self.encoder = encoder
        self.head = nn.Sequential(
            nn.Linear(64, 32),
            nn.ELU(),
            nn.Dropout(p=0.2),
            nn.Linear(32, num_classes),
        )

    def forward(self, data: Data) -> torch.Tensor:
        """Return classification logits."""

        embedding = self.encoder(data)
        return self.head(embedding)


def evaluate(model: GraphClassifier, loader: DataLoader, device: torch.device) -> float:
    """Compute validation accuracy."""

    if len(loader.dataset) == 0:
        return 0.0

    model.eval()
    total = 0
    correct = 0

    with torch.no_grad():
        for batch in loader:
            batch = batch.to(device)
            logits = model(batch)
            predictions = logits.argmax(dim=1)
            correct += int((predictions == batch.y).sum().item())
            total += int(batch.y.size(0))

    return correct / total if total else 0.0


def split_indices(size: int) -> tuple[List[int], List[int]]:
    """Create an 80/20 train/validation split."""

    indices = list(range(size))
    if size < 2:
        return indices, indices

    return train_test_split(indices, test_size=0.2, random_state=42, shuffle=True)


def train() -> None:
    """Train the GhostTrace graph encoder and classifier."""

    dataset = GraphDataset()
    if len(dataset) == 0:
        raise FileNotFoundError(f"No graph JSON files found in {dataset.root_dir}")

    train_indices, val_indices = split_indices(len(dataset))
    train_dataset = [dataset[index] for index in train_indices]
    val_dataset = [dataset[index] for index in val_indices] if val_indices else train_dataset

    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=16, shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    encoder = GhostTraceGNN()
    model = GraphClassifier(encoder, num_classes=len(LABEL_TO_INDEX)).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=50)
    criterion = nn.CrossEntropyLoss()
    best_val_accuracy = 0.0
    best_epoch = 0
    epochs_without_improvement = 0
    patience = 20
    train_losses: List[float] = []
    val_accuracies: List[float] = []
    last_epoch = 0

    for epoch in range(1, 151):
        last_epoch = epoch
        model.train()
        running_loss = 0.0
        batches = 0

        for batch in train_loader:
            batch = batch.to(device)
            optimizer.zero_grad()
            logits = model(batch)
            loss = criterion(logits, batch.y)
            loss.backward()
            optimizer.step()

            running_loss += float(loss.item())
            batches += 1

        avg_loss = running_loss / batches if batches else 0.0
        val_accuracy = evaluate(model, val_loader, device)
        train_losses.append(avg_loss)
        val_accuracies.append(val_accuracy)
        scheduler.step()

        if val_accuracy > best_val_accuracy:
            best_val_accuracy = val_accuracy
            best_epoch = epoch
            epochs_without_improvement = 0
            torch.save(model.state_dict(), BEST_MODEL_PATH)
        else:
            epochs_without_improvement += 1

        print(f"Epoch {epoch:02d} | loss={avg_loss:.4f} | val_accuracy={val_accuracy:.4f}")

        if epochs_without_improvement >= patience:
            print(f"Early stopping at epoch {epoch:02d} (no improvement for {patience} epochs)")
            break

    if BEST_MODEL_PATH.exists():
        model.load_state_dict(torch.load(BEST_MODEL_PATH, map_location=device))

    torch.save(
        {
            "encoder_state_dict": encoder.state_dict(),
            "classifier_state_dict": model.head.state_dict(),
            "label_to_index": LABEL_TO_INDEX,
        },
        MODEL_OUTPUT_PATH,
    )

    history = {
        "epochs": list(range(1, last_epoch + 1)),
        "train_loss": train_losses,
        "val_accuracy": val_accuracies,
        "best_epoch": best_epoch,
        "best_val_accuracy": best_val_accuracy,
    }
    with open(os.path.join(os.path.dirname(__file__), "training_history.json"), "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    print(f"Best val_accuracy: {best_val_accuracy:.4f} at epoch {best_epoch}")
    print(f"Saved best checkpoint to {BEST_MODEL_PATH}")
    print(f"Saved model to {MODEL_OUTPUT_PATH}")
    print(f"Saved training history to {TRAINING_HISTORY_PATH}")


if __name__ == "__main__":
    train()
