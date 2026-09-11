// Label the scraped deployment corpus with simulated survivability.
//
// Why this exists
// ---------------
// The grading head is fitted on Alibaba call traces, which record `rpctype` in
// {rpc, http, db, mc, mq} and therefore cannot express a load balancer, a batch
// tier or an async worker. Those three roles are identically zero in every
// labelled example the head ever sees -- yet they account for 38% of the nodes
// in the Uber reference diagram and 29% in Netflix. The head meets a third of a
// real architecture diagram for the first time at inference, which is why it
// hedges on exactly the graphs this product exists to grade.
//
// Deployment manifests contain those roles in abundance. What they lack is a
// label: a manifest states how a system is built, never how it performed. The
// simulation engine supplies one.
//
// What the label is, and is not
// -----------------------------
// It is the engine's verdict on an architecture's survivability, not a measured
// production outcome. The engine was validated for exactly this use and no
// more: it reproduces the correct ORDERING on six architecture pairs where the
// better design is not in dispute (see test_ordering.mjs). It is NOT a
// predictor of any particular system's real latency -- tested against 450
// Alibaba topologies with known production latency it reaches rho=+0.115,
// because architecture shape explains only R^2=0.065 of real tail latency and
// the rest lives in per-service processing costs no diagram states.
//
// So these labels are used to teach the head what the unseen roles DO
// structurally, while the Alibaba-derived labels remain the measured ground
// truth for everything they can cover. Which source a record came from is
// recorded on it.
//
// Run:  node simlabel/label_corpus.mjs --shard 0/6

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { survivability } from './survivability.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '..', 'data', 'microservices', 'deployments');
const SOURCES = ['deployments.jsonl', 'large_systems.jsonl'];

// Canvas node type -> engine node type. Mirrors the backend's
// nodeTypeToEngineType so a graph is simulated the same way whether it arrives
// from the scraper or from the canvas.
const ENGINE_TYPE = [
  [['postgres', 'mysql', 'mongo', 'database', 'cassandra', 'db'], 'database'],
  [['cache', 'redis', 'memcach'], 'cache'],
  [['rabbit', 'kafka', 'queue', 'mq', 'broker'], 'queue'],
  [['gateway', 'api gw', 'bff'], 'api_gateway'],
  [['infrastructure', 'load', 'nginx', 'haproxy', 'envoy', 'traefik'], 'load_balancer'],
  [['edge', 'cdn'], 'edge'],
  [['background job', 'worker', 'batch', 'spark', 'hadoop'], 'compute'],
];

function engineType(nodeType, label) {
  const hay = `${nodeType} ${label}`.toLowerCase();
  for (const [needles, kind] of ENGINE_TYPE) {
    if (needles.some((n) => hay.includes(n))) return kind;
  }
  return 'compute';
}

function toEngineGraph(graph) {
  const nodes = graph.nodes.map((node) => ({
    id: String(node.id),
    label: String(node.data?.label ?? node.id),
    nodeType: engineType(String(node.data?.type ?? ''), String(node.data?.label ?? '')),
    processingPower: 1.0,
    coldStartLatencyMs: 5,
    queueCapacity: 100,
    failureRate: 0.0,
    x: 0, y: 0, providerIcon: null,
  }));
  const known = new Set(nodes.map((n) => n.id));
  const edges = graph.edges
    .filter((e) => known.has(String(e.source)) && known.has(String(e.target))
                   && String(e.source) !== String(e.target))
    .map((e, i) => ({
      id: `e${i}`, source: String(e.source), target: String(e.target),
      latencyMs: 2, jitterMs: 0.5, packetLoss: 0.0, bandwidthLimitMbps: 1000,
    }));
  return { nodes, edges };
}

function parseShard(argv) {
  const flag = argv.indexOf('--shard');
  if (flag < 0) return { index: 0, count: 1 };
  const [index, count] = argv[flag + 1].split('/').map(Number);
  return { index, count };
}

const { index: shardIndex, count: shardCount } = parseShard(process.argv);

const records = [];
for (const source of SOURCES) {
  const file = path.join(DATA, source);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const graph = JSON.parse(line);
    // Reject graphs whose wiring was mostly not recovered: a pile of isolated
    // vertices simulates as trivially survivable and teaches nothing.
    if (graph.nodes.length < 5 || graph.edges.length < Math.max(3, graph.nodes.length * 0.4)) continue;
    records.push({ graph, source });
  }
}

const mine = records.filter((_, i) => i % shardCount === shardIndex);
const outPath = path.join(DATA, `survivability.shard${shardIndex}.jsonl`);
const sink = fs.createWriteStream(outPath, { flags: 'w' });

console.log(`shard ${shardIndex}/${shardCount}: ${mine.length} of ${records.length} graphs`);
const started = Date.now();
let done = 0;

for (const { graph, source } of mine) {
  let result;
  try {
    result = survivability(toEngineGraph(graph));
  } catch (error) {
    continue;
  }
  if (!Number.isFinite(result.score)) continue;

  sink.write(JSON.stringify({
    source: graph.source,
    corpus: source,
    nodes: graph.nodes,
    edges: graph.edges,
    survivability: Number(result.score.toFixed(5)),
    capacity_rps: result.capacity,
    p99_ms: Number(result.latency.toFixed(2)),
    burst_error_rate: Number(result.burst.toFixed(5)),
    mean_blast_radius: Number(result.blast.toFixed(5)),
  }) + '\n');

  done += 1;
  if (done % 25 === 0) {
    const rate = done / ((Date.now() - started) / 1000);
    const eta = (mine.length - done) / Math.max(rate, 1e-6) / 60;
    console.log(`  ${done}/${mine.length}  ${rate.toFixed(2)} graphs/s  eta ${eta.toFixed(1)} min`);
  }
}

sink.end();
console.log(`shard ${shardIndex} wrote ${done} labelled graphs to ${path.basename(outPath)} ` +
            `in ${((Date.now() - started) / 60000).toFixed(1)} min`);
