// Can the fixed simulator RANK architectures the way an engineer would?
//
// It cannot predict a specific system's absolute latency -- shape explains only
// R^2=0.065 of Alibaba's measured tail, the rest being per-service processing
// costs no diagram states. Ranking is what it is actually used for, so ranking
// is what is measured here: pairs where the better design is not in dispute.
import fs from 'fs';
import { survivability } from './survivability.mjs';

const N = (id, t, power = 1.0) => ({ id, label: id, nodeType: t, processingPower: power,
  coldStartLatencyMs: 5, queueCapacity: 100, failureRate: 0.0, x: 0, y: 0, providerIcon: null });
const E = (s, t) => ({ id: `${s}-${t}`, source: s, target: t,
  latencyMs: 2, jitterMs: 0.5, packetLoss: 0.0, bandwidthLimitMbps: 1000 });


const fanout = (n, mk) => { const nodes = [N('gw', 'api_gateway')]; const edges = []; mk(nodes, edges, n); return { nodes, edges }; };

const CASES = [
  ['shared database', 'database sharded per service', () => {
    const a = fanout(8, (nodes, edges, n) => { nodes.push(N('db', 'database'));
      for (let i = 0; i < n; i++) { nodes.push(N(`s${i}`, 'compute')); edges.push(E('gw', `s${i}`), E(`s${i}`, 'db')); } });
    const b = fanout(8, (nodes, edges, n) => {
      for (let i = 0; i < n; i++) { nodes.push(N(`s${i}`, 'compute'), N(`d${i}`, 'database')); edges.push(E('gw', `s${i}`), E(`s${i}`, `d${i}`)); } });
    return [a, b];
  }],
  ['no cache in front of DB', 'cache in front of DB', () => {
    const a = fanout(6, (nodes, edges, n) => { nodes.push(N('db', 'database'));
      for (let i = 0; i < n; i++) { nodes.push(N(`s${i}`, 'compute')); edges.push(E('gw', `s${i}`), E(`s${i}`, 'db')); } });
    const b = fanout(6, (nodes, edges, n) => { nodes.push(N('db', 'database'), N('cache', 'cache'));
      for (let i = 0; i < n; i++) { nodes.push(N(`s${i}`, 'compute')); edges.push(E('gw', `s${i}`), E(`s${i}`, 'cache')); }
      edges.push(E('cache', 'db')); });
    return [a, b];
  }],
  ['single web tier', 'web tier behind a load balancer', () => {
    const a = { nodes: [N('gw', 'api_gateway'), N('web', 'compute'), N('db', 'database')],
                edges: [E('gw', 'web'), E('web', 'db')] };
    const b = { nodes: [N('gw', 'api_gateway'), N('lb', 'load_balancer'), N('w1', 'compute'),
                        N('w2', 'compute'), N('w3', 'compute'), N('db', 'database')],
                edges: [E('gw', 'lb'), E('lb', 'w1'), E('lb', 'w2'), E('lb', 'w3'),
                        E('w1', 'db'), E('w2', 'db'), E('w3', 'db')] };
    return [a, b];
  }],
  ['synchronous write to DB', 'write decoupled through a queue', () => {
    const a = fanout(6, (nodes, edges, n) => { nodes.push(N('db', 'database'));
      for (let i = 0; i < n; i++) { nodes.push(N(`s${i}`, 'compute')); edges.push(E('gw', `s${i}`), E(`s${i}`, 'db')); } });
    const b = fanout(6, (nodes, edges, n) => { nodes.push(N('db', 'database'), N('q', 'queue'), N('w', 'compute'));
      for (let i = 0; i < n; i++) { nodes.push(N(`s${i}`, 'compute')); edges.push(E('gw', `s${i}`), E(`s${i}`, 'q')); }
      edges.push(E('q', 'w'), E('w', 'db')); });
    return [a, b];
  }],
  ['deep 8-hop synchronous chain', 'shallow 2-hop path', () => {
    const a = { nodes: [N('gw', 'api_gateway')], edges: [] };
    let prev = 'gw';
    for (let i = 0; i < 8; i++) { a.nodes.push(N(`s${i}`, 'compute')); a.edges.push(E(prev, `s${i}`)); prev = `s${i}`; }
    a.nodes.push(N('db', 'database')); a.edges.push(E(prev, 'db'));
    const b = { nodes: [N('gw', 'api_gateway'), N('s', 'compute'), N('db', 'database')],
                edges: [E('gw', 's'), E('s', 'db')] };
    return [a, b];
  }],
  ['weak database (0.3x)', 'provisioned database (2x)', () => {
    const mk = (p) => fanout(6, (nodes, edges, n) => { nodes.push(N('db', 'database', p));
      for (let i = 0; i < n; i++) { nodes.push(N(`s${i}`, 'compute')); edges.push(E('gw', `s${i}`), E(`s${i}`, 'db')); } });
    return [mk(0.3), mk(2.0)];
  }],
];

console.log('ORDERING BENCHMARK -- composite survivability should be higher for the better design\n');
console.log(`  ${'worse design'.padEnd(32)} ${'better design'.padEnd(32)} ${'worse'.padStart(7)} ${'better'.padStart(7)}  verdict`);
let correct = 0;
for (const [worseName, betterName, build] of CASES) {
  const [a, b] = build();
  const sa = survivability(a), sb = survivability(b);
  const ok = sb.score > sa.score;
  if (ok) correct++;
  console.log(`  ${worseName.padEnd(32)} ${betterName.padEnd(32)} ${sa.score.toFixed(3).padStart(7)} ${sb.score.toFixed(3).padStart(7)}  ${ok ? 'correct' : 'WRONG'}`);
}
console.log(`\n  ${correct}/${CASES.length} orderings correct`);
