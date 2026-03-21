# GhostTrace ML Pipeline

## Overview

This module trains and evaluates the graph representation used by InfraZero's GhostTrace system.
The encoder is a 2-layer GCN built with `torch_geometric.nn.GraphConv`.
It consumes 8 normalized node features and produces a 32-dimensional node embedding, which is then mean-pooled into a 32-dimensional graph embedding.

## Node Features

Each node is encoded with:

1. `processingPowerMs / 1000`
2. `coldStartLatencyMs / 1000`
3. `failureRatePercent / 100`
4. `inDegree / 10`
5. `outDegree / 10`
6. `fanOut / 8`
7. `isSPOF`
8. `nodeTypeId / 10`

## Training Data

Training graphs are expected under `ml-pipeline/data/graphs/`.
Each JSON file should look like:

```json
{
  "nodes": [...],
  "edges": [...],
  "label": "cascading_failure"
}
```

Use the existing labeling flow in [`../scraper/label_graphs.py`](C:/Users/rkj24/OneDrive/Desktop/Infrazero/ml-pipeline/scraper/label_graphs.py) to annotate graphs before training.

## Training

Install dependencies:

```bash
pip install -r requirements.txt
```

Run training:

```bash
python graph_encoder.py
```

This trains for 50 epochs, prints validation accuracy, and saves the model as `ghosttrace_gnn.pt`.

## Evaluation

Run evaluation helpers:

```bash
python evaluate_recall.py
```

The recall utility compares GhostTrace edge-risk predictions against imported incident records and returns precision, recall, and F1 metrics suitable for research reporting.

## Synthetic Traces

`trace_synthesizer.py` generates synthetic OpenTelemetry-style spans by walking topology paths from entry nodes.
The exported structure can also be wrapped into Jaeger JSON for local observability tooling.
The generated spans follow the OTel model of parent-child spans, status codes, timestamps, and attributes.

## InfraZero Integration

This pipeline feeds into InfraZero's GhostTrace backend service.
The trained graph encoder and synthetic trace tooling are intended to support model iteration, offline evaluation, and future risk-ranking upgrades.
