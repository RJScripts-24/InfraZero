"""GhostTrace graph encoder training pipeline."""

from __future__ import annotations

from collections import Counter
import json
import math
import random
import os
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.utils.class_weight import compute_class_weight
from torch import nn
from torch.utils.data import WeightedRandomSampler
from torch_geometric.data import Data, Dataset
from torch_geometric.loader import DataLoader
from torch_geometric.nn import GATv2Conv, global_max_pool, global_mean_pool


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_GRAPH_DIR = (ROOT_DIR / "data" / "graphs").resolve()
MODEL_OUTPUT_PATH = Path(__file__).resolve().parent / "ghosttrace_gnn.pt"
BEST_MODEL_PATH = Path(__file__).resolve().parent / "ghosttrace_gnn_best.pt"
TRAINING_HISTORY_PATH = Path(__file__).resolve().parent / "training_history.json"

LABEL_TO_INDEX = {
    "stable": 0,
    "unstable": 1,
}

CLASSES = ["stable", "unstable"]

NODE_TYPE_TO_ID = {
    "gateway": 1,
    "postgresql": 2,
    "cache": 3,
    "rabbitmq": 4,
    "service": 5,
    "client": 6,
    "compute": 7,
    "database": 8,
    "storage": 9,
    "cdn": 10,
    "load_balancer": 11,
    "infrastructure": 12,
    "queue": 13,
    "monitoring": 14,
    "redis": 15,
    "kafka": 16,
    "proxy": 17,
    "api": 18,
}

NUM_NODE_FEATURES = 14
MAX_TYPE_ID = max(NODE_TYPE_TO_ID.values())


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
    if field_name in node:
        return to_float(node.get(field_name), default)
    return default


def node_has_metrics(node: Dict) -> bool:
    """Return True if the node has any performance metrics."""

    node_data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
    metric_fields = ["processingPowerMs", "coldStartLatencyMs", "failureRatePercent"]
    for field in metric_fields:
        if field in node_data or field in node:
            val = to_float(node_data.get(field, node.get(field)), -1.0)
            if val > 0:
                return True
    return False


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


def build_adjacency_list(nodes: Sequence[Dict], edges: Sequence[Dict]) -> Dict[str, List[str]]:
    """Build adjacency list for neighbor lookups."""

    adj: Dict[str, List[str]] = {str(node.get("id", "")): [] for node in nodes}
    for edge in edges:
        source = edge_source(edge)
        target = edge_target(edge)
        if source in adj:
            adj[source].append(target)
        if target in adj:
            adj[target].append(source)
    return adj


def encode_node_type(node: Dict) -> int:
    """Map domain-specific node types to a compact id space."""

    raw_type = extract_node_type(node)
    if raw_type in NODE_TYPE_TO_ID:
        return NODE_TYPE_TO_ID[raw_type]
    if "gateway" in raw_type or "api" in raw_type:
        return NODE_TYPE_TO_ID["gateway"]
    if "postgres" in raw_type or "mysql" in raw_type or "database" in raw_type or "db" in raw_type:
        return NODE_TYPE_TO_ID["postgresql"]
    if "cache" in raw_type or "redis" in raw_type:
        return NODE_TYPE_TO_ID["cache"]
    if "rabbit" in raw_type or "queue" in raw_type or "kafka" in raw_type:
        return NODE_TYPE_TO_ID["rabbitmq"]
    if "service" in raw_type or "compute" in raw_type:
        return NODE_TYPE_TO_ID["service"]
    if "client" in raw_type or "user" in raw_type:
        return NODE_TYPE_TO_ID["client"]
    if "storage" in raw_type or "blob" in raw_type or "s3" in raw_type:
        return NODE_TYPE_TO_ID["storage"]
    if "cdn" in raw_type or "edge" in raw_type:
        return NODE_TYPE_TO_ID["cdn"]
    if "load" in raw_type or "balancer" in raw_type or "lb" in raw_type or "proxy" in raw_type:
        return NODE_TYPE_TO_ID["load_balancer"]
    if "infra" in raw_type:
        return NODE_TYPE_TO_ID["infrastructure"]
    if "monitor" in raw_type or "metric" in raw_type or "log" in raw_type:
        return NODE_TYPE_TO_ID["monitoring"]
    return 0


def build_node_features(nodes: Sequence[Dict], edges: Sequence[Dict]) -> torch.Tensor:
    """Create 14-dimensional topology-centric node feature tensor.

    Features are designed to work for BOTH scraped graphs (no metrics) and
    benchmark graphs (rich metrics).  Topology features [0-9] are always
    available; metric features [10-12] gracefully degrade to zero when
    absent, and feature [13] flags whether metrics are present.
    """

    in_degree, out_degree = build_degree_maps(nodes, edges)
    adj = build_adjacency_list(nodes, edges)

    num_nodes = len(nodes)
    # Precompute per-node total degrees for normalization.
    total_degrees: Dict[str, int] = {}
    for node in nodes:
        nid = str(node.get("id", ""))
        total_degrees[nid] = in_degree.get(nid, 0) + out_degree.get(nid, 0)

    max_in = max(in_degree.values(), default=1)
    max_out = max(out_degree.values(), default=1)
    max_total = max(total_degrees.values(), default=1)

    features: List[List[float]] = []

    for node in nodes:
        node_id = str(node.get("id", ""))
        incoming = in_degree.get(node_id, 0)
        outgoing = out_degree.get(node_id, 0)
        total_deg = total_degrees.get(node_id, 0)

        # [0] Normalized node type
        type_id = encode_node_type(node)
        norm_type = type_id / MAX_TYPE_ID if MAX_TYPE_ID > 0 else 0.0

        # [1] Normalized in-degree (relative to graph max)
        norm_in = incoming / max_in if max_in > 0 else 0.0

        # [2] Normalized out-degree (relative to graph max)
        norm_out = outgoing / max_out if max_out > 0 else 0.0

        # [3] Normalized total degree
        norm_total = total_deg / max_total if max_total > 0 else 0.0

        # [4] Is leaf node
        is_leaf = 1.0 if outgoing == 0 else 0.0

        # [5] Is root node (no incoming edges)
        is_root = 1.0 if incoming == 0 else 0.0

        # [6] Is single point of failure
        is_spof = 1.0 if incoming == 1 and outgoing == 0 else 0.0

        # [7] Degree centrality
        degree_centrality = total_deg / max(num_nodes - 1, 1)
        degree_centrality = min(degree_centrality, 1.0)

        # [8] Fan-in ratio (fraction of degree that is incoming)
        fan_in_ratio = incoming / total_deg if total_deg > 0 else 0.0

        # [9] Neighbor average degree
        neighbor_ids = adj.get(node_id, [])
        if neighbor_ids:
            neighbor_degrees = [total_degrees.get(nid, 0) for nid in neighbor_ids]
            neighbor_avg = sum(neighbor_degrees) / len(neighbor_degrees)
            neighbor_avg_norm = min(neighbor_avg / max_total, 1.0) if max_total > 0 else 0.0
        else:
            neighbor_avg_norm = 0.0

        # [10-12] Metric features (graceful degradation to 0)
        proc_power = min(extract_node_metric(node, "processingPowerMs", 0.0) / 1000.0, 1.0)
        cold_start = min(extract_node_metric(node, "coldStartLatencyMs", 0.0) / 1000.0, 1.0)
        failure_rate = min(extract_node_metric(node, "failureRatePercent", 0.0) / 100.0, 1.0)

        # [13] Has-metrics flag
        has_metrics = 1.0 if node_has_metrics(node) else 0.0

        features.append(
            [
                norm_type,          # 0
                norm_in,            # 1
                norm_out,           # 2
                norm_total,         # 3
                is_leaf,            # 4
                is_root,            # 5
                is_spof,            # 6
                degree_centrality,  # 7
                fan_in_ratio,       # 8
                neighbor_avg_norm,  # 9
                proc_power,         # 10
                cold_start,         # 11
                failure_rate,       # 12
                has_metrics,        # 13
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
    if label in {"thundering_herd", "cascading_failure", "retry_storm"}:
        label = "unstable"
    y = torch.tensor(LABEL_TO_INDEX.get(label, LABEL_TO_INDEX["stable"]), dtype=torch.long)

    return Data(x=x, edge_index=edge_index, y=y)


class GhostTraceGNN(nn.Module):
    """Three-layer GATv2 encoder with residual connections."""

    def __init__(self) -> None:
        super().__init__()
        # Layer 1: 14 -> 128 (64 * 2 heads)
        self.conv1 = GATv2Conv(NUM_NODE_FEATURES, 64, heads=2, concat=True)
        self.norm1 = nn.LayerNorm(128)
        self.skip1 = nn.Linear(NUM_NODE_FEATURES, 128)

        # Layer 2: 128 -> 128 (64 * 2 heads)
        self.conv2 = GATv2Conv(128, 64, heads=2, concat=True)
        self.norm2 = nn.LayerNorm(128)
        # skip2 is identity since dims match

        # Layer 3: 128 -> 64
        self.conv3 = GATv2Conv(128, 64, heads=1, concat=False)
        self.norm3 = nn.LayerNorm(64)
        self.skip3 = nn.Linear(128, 64)

        self.dropout = nn.Dropout(p=0.3)

    def forward(self, data: Data) -> torch.Tensor:
        """Encode a graph into a 128-dimensional embedding."""

        x, edge_index = data.x, data.edge_index
        batch = getattr(data, "batch", None)
        if batch is None:
            batch = torch.zeros(x.size(0), dtype=torch.long, device=x.device)

        # Layer 1 with residual
        x_in = x
        x = self.conv1(x, edge_index)
        x = self.norm1(x)
        x = F.elu(x)
        x = x + self.skip1(x_in)
        x = self.dropout(x)

        # Layer 2 with residual (identity, dims match)
        x_in = x
        x = self.conv2(x, edge_index)
        x = self.norm2(x)
        x = F.elu(x)
        x = x + x_in
        x = self.dropout(x)

        # Layer 3 with residual
        x_in = x
        x = self.conv3(x, edge_index)
        x = self.norm3(x)
        x = F.elu(x)
        x = x + self.skip3(x_in)

        # Concatenate mean and max graph pooling for both average and peak signals.
        pooled_mean = global_mean_pool(x, batch)
        pooled_max = global_max_pool(x, batch)
        return torch.cat([pooled_mean, pooled_max], dim=1)  # 128-dim


class GraphDataset(Dataset):
    """Load labeled graph JSON files from data/graphs."""

    def __init__(self, root_dir: Path | str | None = None, debug: bool = False) -> None:
        super().__init__()
        self.root_dir = Path(root_dir or DEFAULT_GRAPH_DIR).resolve()
        self.debug = debug
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
        nodes = resolve_nodes(graph)
        edges = resolve_edges(graph)
        if self.debug and index == 0 and nodes:
            x = build_node_features(nodes, edges)
            in_degree, out_degree = build_degree_maps(nodes, edges)
            print(f"[DEBUG] First node features: {x[0].tolist()}")
            print(f"[DEBUG] in_degree: {dict(list(in_degree.items())[:5])}")
            print(f"[DEBUG] out_degree: {dict(list(out_degree.items())[:5])}")
        data = graph_to_data(graph)
        data.graph_name = file_path.stem
        return data


class FocalLoss(nn.Module):
    """Focal loss for imbalanced classification.

    Down-weights well-classified examples so the model focuses on
    hard-to-classify samples.  gamma=2 is the standard setting from
    the original paper (Lin et al., 2017).
    """

    def __init__(
        self,
        weight: torch.Tensor | None = None,
        gamma: float = 2.0,
        label_smoothing: float = 0.05,
    ) -> None:
        super().__init__()
        self.gamma = gamma
        self.label_smoothing = label_smoothing
        self.register_buffer("weight", weight)

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        num_classes = logits.size(1)
        ce_loss = F.cross_entropy(
            logits,
            targets,
            weight=self.weight,
            reduction="none",
            label_smoothing=self.label_smoothing,
        )
        probs = torch.softmax(logits, dim=1)
        target_probs = probs.gather(1, targets.unsqueeze(1)).squeeze(1)
        focal_weight = (1.0 - target_probs) ** self.gamma
        return (focal_weight * ce_loss).mean()


class GraphClassifier(nn.Module):
    """A classifier on top of the graph embedding with batch normalization."""

    def __init__(self, encoder: GhostTraceGNN, num_classes: int) -> None:
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


def evaluate_with_threshold(
    model: GraphClassifier,
    loader: DataLoader,
    device: torch.device,
) -> tuple[float, float, float, int, int, int, int]:
    """Compute best validation balanced accuracy and diagnostics by threshold search."""

    if len(loader.dataset) == 0:
        return 0.0, 0.0, 0.5, 0, 0, 0, 0

    model.eval()
    all_probs: List[float] = []
    all_labels: List[int] = []

    with torch.no_grad():
        for batch in loader:
            batch = batch.to(device)
            logits = model(batch)
            probs = torch.softmax(logits, dim=1)[:, 1]
            all_probs.extend(probs.detach().cpu().tolist())
            all_labels.extend(batch.y.detach().cpu().tolist())

    if not all_labels:
        return 0.0, 0.0, 0.5, 0, 0, 0, 0

    best_bal_acc = 0.0
    best_acc = 0.0
    best_threshold = 0.5
    best_tn = 0
    best_fp = 0
    best_fn = 0
    best_tp = 0
    labels_np = np.array(all_labels)
    probs_np = np.array(all_probs)

    for threshold in np.linspace(0.05, 0.95, 91):
        preds = (probs_np >= threshold).astype(np.int64)

        tn = int(((preds == 0) & (labels_np == 0)).sum())
        fp = int(((preds == 1) & (labels_np == 0)).sum())
        fn = int(((preds == 0) & (labels_np == 1)).sum())
        tp = int(((preds == 1) & (labels_np == 1)).sum())

        tpr = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        tnr = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        bal_acc = (tpr + tnr) / 2.0
        acc = float((preds == labels_np).mean())

        if bal_acc > best_bal_acc or (bal_acc == best_bal_acc and acc > best_acc):
            best_bal_acc = bal_acc
            best_acc = acc
            best_threshold = float(threshold)
            best_tn = tn
            best_fp = fp
            best_fn = fn
            best_tp = tp

    return best_bal_acc, best_acc, best_threshold, best_tn, best_fp, best_fn, best_tp


def source_aware_split(dataset: GraphDataset) -> tuple[List[int], List[int]]:
    """Split graphs so that 80% of benchmarks go to training and 20% to validation.

    All synthetic/scraped graphs go to training.  Benchmark graphs are split
    stratified 80/20 so the model sees real-world structures during training
    while still being validated on held-out real-world architectures.
    """

    synthetic_indices: List[int] = []
    benchmark_stable: List[int] = []
    benchmark_unstable: List[int] = []

    BENCHMARK_KEYWORDS = [
        "trainticket", "train-ticket", "deathstar", "online-boutique",
        "robot-shop", "sock-shop", "benchmark", "bank-of-anthos",
        "confluent-kafka", "apache-kafka", "piggymetrics", "otel-demo",
        "voting-app", "azure-voting", "aws-microservices", "piomin",
        "spring-petclinic", "spring-boot-cloud", "spring-series",
        "ibm-cloud-native", "container-solutions", "eventuate",
        "ewolff", "in28minutes", "ddd-forum", "spree-ecommerce",
    ]

    for i in range(len(dataset)):
        file_path = str(dataset.graph_files[i]).lower()
        try:
            graph = json.loads(dataset.graph_files[i].read_text(encoding="utf-8"))
            source = str(graph.get("source", "")).lower()
            label = str(graph.get("label", "stable")).strip().lower()
        except Exception:
            source = ""
            label = "stable"

        combined = file_path + " " + source
        is_benchmark = any(kw in combined for kw in BENCHMARK_KEYWORDS)

        if is_benchmark:
            if label in {"thundering_herd", "cascading_failure", "retry_storm", "unstable"}:
                benchmark_unstable.append(i)
            else:
                benchmark_stable.append(i)
        else:
            synthetic_indices.append(i)

    # Stratified 50/50 split of benchmarks for adequate validation size
    random.seed(42)
    random.shuffle(benchmark_stable)
    random.shuffle(benchmark_unstable)

    val_stable_count = max(1, len(benchmark_stable) // 2)
    val_unstable_count = max(1, len(benchmark_unstable) // 2)

    val_indices = (
        benchmark_stable[:val_stable_count]
        + benchmark_unstable[:val_unstable_count]
    )
    train_benchmark = (
        benchmark_stable[val_stable_count:]
        + benchmark_unstable[val_unstable_count:]
    )

    train_indices = synthetic_indices + train_benchmark
    random.shuffle(train_indices)

    return train_indices, val_indices


def train() -> None:
    """Train the GhostTrace graph encoder and classifier."""

    # Keep training reproducible and reduce variance across runs.
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(42)

    dataset = GraphDataset(DEFAULT_GRAPH_DIR)
    if len(dataset) == 0:
        raise FileNotFoundError(f"No graph JSON files found in {dataset.root_dir}")

    train_indices, val_indices = source_aware_split(dataset)

    print("Source-aware split (benchmark 50/50 stratified):")
    print(f"  Training:   {len(train_indices)} graphs (synthetic + 50% benchmarks)")
    print(f"  Validation: {len(val_indices)} graphs (50% held-out benchmarks)")

    if len(val_indices) < 5:
        print(f"WARNING: Only {len(val_indices)} validation graphs found.")
        print("Falling back to random 80/20 split.")
        total = len(dataset)
        train_size = int(0.8 * total)
        val_size = total - train_size
        torch.manual_seed(42)
        train_dataset, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])
        train_indices = list(train_dataset.indices)
        val_indices = list(val_dataset.indices)
    else:
        from torch.utils.data import Subset

        train_dataset = Subset(dataset, train_indices)
        val_dataset = Subset(dataset, val_indices)
        print("Validation on held-out benchmark architectures.")

    print(f"  Total:      {len(dataset)} graphs\n")

    train_labels = [dataset[i].y.item() for i in train_indices]
    val_labels = [dataset[i].y.item() for i in val_indices]

    print("Training set class distribution:")
    stable_count = sum(1 for label in train_labels if label == LABEL_TO_INDEX["stable"])
    unstable_count = sum(1 for label in train_labels if label == LABEL_TO_INDEX["unstable"])
    for cls, count in zip(CLASSES, [stable_count, unstable_count]):
        print(f"  {cls:22s}: {count}")

    print("Validation set class distribution:")
    val_stable_count = sum(1 for label in val_labels if label == LABEL_TO_INDEX["stable"])
    val_unstable_count = sum(1 for label in val_labels if label == LABEL_TO_INDEX["unstable"])
    for cls, count in zip(CLASSES, [val_stable_count, val_unstable_count]):
        print(f"  {cls:22s}: {count}")
    print()

    class_counts = Counter(train_labels)

    # Balance training batches via inverse-frequency sampling.
    sample_weights = [1.0 / class_counts[label] for label in train_labels]
    train_sampler = WeightedRandomSampler(
        weights=torch.tensor(sample_weights, dtype=torch.double),
        num_samples=len(sample_weights),
        replacement=True,
    )

    train_loader = DataLoader(train_dataset, batch_size=32, sampler=train_sampler)
    val_loader = DataLoader(val_dataset, batch_size=16, shuffle=False)

    class_weights = compute_class_weight(
        class_weight='balanced',
        classes=np.array([0, 1]),
        y=np.array(train_labels),
    )
    weight_tensor = torch.tensor(class_weights, dtype=torch.float)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    encoder = GhostTraceGNN()
    model = GraphClassifier(encoder, num_classes=len(LABEL_TO_INDEX)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=20, T_mult=2, eta_min=1e-6,
    )
    criterion = FocalLoss(
        weight=weight_tensor.to(device), gamma=2.0, label_smoothing=0.05,
    )
    best_val_bal_accuracy = 0.0
    best_val_accuracy = 0.0
    best_threshold = 0.5
    best_epoch = 0
    epochs_without_improvement = 0
    patience = 30
    train_losses: List[float] = []
    val_accuracies: List[float] = []
    last_epoch = 0
    max_epochs = 300

    for epoch in range(1, max_epochs + 1):
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
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            running_loss += float(loss.item())
            batches += 1

        scheduler.step()

        avg_loss = running_loss / batches if batches else 0.0
        (
            val_bal_accuracy,
            val_accuracy,
            epoch_threshold,
            val_tn,
            val_fp,
            val_fn,
            val_tp,
        ) = evaluate_with_threshold(model, val_loader, device)
        train_losses.append(avg_loss)
        val_accuracies.append(val_bal_accuracy)

        if val_bal_accuracy > best_val_bal_accuracy:
            best_val_bal_accuracy = val_bal_accuracy
            best_val_accuracy = val_accuracy
            best_threshold = epoch_threshold
            best_epoch = epoch
            epochs_without_improvement = 0
            torch.save(model.state_dict(), BEST_MODEL_PATH)
            print(
                f"  *** New best: bal_acc={val_bal_accuracy:.4f}, acc={val_accuracy:.4f} "
                f"(threshold={epoch_threshold:.2f}) ***"
            )
        else:
            epochs_without_improvement += 1

        print(
            f"Epoch {epoch:02d} | loss={avg_loss:.4f} | val_bal_acc={val_bal_accuracy:.4f} "
            f"| val_acc={val_accuracy:.4f} | threshold={epoch_threshold:.2f} "
            f"| CM[tn={val_tn}, fp={val_fp}, fn={val_fn}, tp={val_tp}]"
        )

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
            "decision_threshold": best_threshold,
        },
        MODEL_OUTPUT_PATH,
    )

    history = {
        "epochs": list(range(1, last_epoch + 1)),
        "train_loss": train_losses,
        "val_balanced_accuracy": val_accuracies,
        "best_epoch": best_epoch,
        "best_val_accuracy": best_val_accuracy,
        "best_val_balanced_accuracy": best_val_bal_accuracy,
        "best_decision_threshold": best_threshold,
    }
    with open(os.path.join(os.path.dirname(__file__), "training_history.json"), "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    print(
        f"Best val_bal_acc: {best_val_bal_accuracy:.4f} "
        f"(val_acc={best_val_accuracy:.4f}, threshold={best_threshold:.2f}) at epoch {best_epoch}"
    )
    print(f"Saved best checkpoint to {BEST_MODEL_PATH}")
    print(f"Saved model to {MODEL_OUTPUT_PATH}")
    print(f"Saved training history to {TRAINING_HISTORY_PATH}")


if __name__ == "__main__":
    train()
