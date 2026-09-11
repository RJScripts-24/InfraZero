// backend/src/services/architectureChecks.service.ts
//
// Deterministic checks against an architecture.
//
// Why these are separate from the model's recommendations
// -------------------------------------------------------
// These are rules. They assert that a pattern is worth attention; they do not
// predict anything, and they carry no measured risk delta. Mixing them into the
// model's output would let a checklist borrow credibility it has not earned --
// and would equally hide the model's real counterfactual results among boilerplate.
//
// Why they exist at all
// ---------------------
// Because the grader is honestly narrow. It reads call-graph shape, and the
// things that most often take a young system down are not shape: no backups,
// one region, no rate limit at the edge, no way to see what is happening when it
// breaks. Leaving those unmentioned because they are unglamorous would mean the
// report is silent on the largest risks in the room.
//
// Every check is written to be falsifiable from the graph alone. Where the graph
// genuinely cannot answer a question, the check says so rather than guessing --
// an "unknown" reported as a pass is worse than no check.

import { CustomEdge, CustomNode } from '../types/graph';
import { ReportCheck } from '../types/report';

const typeOf = (node: CustomNode): string => String(node.data?.type ?? '').toLowerCase();
const labelOf = (node: CustomNode): string => String(node.data?.label ?? node.id);
const replicasOf = (node: CustomNode): number => Math.max(1, Math.round(node.data?.replicas ?? 1));

const isDatastore = (node: CustomNode): boolean =>
  ['postgresql', 'database', 'mysql', 'mongo'].some((t) => typeOf(node).includes(t));
const isCache = (node: CustomNode): boolean => typeOf(node).includes('cache');
const isQueue = (node: CustomNode): boolean =>
  typeOf(node).includes('rabbit') || typeOf(node).includes('queue');
const isEdgeTier = (node: CustomNode): boolean =>
  ['infrastructure', 'gateway', 'edge network'].some((t) => typeOf(node).includes(t));

const OBSERVABILITY_HINTS = [
  'prometheus', 'grafana', 'jaeger', 'zipkin', 'kibana', 'logstash', 'fluentd',
  'loki', 'datadog', 'elk', 'monitor', 'metric', 'logging', 'trace', 'observab',
  'sentry', 'newrelic', 'opentelemetry', 'otel',
];

const BACKUP_HINTS = ['backup', 'snapshot', 'replica', 'standby', 'failover', 'dr-', 'archive'];

export const runArchitectureChecks = (
  nodes: CustomNode[],
  edges: CustomEdge[],
): ReportCheck[] => {
  const checks: ReportCheck[] = [];
  const add = (check: Omit<ReportCheck, 'id'>): void => {
    checks.push({ ...check, id: `check-${checks.length + 1}` });
  };

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
  }

  const allText = nodes.map((n) => `${labelOf(n)} ${typeOf(n)}`).join(' ').toLowerCase();
  const datastores = nodes.filter(isDatastore);
  const entryPoints = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);

  // ---- availability: is anything running as a lone instance on the hot path? --
  const lonelyCritical = nodes.filter(
    (node) => replicasOf(node) === 1 && (inDegree.get(node.id) ?? 0) >= 2 && !isDatastore(node),
  );
  if (lonelyCritical.length > 0) {
    add({
      status: 'fail',
      category: 'availability',
      title: `${lonelyCritical.length} component${lonelyCritical.length > 1 ? 's run' : ' runs'} a single instance with several dependants`,
      detail:
        `${lonelyCritical.map(labelOf).join(', ')} — each is depended on by two or more components ` +
        `and is declared as one instance, so losing it removes the capability rather than reducing ` +
        `capacity. If these are really replicated tiers, set the instance count on the component so ` +
        `the analysis stops treating them as singletons.`,
      targetNodeIds: lonelyCritical.map((n) => n.id),
    });
  } else if (nodes.every((node) => (node.data?.replicas ?? 0) === 0)) {
    add({
      status: 'warn',
      category: 'availability',
      title: 'No instance counts declared',
      detail:
        'No component states how many instances it runs, so every one is analysed as a single ' +
        'instance. That is the conservative reading, but it means the redundancy findings above ' +
        'are probably pessimistic. Importing from a repository fills these in from spec.replicas.',
      targetNodeIds: [],
    });
  } else {
    add({
      status: 'pass',
      category: 'availability',
      title: 'No single-instance component carries multiple dependants',
      detail: 'Every component with two or more dependants is declared as more than one instance.',
      targetNodeIds: [],
    });
  }

  // ---- data: can a datastore be restored? ------------------------------------
  if (datastores.length === 0) {
    add({
      status: 'warn',
      category: 'data',
      title: 'No datastore in the architecture',
      detail:
        'No component is typed as a database, so there is nothing here to check for durability. ' +
        'If the system does hold state, add the datastore to the diagram — a store that is not ' +
        'drawn is a store nobody is reasoning about.',
      targetNodeIds: [],
    });
  } else {
    const hasBackupSignal = BACKUP_HINTS.some((hint) => allText.includes(hint));
    const singleInstanceStores = datastores.filter((node) => replicasOf(node) === 1);
    if (!hasBackupSignal && singleInstanceStores.length > 0) {
      add({
        status: 'fail',
        category: 'data',
        title: 'No replica, standby or backup shown for stateful storage',
        detail:
          `${singleInstanceStores.map(labelOf).join(', ')} hold state and the architecture shows no ` +
          `replica, standby or backup path. Stateless components can be restarted; data cannot. This ` +
          `is the failure that ends companies rather than causing an incident.`,
        targetNodeIds: singleInstanceStores.map((n) => n.id),
      });
    } else {
      add({
        status: 'pass',
        category: 'data',
        title: 'Stateful storage shows redundancy or a recovery path',
        detail: 'Each datastore is either replicated or has a backup/standby component alongside it.',
        targetNodeIds: [],
      });
    }
  }

  // ---- traffic: is there anything between the internet and the services? -----
  const guardedEntry = entryPoints.filter((node) => isEdgeTier(node));
  if (entryPoints.length > 0 && guardedEntry.length === 0) {
    add({
      status: 'fail',
      category: 'traffic',
      title: 'Traffic reaches services with no gateway or load balancer in front',
      detail:
        `${entryPoints.map(labelOf).join(', ')} receive traffic directly. Without a gateway or load ` +
        `balancer there is nowhere to put rate limiting, TLS termination, authentication or request ` +
        `shedding — so the first traffic spike or abusive client reaches application code unfiltered.`,
      targetNodeIds: entryPoints.map((n) => n.id),
    });
  } else if (entryPoints.length > 0) {
    add({
      status: 'pass',
      category: 'traffic',
      title: 'Traffic enters through a gateway or load balancer',
      detail: 'There is a place to enforce rate limiting, authentication and shedding before application code.',
      targetNodeIds: [],
    });
  }

  // ---- traffic: unbounded retry paths ----------------------------------------
  const cyclicEdges = findCycleEdges(nodes, edges);
  if (cyclicEdges.length > 0) {
    add({
      status: 'warn',
      category: 'traffic',
      title: 'Dependency cycle present',
      detail:
        `${cyclicEdges.length} link${cyclicEdges.length > 1 ? 's close' : ' closes'} a loop in the call ` +
        `graph. Under load a loop lets retries feed themselves, which is the structure a retry storm ` +
        `needs. If the loop is real, it needs a retry budget and a circuit breaker; if it is not, the ` +
        `arrow is probably a response and should not be drawn as a dependency.`,
      targetNodeIds: [],
    });
  }

  // ---- operations: can anyone see what is happening? -------------------------
  const hasObservability = OBSERVABILITY_HINTS.some((hint) => allText.includes(hint));
  add({
    status: hasObservability ? 'pass' : 'warn',
    category: 'operations',
    title: hasObservability
      ? 'Monitoring or tracing is present'
      : 'No monitoring, logging or tracing component',
    detail: hasObservability
      ? 'The architecture includes a component for metrics, logs or traces.'
      : 'Nothing in the architecture collects metrics, logs or traces. Every recommendation in this ' +
        'report is about surviving failure; none of it helps if the first sign of trouble is a ' +
        'customer email. This is usually the cheapest thing on the list to add.',
    targetNodeIds: [],
  });

  // ---- operations: async work with no buffer ---------------------------------
  const backgroundJobs = nodes.filter((n) => typeOf(n).includes('background job'));
  const queues = nodes.filter(isQueue);
  if (backgroundJobs.length > 0 && queues.length === 0) {
    add({
      status: 'warn',
      category: 'operations',
      title: 'Background work with no queue in front of it',
      detail:
        `${backgroundJobs.map(labelOf).join(', ')} do background work, but there is no queue or broker ` +
        `in the architecture. Without a buffer, work submitted while a worker is down is lost rather ` +
        `than parked, and a burst applies back-pressure straight to whatever submitted it.`,
      targetNodeIds: backgroundJobs.map((n) => n.id),
    });
  }

  // ---- cost: concentration on the most expensive tier ------------------------
  const totalInstances = nodes.reduce((sum, node) => sum + replicasOf(node), 0);
  const storeInstances = datastores.reduce((sum, node) => sum + replicasOf(node), 0);
  if (totalInstances > 0 && datastores.length > 0 && storeInstances / totalInstances > 0.4) {
    add({
      status: 'warn',
      category: 'cost',
      title: 'Most declared instances are database instances',
      detail:
        `${storeInstances} of ${totalInstances} declared instances are datastores. Database instances ` +
        `are usually the most expensive line on a cloud bill and the hardest to scale down again. ` +
        `Worth checking that read replicas and caching are carrying the read load before adding more.`,
      targetNodeIds: datastores.map((n) => n.id),
    });
  }

  // Fails first, then warnings, then the passes -- a reader should meet the
  // problems before the reassurance.
  const rank = { fail: 0, warn: 1, pass: 2 } as const;
  return checks.sort((a, b) => rank[a.status] - rank[b.status]);
};

/** Edges whose target can already reach their source, i.e. edges that close a loop. */
const findCycleEdges = (nodes: CustomNode[], edges: CustomEdge[]): CustomEdge[] => {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  const reaches = (start: string, goal: string, banned: CustomEdge): boolean => {
    const stack = [start];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === goal) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of adjacency.get(current) ?? []) {
        if (current === banned.source && next === banned.target) continue;
        stack.push(next);
      }
    }
    return false;
  };

  return edges.filter((edge) => reaches(edge.target, edge.source, edge));
};
