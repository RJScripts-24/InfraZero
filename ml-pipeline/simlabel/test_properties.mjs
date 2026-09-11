/**
 * Acceptance checks for the three properties the UI can now set.
 *
 * Each asserts that changing the field actually changes the analysis. A control
 * that writes a value nothing reads is decorative -- which is exactly what the
 * node inspector was before this change.
 */
import fs from 'fs';

const PKG = 'c:/Users/rkj24/OneDrive/Desktop/Infrazero/simulation-engine/pkg';
const engine = await import(`file:///${PKG}/infrazero_simulation_engine.js`);
engine.initSync({ module: fs.readFileSync(`${PKG}/infrazero_simulation_engine_bg.wasm`) });

const quiet = (f) => {
  const s = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  console.log = console.warn = console.error = console.info = () => {};
  try { return f(); } finally { Object.assign(console, s); }
};

const N = (id, t, extra = {}) => ({
  id, label: id, nodeType: t, processingPower: 1.0, coldStartLatencyMs: 5,
  queueCapacity: 100, failureRate: 0.0, x: 0, y: 0, providerIcon: null, ...extra,
});
const E = (s, t, extra = {}) => ({
  id: `${s}-${t}`, source: s, target: t, latencyMs: 2, jitterMs: 0.5,
  packetLoss: 0.0, bandwidthLimitMbps: 1000, ...extra,
});

const run = (graph, rps = 400) => {
  const config = {
    seed: 42, total_ticks: 250, traffic_pattern: 'steady', baseline_rps: rps,
    peak_rps_multiplier: 5, chaos_enabled: false, chaos_events: [], full_trace: false,
  };
  const raw = quiet(() => engine.run_simulation(JSON.stringify({ ...graph, config })));
  const parsed = JSON.parse(raw);
  if (parsed.error) throw new Error(`engine rejected input: ${parsed.error}`);
  return parsed;
};

let failures = 0;
const check = (name, condition, detail) => {
  console.log(`  ${condition ? '[pass]' : '[FAIL]'}  ${name}`);
  if (detail) console.log(`           ${detail}`);
  if (!condition) failures += 1;
};

console.log('='.repeat(78));
console.log('ACCEPTANCE -- do the new controls change the analysis?');
console.log('='.repeat(78));

// ── 1. replicas ────────────────────────────────────────────────────────────
const base = {
  nodes: [N('gw', 'api_gateway'), N('api', 'compute', { processingPower: 0.4 }), N('db', 'database')],
  edges: [E('gw', 'api'), E('api', 'db')],
};
const single = run(base, 800);
const replicated = run({
  ...base,
  nodes: base.nodes.map((n) => (n.id === 'api' ? { ...n, replicas: 5 } : n)),
}, 800);

check(
  'replicas 1 -> 5 changes the simulated result',
  single.avgP99LatencyMs !== replicated.avgP99LatencyMs
    || single.requestErrorRate !== replicated.requestErrorRate,
  `p99 ${single.avgP99LatencyMs?.toFixed(1)} -> ${replicated.avgP99LatencyMs?.toFixed(1)} ms | `
  + `err ${(single.requestErrorRate * 100).toFixed(1)}% -> ${(replicated.requestErrorRate * 100).toFixed(1)}%`,
);
check(
  'replicas 1 -> 5 does not make things worse under load',
  replicated.requestErrorRate <= single.requestErrorRate + 1e-9,
  `${(single.requestErrorRate * 100).toFixed(1)}% -> ${(replicated.requestErrorRate * 100).toFixed(1)}%`,
);

// ── 2. callKind async ──────────────────────────────────────────────────────
const syncGraph = {
  nodes: [N('gw', 'api_gateway'), N('api', 'compute'), N('worker', 'compute', { processingPower: 0.15 })],
  edges: [E('gw', 'api'), E('api', 'worker')],
};
const asyncGraph = {
  nodes: syncGraph.nodes,
  edges: [E('gw', 'api'), E('api', 'worker', { callKind: 'async' })],
};
const syncRun = run(syncGraph);
const asyncRun = run(asyncGraph);

check(
  'callKind async shortens the caller path (lower p99)',
  asyncRun.avgP99LatencyMs < syncRun.avgP99LatencyMs,
  `p99 ${syncRun.avgP99LatencyMs.toFixed(1)} -> ${asyncRun.avgP99LatencyMs.toFixed(1)} ms`,
);

// ── 3. callKind write bypasses the cache, read does not ────────────────────
const cacheNodes = [N('api', 'compute'), N('cache', 'cache'), N('db', 'database', { processingPower: 0.3 })];
const readRun = run({ nodes: cacheNodes, edges: [E('api', 'cache', { callKind: 'read' }), E('cache', 'db')] });
const writeRun = run({ nodes: cacheNodes, edges: [E('api', 'cache', { callKind: 'write' }), E('cache', 'db')] });

check(
  'callKind write is not served from cache, read is',
  writeRun.avgP99LatencyMs >= readRun.avgP99LatencyMs,
  `read p99 ${readRun.avgP99LatencyMs.toFixed(1)} ms vs write p99 ${writeRun.avgP99LatencyMs.toFixed(1)} ms`,
);

// ── 4. the saturating component is named ───────────────────────────────────
const saturated = run({
  nodes: [N('gw', 'api_gateway'), N('db', 'database', { processingPower: 0.02, queueCapacity: 10 })],
  edges: [E('gw', 'db')],
}, 3000);

const point = saturated.saturatingComponent;
check(
  'the saturating component is named in the output',
  Boolean(point?.nodeId),
  point
    ? `${point.nodeId} first overloaded at tick ${point.firstOverloadedTick}, `
      + `${(point.fractionOfRunOverloaded * 100).toFixed(0)}% of the run`
    : 'no saturating component reported',
);

console.log();
console.log('='.repeat(78));
console.log(failures === 0 ? 'ACCEPTANCE: all checks passed' : `ACCEPTANCE: ${failures} FAILURE(S)`);
console.log('='.repeat(78));
process.exit(failures === 0 ? 0 : 1);
