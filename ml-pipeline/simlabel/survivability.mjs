// A survivability score for an architecture, from the fixed simulation engine.
//
// Sustained throughput alone is too narrow a measure. Throughput is set by the
// bottleneck (Little's law), so putting replicas behind a load balancer, or
// decoupling writes through a queue, leaves it unchanged when the same database
// still sits at the end of every path -- yet both are real improvements. They
// show up in latency, in burst tolerance, and in what happens when a component
// dies. So the score is a composite of four independent probes.
import fs from 'fs';

const PKG = 'c:/Users/rkj24/OneDrive/Desktop/Infrazero/simulation-engine/pkg';
const engine = await import(`file:///${PKG}/infrazero_simulation_engine.js`);
engine.initSync({ module: fs.readFileSync(`${PKG}/infrazero_simulation_engine_bg.wasm`) });

const quiet = (f) => {
  const s = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  console.log = console.warn = console.error = console.info = () => {};
  try { return f(); } finally { Object.assign(console, s); }
};

export function simulate(graph, overrides = {}) {
  const config = {
    seed: 42, total_ticks: 250, traffic_pattern: 'steady', baseline_rps: 400,
    peak_rps_multiplier: 5, chaos_enabled: false, chaos_events: [], full_trace: false,
    ...overrides,
  };
  const raw = quiet(() => engine.run_simulation(JSON.stringify({ ...graph, config })));
  try {
    const p = JSON.parse(raw);
    if (p.error) return null;
    // Per-REQUEST error rate. overallErrorRate is summed over node visits and
    // so is divided by path length, which flatters long synchronous chains.
    return { p99: p.avgP99LatencyMs, err: p.requestErrorRate ?? p.overallErrorRate,
             status: p.status, requests: p.requestsIssued, failures: p.requestsFailed };
  } catch { return null; }
}

const LADDER = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

/**
 * The load at which the degradation probes are run, for every architecture.
 *
 * Fixed, deliberately. Scaling the probe load to each architecture's own
 * capacity gives the stronger design a proportionally harder test, so a design
 * with 4x the throughput was scored against 4x the traffic and came out looking
 * WORSE on burst tolerance than the bottlenecked design it beats. Headroom is
 * already measured separately by `capacityRps`; these probes ask a different
 * question -- at the same offered load, which degrades more gracefully?
 */
const REFERENCE_RPS = 400;

/**
 * A kill-node chaos event in the exact shape `ChaosEvent` deserialises.
 *
 * Every field is supplied explicitly. serde treats a missing `Option<T>` field
 * as an error unless the struct opts into defaults, and `ChaosEvent` does not --
 * so a partially-filled event is silently rejected, `run_simulation` returns an
 * error string, and the probe scores maximum damage for every node. That is
 * exactly what happened before this was fixed: blast radius read 1.0 for every
 * architecture, which is indistinguishable from "everything is fragile".
 */
function killNode(nodeId, triggerTick) {
  return {
    event_id: `kill-${nodeId}`,
    kind: 'kill_node',
    target_node: nodeId,
    target_edge: null,
    trigger_tick: triggerTick,
    duration_ticks: null,
    intensity: 1.0,
    partition_group_a: null,
    partition_group_b: null,
    random_target_pct: null,
  };
}

/** 1. Throughput ceiling: highest rps held below a 2% error rate. */
export function capacityRps(graph) {
  let best = 0;
  for (const rps of LADDER) {
    const r = simulate(graph, { baseline_rps: rps });
    if (!r || r.err > 0.02 || r.status === 'crashed') break;
    best = rps;
  }
  return best;
}

/** 2. Latency under a load the architecture can comfortably serve. */
export function latencyAtModerateLoad(graph) {
  const r = simulate(graph, { baseline_rps: REFERENCE_RPS });
  return r ? r.p99 : Number.POSITIVE_INFINITY;
}

/** 3. Burst tolerance: error rate when traffic spikes 5x over its baseline. */
export function burstErrorRate(graph) {
  const r = simulate(graph, {
    baseline_rps: REFERENCE_RPS, traffic_pattern: 'burst', peak_rps_multiplier: 5,
  });
  return r ? r.err : 1.0;
}

/**
 * 4. Blast radius: the MEAN damage done by killing one component at a time.
 *
 * Deliberately the mean rather than the worst case. Taking the worst measured
 * only the single most critical component, which in almost every architecture
 * is the shared database -- so a three-replica web tier and a single web server
 * behind the same database scored identically, and the probe could not see
 * redundancy at all. The mean answers the question that actually matters: of
 * the components here, how many can die without taking the system with them?
 */
export function meanSingleNodeKill(graph, sampleLimit = 8) {
  const rps = REFERENCE_RPS;
  // Rank by in-degree: the components most depended on are worth killing first.
  const inDegree = new Map();
  for (const e of graph.edges) inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  const targets = [...graph.nodes]
    .sort((a, b) => (inDegree.get(b.id) ?? 0) - (inDegree.get(a.id) ?? 0))
    .slice(0, sampleLimit);

  if (targets.length === 0) return 1.0;
  let total = 0;
  for (const node of targets) {
    const r = simulate(graph, {
      baseline_rps: rps,
      chaos_enabled: true,
      chaos_events: [killNode(node.id, 40)],
    });
    total += r ? r.err : 1.0;
  }
  return total / targets.length;
}

/**
 * Composite survivability, higher is better.
 *
 * Each term is squashed into 0-1 so no single probe dominates, then weighted.
 * Capacity and blast radius carry the most weight: an architecture that cannot
 * take the load, or that one dead component takes down with it, is not one that
 * survives real traffic.
 */
export function survivability(graph) {
  const capacity = capacityRps(graph);
  const latency = latencyAtModerateLoad(graph);
  const burst = burstErrorRate(graph);
  const blast = meanSingleNodeKill(graph);

  const capacityScore = Math.min(1, Math.log2(1 + capacity / 100) / Math.log2(1 + 12800 / 100));
  const latencyScore = 1 / (1 + latency / 200);
  const burstScore = 1 - Math.min(1, burst * 4);
  const blastScore = 1 - Math.min(1, blast * 2);

  const score = 0.35 * capacityScore + 0.15 * latencyScore + 0.20 * burstScore + 0.30 * blastScore;
  return { score, capacity, latency, burst, blast,
           parts: { capacityScore, latencyScore, burstScore, blastScore } };
}
