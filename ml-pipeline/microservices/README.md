# InfraZero — Microservice Architecture Grading

A graph neural network that grades a microservice architecture's reliability
risk from its **topology alone**, trained on production call traces from
Alibaba's [cluster-trace-microservices](https://github.com/alibaba/clusterdata)
v2021 and v2022 releases, with its encoder pretrained on real deployment
manifests scraped from GitHub.

The same model grades a topology whether it was drawn on the InfraZero canvas or
recovered from an uploaded architecture diagram by the vision importer.

---

## What the model does

**Input** — a directed graph of microservices. Nodes carry a *role*; edges carry
a *link kind* (rpc, http, db, mc, mq).

**Output** — one of three ordered risk grades, a calibrated probability over all
three, a topology embedding, per-node role / SPOF / blast-radius flags, and a
ranked list of node-level changes with the risk each one is predicted to remove.

| grade | letter | meaning |
|-------|--------|---------|
| `low` | A | faster than a system of this shape usually is |
| `medium` | C | about what its shape predicts |
| `high` | F | slower than its shape can account for |

## What it deliberately does *not* use

No response time, CPU, memory, or throughput measurement is ever a model input.

That is the constraint that makes the whole thing work. A diagram uploaded as a
PNG has no runtime telemetry attached, and neither does a topology someone has
only just sketched. If the model needed those numbers it could not grade either
one. So the network sees only structure and node roles, and *measured* latency is
used exclusively to derive the label it learns to predict.

---

## The label: size-residualised tail latency

The target is the tercile of **log p95 latency with the part explained by node
count, edge count and path depth regressed out**. The grade answers: *is this
architecture slower than a system of its shape should be?*

Two earlier targets were tried and measured against this one. Both failed, in
instructive ways.

**Attempt 1 — raw p95 latency.** Latency grows with the number of hops a request
makes, so the label partly graded graph size (rho +0.188 with node count). A
model trained on it scored **76.4%** on its held-out split and still:

* graded the published **Uber** and **Netflix** architectures **F**;
* degraded a *quality-invariant* design from A to C purely as it grew;
* graded a 30-node anti-pattern (thirty services on one shared database, no
  caches, a retry cycle) **A at 81% confidence**, above a 32-node excellent
  design at C.

**Attempt 2 — tail amplification (`tail_ms / p50_ms`).** Scale-free by
construction, and it did kill the size confound. It introduced a worse one:
amplification correlates **+0.165 with cache fraction**. A cache makes latency
bimodal — p50 is a hit, p95 is a miss plus the backend fetch — so caching
mechanically inflates tail/median even though it is unambiguously good.
Amplification measures latency *predictability*, not resilience, and a grader
trained on it penalises the very components that make architectures scale.

**Attempt 3 — the residual.** Only size and depth are regressed away, and that
split is the point: more hops cost more time whether a design is good or bad, so
that part is not the designer's fault. Everything a designer *does* control —
cache placement, what is shared, what is decoupled — stays in the residual.

| target | vs node count | vs cache fraction |
|---|---|---|
| `tail_ms` (attempt 1) | **+0.188** | -0.003 |
| `tail_amplification` (attempt 2) | -0.047 | **+0.165** — penalises caching |
| **residual** (current) | **+0.010** | **-0.102** — rewards caching |

Shape alone explains only R^2 = 0.065 of log tail latency, so residualising
removes the confound without removing the signal.

**Then the terciles are cut inside eight equal-count size strata**, not globally.
Residualising fixes the average size effect but not the tails, and the tails are
where this product lives: under a single global cut the 35-60 node band came out
**1.4% low / 67.1% medium / 31.5% high**. A model fitted on that has almost no
example of a large architecture being low risk, so it cannot grade one that way
however well built it is — which is exactly the regime the Uber and Netflix
diagrams occupy, and why a quality-invariant design still drifted A → C as it
grew. Stratifying makes every class present at every size by construction.

The grade therefore means: *compared with real production systems of comparable
size*, is this one slow?

Only topologies observed in enough traces for a stable estimate are labelled.
Every earlier cut stays reproducible via `relabel.py --target` / `--global-cut`.

---

## The role vocabulary, and why it is the size it is

A call trace records `rpctype` in {rpc, http, db, mc, mq}, so a trace-derived
graph can only ever express five roles. Encoding more than that while traces were
the only training source would have been actively harmful — a one-hot column that
is zero in every training example is an input the model was never taught to read,
so a load balancer would arrive at inference carrying no role signal at all.

Deployment manifests lift part of that limit, because they name components
explicitly. Measured coverage across the pretraining corpus decides which roles
are real:

```
service       72,484     loadbalancer     624
cache         72,340     batch          2,856
gateway       17,848     worker         2,026
database      17,139
queue         13,223
                          cdn   1    objectstore   4    external   6
```

So the encoder reads **eight** roles. CDN, object store and external client stay
in the *display* vocabulary — the canvas and the report name them precisely — but
collapse onto the nearest well-observed role before encoding. No amount of extra
scraping fixes those three: a CDN edge, an S3 bucket and a smart TV are not
things a deployment manifest declares, because none of them is a workload you
deploy.

The separations that actually fixed the grading are all in the supported set:
**batch apart from request-path service** (Hadoop, Spark and EMR hang off a
queue, not the hot path — reading them as services turned an offline fan-out into
a synchronous one) and **load balancer apart from gateway**.

---

## Layout

| file | role |
|------|------|
| `config.py` | paths, role and link vocabularies, feature widths, thresholds |
| `features.py` | **the shared encoder** — the one place a graph becomes model input |
| `build_dataset.py` | streams raw tarballs -> labelled architectures |
| `relabel.py` | re-cuts the label from a chosen measurement |
| `model.py` | the GNN: 3-layer edge-aware GINEConv encoder + classifier head |
| `dataset.py` | loads the dataset into PyTorch Geometric records |
| `pretrain.py` | self-supervised encoder pretraining on real deployments |
| `train.py` | supervised fit with a held-out test split and k-fold CV |
| `evaluate.py` | the held-out test report, plots, and baseline comparisons |
| `recommend.py` | node-level fixes ranked by model-predicted risk reduction |
| `reference_architectures.py` | Uber / Netflix transcriptions + synthetic controls |
| `test_grading_sanity.py` | the checks held-out accuracy cannot make |
| `scrape_deployments.py` | one manifest file -> one graph (compose-shaped systems) |
| `scrape_large_systems.py` | a whole repo's manifest tree -> one graph (20-60 nodes) |
| `sweep_labels.py` | picks the label estimator on evidence |
| `test_transfer.py` | regression tests for the canvas / vision transfer path |

`features.py` is imported by the dataset builder, the trainer and the inference
server. That is deliberate: it makes it structurally impossible for the canvas
encoding to drift away from the representation the model was trained on.

---

## Running it

### 1. Fetch the traces

Not in this repository — downloaded from Alibaba OSS by
`cluster-trace-microservices-v2021/fetchData.sh` and `-v2022/fetchData.sh`. The
pipeline reads whatever tarballs it finds under `$INFRAZERO_TRACE_DIR` (default
`C:/Users/rkj24/infrazero-traces`, deliberately **outside** the OneDrive-synced
repository so a multi-gigabyte download does not trigger a sync storm).

### 2. Build the dataset

```bash
python -m microservices.build_dataset
python -m microservices.relabel          # cut the label on measured fragility
```

Shard building is idempotent, so the command can be re-run to pick up newly
downloaded tarballs without redoing finished work.

### 3. Collect real deployment architectures

```bash
python -m microservices.scrape_deployments   --target 3000   # compose-shaped
python -m microservices.scrape_large_systems --target 1500   # 20-60 node systems
```

These carry **no latency ground truth** and must never be assigned one by
heuristic — that is precisely the shortcut an earlier iteration of this project
took. They are used only for what they can honestly support: the component
vocabulary and the shape of systems people actually deployed.

### 4. Pretrain the encoder, then fit the grading head

```bash
python -m microservices.pretrain --epochs 25
python -m microservices.train --init-encoder --cross-validate
```

Pretraining is self-supervised — masked role modelling and link prediction, both
label-free — which is what makes the manifest corpus usable at all. Training uses
a stratified 70/15/15 split over *distinct topologies*, so no architecture appears
in more than one split.

### 5. Evaluate, then run the sanity gate

```bash
python -m microservices.evaluate
python -m microservices.test_grading_sanity
```

`evaluate.py` reads the held-out test split exactly once. `test_grading_sanity.py`
asserts the three things accuracy cannot see: that published reference
architectures do not grade F, that a quality-invariant design does not degrade as
it grows, and that at matched size an excellent design outranks an anti-pattern.

**Run both.** A model can pass one and fail the other — the previous grader
scored 76.4% and failed every sanity check.

### 6. Serve

```bash
python ghosttrace/inference_server.py     # port 8001
```

`POST /predict` with `{nodes, edges}` in React Flow shape. The backend calls this
from `ghosttrace.service.ts`; when it is unreachable the backend falls back to
its rule-based classifier and logs that it did so.

### Tests

```bash
python -m microservices.test_transfer
python -m microservices.test_grading_sanity
```

---

## The matched-pair experiment, and its negative result

An attempt was made to replace the grade with something more directly useful:
*what will this specific change do?* It did not work, and the measurement is
recorded here rather than quietly dropped.

### The dataset

`build_pairs.py` extracts pairs of topologies from `architectures.jsonl` that are
identical except for one added component. Each topology is given a
Weisfeiler-Lehman signature over role- and kind-labelled edges; every node is
then dropped in turn and the remainder re-signed, and a match against another
observed topology forms a pair. From 42,001 labelled topologies this yields:

| | |
|---|---|
| matched pairs | **62,740** |
| the change made it faster | 25,901 (**41.3%**) |
| the change made it slower | 36,839 (**58.7%**) |
| 10th percentile effect | **-66%** latency |
| 90th percentile effect | **+164%** latency |

By added component: cache 27,378, service 23,938, database 5,577, queue 4,794,
gateway 1,053.

**The split is not 50/50, and that matters.** Adding a component adds a hop, and
a hop costs time, so "it got slower" is the common case by construction. The
baseline any model has to beat is therefore **58.7%**, not 50% -- "always say it
gets slower" is a one-line rule that scores that much and needs no model at all.

### Result 1: the existing recommender does not beat that rule

`validate_current_recommender.py` takes the criterion `recommend.py` actually
uses -- a change is worth making when it lowers the grader's expected risk --
and checks its implied direction against the measured one on 6,000 held-out
pairs.

| | |
|---|---|
| direction agreement | **55.0%** (95% CI 53.7-56.2) |
| coin flip | 50.0% |
| majority rule | **59.7%** |
| correlation, predicted vs measured | **+0.350** |

It beats a coin flip and loses to the trivial rule. The correlation is the
interesting part: the *ordering* carries real signal, but the decision threshold
is biased -- the grader calls changes helpful far more often than they are.

So the risk numbers are good for **ranking candidate changes against each other**
and worthless as **predictions of effect**, and `reportBuilder.service.ts` now
says exactly that instead of quoting `1.22 -> 0.52` as though it were a forecast.

### Result 2: a model trained directly on the pairs also does not beat it

`delta_model.py` reuses `ArchitectureEncoder` unchanged and adds two heads --
3-class direction and log-delta regression -- over the pooled before-topology,
the graph summary, and a 32-wide intervention descriptor carrying what was added
and the structural properties of where it attached. Split by before-topology
signature, so no base architecture spans two splits.

| | held-out |
|---|---|
| direction accuracy | **58.4%** (95% CI 57.4-59.4) |
| majority baseline | **59.9%** |
| 3-class sign accuracy | 44.8% |
| log-delta RMSE | 1.079 |
| magnitude correlation | +0.203 |

Per intervention it beats the majority rule on **none** of the five:

```
cache      n=4,163  55.8%  vs majority 57.2%
service    n=3,699  62.0%  vs majority 62.6%
database   n=  833  55.8%  vs majority 59.3%
queue      n=  711  59.9%  vs majority 64.4%
gateway    n=  165  50.9%  vs majority 52.1%
```

It is not a degenerate model -- `test_delta_sanity.py` confirms it uses both
answers (40.1% / 59.9%) and that its confidence genuinely varies with context
(P(helps) std 0.10-0.17 within each intervention family). It has learned
*something*. It has not learned enough to beat one line of code.

### What that means

Direction of effect, from topology alone, on this data, is close to unlearnable.
Two readings, and the honest position is that both are live:

1. **Placement genuinely does not determine the sign.** What decides whether a
   cache helps is hit rate, key distribution and read/write mix -- none of which
   a call-graph topology records.
2. **Matched pairs are not experiments.** Two different production systems that
   happen to differ by one component are not one system before and after a
   change. Different services, different traffic, different everything else.
   The confounders that the pairing removes are size and depth; it removes
   nothing else.

Either way the product conclusion is the same: **the tercile grade remains the
primary output**, because it is the thing that was actually validated, and the
delta model is not wired into the inference server. The fields exist in the
backend types (`predictedDeltaPercent`, `signConfidence`, `groundedInPairs`),
guarded and null, so that a model which does clear the bar can be surfaced
without another schema change.

Reproduce all of it:

```bash
python -m microservices.build_pairs
python -m microservices.validate_current_recommender
python -m microservices.train_delta --init-encoder
python -m microservices.evaluate_delta
python -m microservices.test_delta_sanity     # exits non-zero, by design
```

---

## A note on the simulation engine

`simulation-engine/` was evaluated as a source of survivability labels and
**rejected on measurement**. Run against 450 Alibaba topologies whose real
latency is known, its simulated p99 correlated with measured production tail
latency at rho = +0.04 (p = 0.39) — no relationship — and it graded 97% of
architectures "B".

The cause is structural: `queueDepth` is reset every tick, so backlog never
accumulates and nodes cannot saturate. A 128x increase in offered load (50 ->
6400 rps) moved p99 by 5 ms and never once produced a breaking point. It is a
path-latency calculator, not a queueing model, and labels drawn from it would
have taught the GNN to sum hop costs.

Fixing its contention model — carrying queue depth across ticks, shedding load at
capacity, modelling retry amplification — would make it a credible stress oracle
and would improve the simulation users actually run. Until then, the grade comes
from measurement.

---

## The traces can be deleted after step 2

Once `data/microservices/architectures.jsonl` exists, nothing downstream reads
the raw traces. Keep `data/microservices/shards/` if you might want to re-cut
labels at a different quantile — re-merging from shards takes seconds, whereas
re-parsing means downloading and streaming the tarballs again.
