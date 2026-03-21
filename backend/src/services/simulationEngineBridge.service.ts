import path from 'path';
import fs from 'fs';
import { DEFAULT_EDGE_CONFIG, DEFAULT_NODE_CONFIG } from '../config/constants';
import { CustomEdge, CustomNode } from '../types/graph';
import {
  buildDeterministicTopologyHash,
  orderEdgesDeterministically,
  orderNodesDeterministically,
} from '../utils/deterministicTopology';
import { logger } from '../utils/logger';

interface EngineModule {
  run_simulation: (inputJson: string) => string;
  validate_graph: (inputJson: string) => string;
  get_graph_hash: (inputJson: string) => string;
}

interface EngineValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface EngineGrade {
  grade: string;
  score: number;
  rationale: string[];
}

interface EngineRootCause {
  summary: string;
  primaryCause: string;
  contributingFactors: string[];
  recommendations: string[];
}

interface EngineSnapshot {
  tick: number;
  simTimeMs: number;
  nodeMetrics: Array<{
    nodeId?: string;
    node_id?: string;
    errorRate?: number;
    error_rate?: number;
    isOverloaded?: boolean;
    is_overloaded?: boolean;
    queueDepth?: number;
    queue_depth?: number;
    requestsReceived?: number;
    requests_received?: number;
    state?: string;
    p99LatencyMs: number;
  }>;
}

interface EngineRunOutput {
  graphHash: string;
  status: string;
  totalRequests: number;
  totalFailures: number;
  avgP99LatencyMs: number;
  grade: EngineGrade;
  rootCause: EngineRootCause;
  snapshots: EngineSnapshot[];
  crashTick: number | null;
}

export interface EngineRunResult {
  graphHash: string;
  universeSeed: string;
  grade: string;
  gradeScore: number;
  gradeRationale: string[];
  status: string;
  totalRequests: number;
  totalFailures: number;
  peakLatency: number;
  recommendations: string[];
  latencyData: Array<{ time: number; latency: number }>;
  snapshots: Array<{
    tick: number;
    simTimeMs: number;
    nodeMetrics: Array<{
      nodeId: string;
      errorRate: number;
      isOverloaded: boolean;
      queueDepth: number;
      requestsReceived: number;
      state: string;
      p99LatencyMs: number;
    }>;
  }>;
  collapseTime: string;
  rootCause: {
    summary: string;
    primaryCause: string;
    details: Array<{ label: string; value: string }>;
  };
}

const tryLoadEngineModule = (): EngineModule | null => {
  const candidatePaths = [
    path.resolve(__dirname, '../../../simulation-engine/pkg/infrazero_simulation_engine.js'),
    path.resolve(__dirname, '../../../simulation-engine/pkg/simulation_engine.js'),
  ];

  const errors: string[] = [];

  for (const modulePath of candidatePaths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require(modulePath) as any;

      if (typeof loaded?.initSync === 'function') {
        const wasmPath = modulePath.replace(/\.js$/, '_bg.wasm');
        const wasmBytes = fs.readFileSync(wasmPath);
        loaded.initSync({ module: wasmBytes });
      }

      const resolved = (loaded?.run_simulation ? loaded : loaded?.default) as EngineModule | undefined;
      if (
        resolved &&
        typeof resolved.run_simulation === 'function' &&
        typeof resolved.validate_graph === 'function' &&
        typeof resolved.get_graph_hash === 'function'
      ) {
        logger.info(`[Simulation Engine] Loaded module: ${modulePath}`);
        return resolved;
      }
      errors.push(`${modulePath}: missing required exports`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${modulePath}: ${message}`);
    }
  }

  logger.error(`[Simulation Engine] Module load failure. Tried: ${errors.join(' | ')}`);
  return null;
};

const parsePercentToFraction = (value: number | undefined, defaultPercent: number): number => {
  const normalized = value ?? defaultPercent;
  if (normalized <= 0) {
    return 0;
  }
  if (normalized > 1) {
    return Math.min(normalized / 100, 1);
  }
  return Math.min(normalized / 100, 1);
};

const parseProcessingPower = (valueMs: number | undefined): number => {
  const ms = valueMs ?? DEFAULT_NODE_CONFIG.PROCESSING_POWER_MS;
  if (ms <= 0) {
    return 1;
  }
  return Math.max(0.1, Math.min(6, 1000 / ms));
};

const nodeTypeToEngineType = (node: CustomNode): string => {
  const rawType = String(node.data?.type || '').toLowerCase();

  if (rawType.includes('load') || rawType.includes('infrastructure')) {
    return 'load_balancer';
  }
  if (rawType.includes('gateway')) {
    return 'api_gateway';
  }
  if (rawType.includes('postgres') || rawType.includes('database')) {
    return 'database';
  }
  if (rawType.includes('cache')) {
    return 'cache';
  }
  if (rawType.includes('rabbit') || rawType.includes('queue')) {
    return 'queue';
  }
  if (rawType.includes('edge') || rawType.includes('cdn')) {
    return 'edge';
  }
  return 'compute';
};

const normalizeNodes = (nodes: CustomNode[]): Array<Record<string, unknown>> => {
  return orderNodesDeterministically(nodes).map((node) => ({
    id: node.id,
    label: node.data?.label || `node-${node.id}`,
    nodeType: nodeTypeToEngineType(node),
    processingPower: parseProcessingPower(node.data?.processingPowerMs),
    coldStartLatencyMs: Math.max(0, node.data?.coldStartLatencyMs ?? DEFAULT_NODE_CONFIG.COLD_START_LATENCY_MS),
    queueCapacity: 100,
    failureRate: parsePercentToFraction(node.data?.failureRatePercent, DEFAULT_NODE_CONFIG.FAILURE_RATE_PERCENT),
    x: Number(node.position?.x ?? 0),
    y: Number(node.position?.y ?? 0),
    providerIcon: null,
  }));
};

const normalizeEdges = (edges: CustomEdge[]): Array<Record<string, unknown>> => {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    latencyMs: Math.max(0, edge.latencyMs ?? DEFAULT_EDGE_CONFIG.LATENCY_MS),
    jitterMs: Math.max(0, edge.jitterMs ?? DEFAULT_EDGE_CONFIG.JITTER_MS),
    packetLoss: parsePercentToFraction(edge.packetLossPercent, DEFAULT_EDGE_CONFIG.PACKET_LOSS_PERCENT),
    bandwidthLimitMbps: Math.max(1, edge.bandwidthLimitMbps ?? DEFAULT_EDGE_CONFIG.BANDWIDTH_LIMIT_MBPS),
  }));
};

const toReportStatus = (status: string, grade: string): string => {
  if (status === 'crashed' || grade.toUpperCase() === 'F') {
    return 'FAILURE - FAIL';
  }
  return 'STABLE - PASS';
};

const buildLatencyTimeline = (snapshots: EngineSnapshot[]): Array<{ time: number; latency: number }> => {
  if (snapshots.length === 0) {
    return [{ time: 0, latency: 0 }];
  }

  return snapshots.map((snapshot) => {
    const p99Values = snapshot.nodeMetrics.map((node) => node.p99LatencyMs).filter((value) => value > 0);
    const average = p99Values.length > 0 ? p99Values.reduce((sum, value) => sum + value, 0) / p99Values.length : 0;
    return {
      time: Math.round(snapshot.simTimeMs / 1000),
      latency: Math.round(average),
    };
  });
};

const normalizeSnapshots = (snapshots: EngineSnapshot[] | undefined): EngineRunResult['snapshots'] => {
  if (!Array.isArray(snapshots)) {
    return [];
  }

  return snapshots.map((snapshot: any) => {
    const rawNodeMetrics = snapshot?.nodeMetrics || snapshot?.node_metrics || [];

    return {
      tick: Number(snapshot?.tick ?? 0),
      simTimeMs: Number(snapshot?.simTimeMs ?? snapshot?.sim_time_ms ?? 0),
      nodeMetrics: rawNodeMetrics.map((node: any) => ({
        nodeId: String(node?.nodeId ?? node?.node_id ?? ''),
        errorRate: Number(node?.errorRate ?? node?.error_rate ?? 0),
        isOverloaded: Boolean(node?.isOverloaded ?? node?.is_overloaded),
        queueDepth: Number(node?.queueDepth ?? node?.queue_depth ?? 0),
        requestsReceived: Number(node?.requestsReceived ?? node?.requests_received ?? 0),
        state: String(node?.state ?? ''),
        p99LatencyMs: Number(node?.p99LatencyMs ?? node?.p99_latency_ms ?? 0),
      })),
    };
  });
};

const buildRootCauseDetails = (rootCause: EngineRootCause, totalFailures: number, peakLatency: number): Array<{ label: string; value: string }> => {
  const details: Array<{ label: string; value: string }> = [
    { label: 'Primary Cause', value: rootCause.primaryCause },
    { label: 'Failed Requests', value: `${totalFailures}` },
    { label: 'Peak Latency', value: `${peakLatency}ms` },
  ];

  for (const factor of rootCause.contributingFactors.slice(0, 2)) {
    details.push({ label: 'Contributing Factor', value: factor });
  }

  return details;
};

const normalizeChaosKind = (kind: unknown): string => {
  const raw = String(kind || '');
  const directMap: Record<string, string> = {
    KillNode: 'kill_node',
    DegradeNode: 'cpu_spike',
    LatencySpike: 'memory_pressure',
  };
  if (directMap[raw]) {
    return directMap[raw];
  }
  const alreadySnake = raw.toLowerCase();
  return alreadySnake;
};

const normalizeChaosEvents = (events: any[] | undefined): any[] => {
  if (!Array.isArray(events)) {
    return [];
  }

  return events.map((event) => ({
    ...event,
    kind: normalizeChaosKind(event?.kind),
  }));
};

export const runSimulationWithEngine = (
  nodes: CustomNode[],
  edges: CustomEdge[],
  seed: number,
  options?: { chaosEnabled?: boolean; chaosEvents?: any[] },
): EngineRunResult => {
  const engine = tryLoadEngineModule();
  if (!engine) {
    throw new Error('Simulation engine module is unavailable.');
  }

  const orderedNodes = orderNodesDeterministically(nodes);
  const orderedEdges = orderEdgesDeterministically(orderedNodes, edges);
  const normalizedChaosEvents = normalizeChaosEvents(options?.chaosEvents);

  const normalizedInput = {
    nodes: normalizeNodes(orderedNodes),
    edges: normalizeEdges(orderedEdges),
    config: {
      seed,
      total_ticks: 1000,
      traffic_pattern: 'steady',
      baseline_rps: 900,
      peak_rps_multiplier: 3,
      chaos_enabled: options?.chaosEnabled ?? false,
      chaos_events: normalizedChaosEvents,
      chaosEnabled: options?.chaosEnabled ?? false,
      chaosEvents: normalizedChaosEvents,
      full_trace: false,
    },
  };

  const validationRaw = engine.validate_graph(JSON.stringify(normalizedInput));
  const validation = JSON.parse(validationRaw) as EngineValidationResult;

  if (!validation.isValid) {
    throw new Error(validation.errors.join('; '));
  }

  const outputRaw = engine.run_simulation(JSON.stringify(normalizedInput));
  const output = JSON.parse(outputRaw) as EngineRunOutput & { error?: string };
  if (output.error) {
    throw new Error(output.error);
  }

  const latencyData = buildLatencyTimeline(output.snapshots || []);
  const snapshots = normalizeSnapshots(output.snapshots || []);
  const peakLatency = latencyData.reduce((max, point) => Math.max(max, point.latency), 0);

  const graphHash = output.graphHash || engine.get_graph_hash(JSON.stringify(normalizedInput));

  return {
    graphHash,
    universeSeed: String(seed),
    grade: output.grade?.grade || 'F',
    gradeScore: Number(output.grade?.score ?? 0),
    gradeRationale: Array.isArray(output.grade?.rationale) ? output.grade.rationale : [],
    status: toReportStatus(output.status || 'crashed', output.grade?.grade || 'F'),
    totalRequests: output.totalRequests || 0,
    totalFailures: output.totalFailures || 0,
    peakLatency,
    recommendations: output.rootCause?.recommendations || ['Increase horizontal redundancy in critical services.'],
    latencyData,
    snapshots,
    collapseTime: output.crashTick === null || output.crashTick === undefined ? '-' : `${output.crashTick}`,
    rootCause: {
      summary: output.rootCause?.summary || 'Simulation completed with limited diagnostics.',
      primaryCause: output.rootCause?.primaryCause || 'Unknown',
      details: buildRootCauseDetails(
        output.rootCause || {
          summary: 'Simulation completed with limited diagnostics.',
          primaryCause: 'Unknown',
          contributingFactors: [],
          recommendations: [],
        },
        output.totalFailures || 0,
        peakLatency,
      ),
    },
  };
};

export const buildDeterministicSeed = (projectId: string, nodes: CustomNode[], edges: CustomEdge[]): number => {
  return parseInt(buildDeterministicTopologyHash(projectId, nodes, edges).slice(0, 8), 16);
};
