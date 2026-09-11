# InfraZero ML Pipeline

The pipeline that trains InfraZero's **architecture grader** — a graph neural
network that scores a microservice topology's reliability risk from its shape
alone, learned from Alibaba production call traces.

Full documentation: **[`microservices/README.md`](microservices/README.md)**

## Setup

```bash
pip install -r ghosttrace/requirements.txt
```

## Running the pipeline

The Alibaba traces are not in this repository. Download the call-graph tarballs
into a directory outside the OneDrive-synced repo, then point the pipeline at it
with `INFRAZERO_TRACE_DIR` (default `C:/Users/rkj24/infrazero-traces`):

```bash
# 1. Traces -> labelled architectures  (streams tarballs, bounded memory)
python -m microservices.build_dataset

# 2. Pick the label estimator on evidence (optional but recommended)
python -m microservices.sweep_labels

# 3. Train, holding out a test split that evaluation reads exactly once
python -m microservices.train --cross-validate

# 4. Held-out test report + figures + baseline comparisons
python -m microservices.evaluate

# 5. Serve the grader to the InfraZero backend on port 8001
python ghosttrace/inference_server.py
```

Regression tests for the canvas / vision transfer path:

```bash
python -m microservices.test_transfer
```

## Output locations

| path | contents |
|------|----------|
| `data/microservices/shards/` | per-tarball intermediate architecture shards |
| `data/microservices/architectures.jsonl` | the labelled dataset — all training needs |
| `data/microservices/dataset_stats.json` | class balance, tercile cuts, label definition |
| `ghosttrace/ghosttrace_gnn.pt` | trained checkpoint (+ frozen split indices) |
| `ghosttrace/training_history.json` | per-epoch loss, accuracy, train/val gap |
| `ghosttrace/evaluation/` | `metrics_report.json` and figures |

Once `architectures.jsonl` exists the raw traces can be deleted — nothing
downstream reads them. Keep `shards/` if you may want to re-cut labels at a
different quantile; re-merging from shards takes seconds.

## Superseded work

`_archive_pre_microservices/` holds the previous iteration: the scraped-Excalidraw
and benchmark-repository graph dataset, its binary `stable`/`unstable` GATv2
model, and that model's evaluation output. It is kept for comparison and is not
read by anything.

The scrapers that produced it (`scraper/`, `collect/`) are likewise unused by the
current pipeline. They remain in the tree because they are independently useful
for gathering architecture diagrams, not because the grader depends on them.

## Notes

- Never commit `.env` or `data/`.
- `trace_synthesizer.py` generates synthetic OpenTelemetry spans by walking
  topology paths. It is independent of the grader and still usable on its own.
