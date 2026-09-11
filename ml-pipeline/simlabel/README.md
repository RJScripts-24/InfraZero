# simlabel — survivability labels from the simulation engine

Labels the scraped deployment corpus by putting each architecture under
simulated load, so the grading head gets supervised examples of components an
Alibaba call trace cannot express.

## The gap this closes

A call trace records `rpctype` in `{rpc, http, db, mc, mq}`. Three of the eight
model roles — `loadbalancer`, `worker` and `batch` — never appear in one, so
before this existed they were **identically zero in every labelled example the
grading head ever saw**. Measured on the reference diagrams, that covered:

| diagram | nodes on unseen roles |
|---|---|
| Uber | 11 of 29 — **38%** |
| Netflix | 9 of 31 — **29%** |

The head met a third of a real architecture diagram for the first time at
inference, and hedged accordingly: both graded C at 0.448 confidence, against
0.333 for a coin flip.

Deployment manifests contain those roles in abundance. What they lack is an
outcome — a manifest states how a system is built, never how it performed. The
simulation engine supplies one.

After labelling, every model role is supervised:

```
service      11,975      loadbalancer    661   <- was 0
database      3,637      worker        2,228   <- was 0
cache         1,510      batch         2,856   <- was 0
queue         1,237
gateway         364
```

## What had to be fixed first

The engine could not have produced a usable label in its previous state. Three
defects, all measured:

**1. No queueing.** `simulate_node_processing` incremented `active_connections`
and decremented it inside the same call, so every arriving request found the
node empty. `queue_depth` was declared, reported in metrics, and never written
to. Raising offered load **128×** (50 → 6400 rps) moved p99 by 5 ms and no node
ever saturated.

*Fixed:* a backlog that persists across ticks, a per-tick service capacity
derived from the component's kind, queueing delay proportional to the work
already in line, and load shedding once the buffer fills.

**2. No load distribution.** `resolve_path` always took the first unvisited
outbound edge, so every packet followed an identical path. In a twenty-way
fan-out, nineteen services received no traffic at all and the fan-out was
indistinguishable from a single chain.

*Fixed:* uniform random branch selection from the seeded RNG, so replay stays
deterministic while traffic actually spreads.

**3. Error rate diluted by path length.** `overall_error_rate` summed per-node
tallies, so one failure in a ten-hop chain read as a 10% error rate while the
same failure in a two-hop path read as 50% — long synchronous chains looked
*more* reliable than short ones.

*Fixed:* `request_error_rate`, counted once per request.

Two behaviours were also added, without which the most common architectural
advice there is could not be modelled at all: a request served from **cache**
terminates there rather than continuing to the backend, and a request handed to
a **queue** completes at the handoff, because that is what asynchronous means.

## What the engine is now validated for

**Ranking architectures — yes.** `test_ordering.mjs` scores six pairs whose
better design is not in dispute. All six come out in the right order:

| worse | better | score |
|---|---|---|
| shared database | sharded per service | 0.416 → 0.761 |
| no cache | cache in front of the DB | 0.389 → 0.681 |
| single web tier | replicas behind a load balancer | 0.230 → 0.248 |
| synchronous write | write decoupled through a queue | 0.389 → 0.708 |
| 8-hop chain | 2-hop path | 0.230 → 0.230 |
| weak database | provisioned database | 0.126 → 0.611 |

**Predicting a specific system's real latency — no.** Against 450 Alibaba
topologies with known production latency it reaches rho = +0.115 (p = 0.015).
That is a real relationship where there was none before (+0.041, p = 0.39), and
the class ordering now comes out monotone — but it is weak, and it is weak for a
structural reason: **architecture shape explains only R² = 0.065 of Alibaba's
measured tail latency.** The rest lives in per-service processing costs that no
diagram states and no topology-only model can recover.

So the labels these probes produce are the engine's *verdict*, not a measured
outcome, and the pipeline treats them that way — see below.

## The score

Four independent probes, each run at a **fixed reference load** so architectures
are compared on equal terms:

| probe | what it catches |
|---|---|
| `capacityRps` | throughput ceiling — the bottleneck |
| `latencyAtModerateLoad` | deep synchronous chains |
| `burstErrorRate` | tolerance of a 5× spike |
| `meanSingleNodeKill` | blast radius — redundancy |

Two calibration mistakes are worth recording, because both produced
plausible-looking but wrong rankings:

- **Scaling probe load to each architecture's own capacity** gave the stronger
  design a proportionally harder test. A design with 4× the throughput was
  measured against 4× the traffic and scored *worse* on burst tolerance than the
  bottlenecked design it beats. Headroom is already measured by `capacityRps`;
  the degradation probes now use a fixed load.
- **Taking the worst single-node kill** measured only the most critical
  component, which in nearly every architecture is the shared database — so a
  three-replica web tier scored identically to a single web server behind the
  same database. The mean sees redundancy; the max cannot.

## STATUS: the labels are built, and NOT yet trained on

The full path works end to end — 2,401 graphs labelled, every model role
supervised for the first time, training and evaluation wired to keep the two
sources separable. It was run, measured, and **reverted**. Both numbers:

| | measured accuracy (Alibaba) | sanity gate |
|---|---|---|
| without simulated labels | 0.7229 | **3/3 pass** |
| with simulated labels | 0.7239 | **0/3 — 4 failures** |

The simulated corpus bought no measurable accuracy on real data and broke every
reference check. Worse, it broke them *confidently*: Uber went from C at 44.8%
to **F at 85.4%**, Netflix from C at 44.8% to **F at 70.4%**. A hedge became a
wrong verdict.

### Why — and it is not a bug in the engine

Run the probes on Netflix directly and the engine ranks it correctly overall
(0.568, against 0.435 for a twelve-service shared-database anti-pattern). The
damage is in one component:

```
                        capacity   blast radius
Netflix                    800rps        0.306      <- worse
anti-pattern               400rps        0.162      <- better
```

Netflix's published diagram draws a *serial* chain — ELB, then Netty, then three
Zuul filters — with each tier as **one box**. The engine kills that box and
correctly reports catastrophe. In production each of those boxes is a fleet of
thousands of instances.

So the labels are internally correct and externally wrong: they encode a
**literal single-instance reading of a diagram**, and published architecture
diagrams draw tiers, not instances. Training on them made the head better at
reading the drawing and worse at grading the system the drawing depicts. The
anti-pattern scores *better* on blast radius purely because losing one of twelve
parallel services costs a twelfth of the traffic, while losing the single box
labelled "Netty Server" costs everything.

### What would make them usable

A replica count per node, and a kill probe that removes one replica rather than
the whole tier. That means:

1. a `replicas` field on the engine's `Node`, defaulting to 1;
2. capacity scaled by it, and `kill_node` degrading capacity by `1/replicas`
   instead of zeroing it;
3. the canvas exposing it, so a user states that their gateway is three
   instances rather than one.

That last point is the real product answer, and it is a feature rather than a
workaround: **the grader should grade what you actually drew**, and if you drew
one load balancer with everything behind it, being told that is a single point
of failure is correct and useful. What is wrong today is only that there is no
way to say "this box is a fleet".

Until then, `--include-simulated` exists, works, and should be left off.

## How the labels are wired (when enabled)

`microservices/deployment_dataset.py` cuts the score into terciles **within size
strata** (as `relabel.py` does for the trace corpus) and marks every record
`label_source = "simulated"`. Two consequences:

- simulated records carry a **lower sample weight** (0.6), so they inform the
  head without overruling measurement;
- `evaluate.py` reports accuracy **per source**, so a modelled label can never
  be mistaken for a measured production result.

## Running it

```bash
# validate the engine still ranks architectures correctly
node simlabel/test_ordering.mjs

# label the corpus (shard across processes; ~12 min for 2400 graphs on 6)
for i in 0 1 2 3 4 5; do node simlabel/label_corpus.mjs --shard $i/6 & done

# train on measured + simulated
python -m microservices.train --init-encoder --include-simulated
```

`test_ordering.mjs` is the gate. If a change to the engine drops it below 6/6,
the labels it produces are not trustworthy and should not be trained on.
