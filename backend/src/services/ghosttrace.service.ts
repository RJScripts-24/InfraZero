import { createHash } from 'crypto';
import { CustomEdge, CustomNode } from '../types/graph';
import {
  EdgeRiskScore,
  GhostTraceRequest,
  GhostTraceResult,
  GraphFeatures,
  NodeRiskScore,
  SyntheticSpan,
} from '../types/ghosttrace';
import { buildDeterministicTopologyHash, orderNodesDeterministically } from '../utils/deterministicTopology';
import { logger } from '../utils/logger';
import { createCompletionWithFallback } from './groq.service';

const DEFAULT_PROCESSING_POWER_MS = 100;
const DEFAULT_FAILURE_RATE = 5;
const DEFAULT_EDGE_LATENCY_MS = 50;
const DEFAULT_BANDWIDTH_MBPS = 100;

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const buildAdjacency = (nodes: CustomNode[], edges: CustomEdge[]): Map<string, string[]> => {
  const adjacency = new Map<string, string[]>();
  const orderedNodes = orderNodesDeterministically(nodes);
  const rankById = new Map(orderedNodes.map((node, index) => [node.id, index]));

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const next = adjacency.get(edge.source) ?? [];
    next.push(edge.target);
    adjacency.set(edge.source, next);
  }

  for (const [nodeId, targets] of adjacency.entries()) {
    const sortedTargets = [...targets].sort(
      (left, right) => (rankById.get(left) ?? Number.MAX_SAFE_INTEGER) - (rankById.get(right) ?? Number.MAX_SAFE_INTEGER),
    );
    adjacency.set(nodeId, sortedTargets);
  }

  return adjacency;
};

const countByNode = (
  nodes: CustomNode[],
  edges: CustomEdge[],
): {
  fanInByNode: Map<string, number>;
  fanOutByNode: Map<string, number>;
} => {
  const fanInByNode = new Map<string, number>();
  const fanOutByNode = new Map<string, number>();

  for (const node of nodes) {
    fanInByNode.set(node.id, 0);
    fanOutByNode.set(node.id, 0);
  }

  for (const edge of edges) {
    fanOutByNode.set(edge.source, (fanOutByNode.get(edge.source) ?? 0) + 1);
    fanInByNode.set(edge.target, (fanInByNode.get(edge.target) ?? 0) + 1);
  }

  return { fanInByNode, fanOutByNode };
};

const detectCycles = (nodes: CustomNode[], edges: CustomEdge[]): boolean => {
  const adjacency = buildAdjacency(nodes, edges);
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const visit = (nodeId: string): boolean => {
    if (recursionStack.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);

    for (const nextId of adjacency.get(nodeId) ?? []) {
      if (visit(nextId)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  for (const node of nodes) {
    if (visit(node.id)) {
      return true;
    }
  }

  return false;
};

const getCriticalPathLength = (nodes: CustomNode[], edges: CustomEdge[]): number => {
  const adjacency = buildAdjacency(nodes, edges);
  const memo = new Map<string, number>();

  const dfs = (nodeId: string, activePath: Set<string>): number => {
    if (activePath.has(nodeId)) {
      return 0;
    }

    const cached = memo.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }

    activePath.add(nodeId);
    let longest = 0;

    for (const nextId of adjacency.get(nodeId) ?? []) {
      longest = Math.max(longest, 1 + dfs(nextId, activePath));
    }

    activePath.delete(nodeId);
    memo.set(nodeId, longest);
    return longest;
  };

  return nodes.reduce((maxLength, node) => Math.max(maxLength, dfs(node.id, new Set<string>())), 0);
};

const getGraphHash = (nodes: CustomNode[], edges: CustomEdge[]): string => {
  return buildDeterministicTopologyHash('ghosttrace', nodes, edges);
};

const getOperationName = (nodeType: string): string => {
  switch (nodeType) {
    case 'PostgreSQL':
      return 'db.query';
    case 'Gateway':
      return 'http.request';
    case 'Infrastructure':
      return 'load.balance';
    case 'Cache':
      return 'cache.get';
    case 'RabbitMQ':
      return 'queue.publish';
    case 'Background Job':
      return 'job.process';
    case 'Edge Network':
      return 'cdn.fetch';
    case 'Service':
      return 'service.handle';
    default:
      return 'service.execute';
  }
};

const buildTracePaths = (nodes: CustomNode[], edges: CustomEdge[]): string[][] => {
  const adjacency = buildAdjacency(nodes, edges);
  const { fanInByNode } = countByNode(nodes, edges);
  const orderedNodes = orderNodesDeterministically(nodes);
  const entryNodes = orderedNodes.filter((node) => (fanInByNode.get(node.id) ?? 0) === 0);
  const queue: string[][] = (entryNodes.length > 0 ? entryNodes : nodes.slice(0, 1)).map((node) => [node.id]);
  const completedPaths: string[][] = [];

  while (queue.length > 0 && completedPaths.length < 3) {
    const path = queue.shift();
    if (!path) {
      continue;
    }

    const currentNodeId = path[path.length - 1];
    const nextNodeIds = (adjacency.get(currentNodeId) ?? []).filter((nextId) => !path.includes(nextId));

    if (nextNodeIds.length === 0 || path.length >= nodes.length) {
      completedPaths.push(path);
      continue;
    }

    for (const nextId of nextNodeIds) {
      queue.push([...path, nextId]);
    }
  }

  return completedPaths.slice(0, 3);
};

const createSeededRandom = (seedSource: string): (() => number) => {
  let state = parseInt(createHash('sha256').update(seedSource).digest('hex').slice(0, 8), 16) >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const deterministicHex = (seedSource: string, length: number): string => {
  let output = '';
  let index = 0;

  while (output.length < length) {
    output += createHash('sha256').update(`${seedSource}:${index}`).digest('hex');
    index += 1;
  }

  return output.slice(0, length);
};

const buildDeterministicNarrative = (
  predictedAnomalyClass: string,
  topEdgeRisks: EdgeRiskScore[],
  topNodeRisks: NodeRiskScore[],
): string => {
  const topEdge = topEdgeRisks[0];
  const topNode = topNodeRisks[0];
  const highestRiskComponent = topNode?.label || topEdge?.target || 'the topology core';

  const architecturalFix = (() => {
    switch (predictedAnomalyClass) {
      case 'Thundering Herd':
        return 'Add request coalescing and queue-based backpressure on the hottest ingress path.';
      case 'Retry Storm':
        return 'Add retry budgets, capped exponential backoff, and circuit breaking around the failing dependency.';
      case 'Cascading Failure':
        return 'Split the hotspot behind a parallel tier and add capacity isolation for downstream dependencies.';
      case 'Latency Chain Degradation':
        return 'Collapse the longest synchronous chain with caching or asynchronous handoff at the slowest boundary.';
      default:
        return 'Maintain redundancy and monitor the current hot path for rising contention.';
    }
  })();

  if (!topEdge && !topNode) {
    return `${predictedAnomalyClass}. No dominant hotspot is currently ranked above baseline risk. ${architecturalFix}`;
  }

  return `${predictedAnomalyClass} is the most likely failure mode for this topology. ${highestRiskComponent} is currently the most exposed component, with the hottest dependency path centered on ${topEdge?.source ?? 'an upstream service'} -> ${topEdge?.target ?? highestRiskComponent}. ${architecturalFix}`;
};

export const extractGraphFeatures = (nodes: CustomNode[], edges: CustomEdge[]): GraphFeatures => {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const { fanInByNode, fanOutByNode } = countByNode(nodes, edges);

  return {
    nodeCount,
    edgeCount,
    avgDegree: nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0,
    maxFanOut: nodes.reduce((maxFanOut, node) => Math.max(maxFanOut, fanOutByNode.get(node.id) ?? 0), 0),
    criticalPathLength: getCriticalPathLength(nodes, edges),
    hasCycles: detectCycles(nodes, edges),
    avgProcessingPowerMs: average(
      nodes.map((node) => node.data.processingPowerMs ?? DEFAULT_PROCESSING_POWER_MS),
    ),
    avgFailureRate: average(nodes.map((node) => node.data.failureRatePercent ?? DEFAULT_FAILURE_RATE)),
    avgEdgeLatencyMs: average(edges.map((edge) => edge.latencyMs ?? DEFAULT_EDGE_LATENCY_MS)),
    avgBandwidthMbps: average(edges.map((edge) => edge.bandwidthLimitMbps ?? DEFAULT_BANDWIDTH_MBPS)),
    bottleneckScore: nodeCount > 0
      ? nodes.filter((node) => (fanInByNode.get(node.id) ?? 0) > 3).length / nodeCount
      : 0,
  };
};

export const computeEdgeRisks = (
  nodes: CustomNode[],
  edges: CustomEdge[],
  features: GraphFeatures,
): EdgeRiskScore[] => {
  void features;

  const { fanInByNode, fanOutByNode } = countByNode(nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    let riskScore = 0;
    const reasons: string[] = [];

    if ((sourceNode?.data.failureRatePercent ?? DEFAULT_FAILURE_RATE) > 10) {
      riskScore += 0.25;
      reasons.push('High source failure rate');
    }

    if ((edge.latencyMs ?? DEFAULT_EDGE_LATENCY_MS) > 200) {
      riskScore += 0.2;
      reasons.push('High edge latency');
    }

    if ((edge.packetLossPercent ?? 0) > 5) {
      riskScore += 0.2;
      reasons.push('Packet loss risk');
    }

    if (targetNode && (fanInByNode.get(targetNode.id) ?? 0) === 1 && (fanOutByNode.get(targetNode.id) ?? 0) === 0) {
      riskScore += 0.3;
      reasons.push('Single point of failure downstream');
    }

    if (targetNode) {
      const redundantPeers = nodes.filter(
        (node) => node.id !== targetNode.id && node.position.y === targetNode.position.y,
      );
      if (redundantPeers.length === 0) {
        riskScore += 0.15;
        reasons.push('No redundant path');
      }
    }

    return {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      riskScore: clamp(riskScore),
      reasons,
    };
  });
};

export const computeNodeRisks = (
  nodes: CustomNode[],
  edges: CustomEdge[],
  features: GraphFeatures,
): NodeRiskScore[] => {
  void features;

  return nodes
    .map((node) => {
    const incomingEdges = edges.filter((edge) => edge.target === node.id);
    const outgoingEdges = edges.filter((edge) => edge.source === node.id);

    if (incomingEdges.length === 0 && outgoingEdges.length > 0) {
      return null;
    }

    let riskScore = 0;
    const reasons: string[] = [];

    if ((node.data.failureRatePercent ?? DEFAULT_FAILURE_RATE) > 15) {
      riskScore += 0.3;
      reasons.push('Critical failure rate');
    }

    if ((node.data.coldStartLatencyMs ?? 0) > 500) {
      riskScore += 0.2;
      reasons.push('Cold start latency risk');
    }

    if ((node.data.processingPowerMs ?? DEFAULT_PROCESSING_POWER_MS) > 500) {
      riskScore += 0.25;
      reasons.push('Slow processing');
    }

    if (outgoingEdges.length > 4) {
      riskScore += 0.2;
      reasons.push('High fan-out hub');
    }

    if (incomingEdges.length > 3) {
      riskScore += 0.15;
      reasons.push('Traffic concentration point');
    }

      return {
        nodeId: node.id,
        label: node.data.label,
        riskScore: clamp(riskScore),
        reasons,
      };
    })
    .filter((nodeRisk): nodeRisk is NodeRiskScore => nodeRisk !== null);
};

export const buildTopologyEmbedding = (features: GraphFeatures): number[] => {
  return [
    clamp(features.nodeCount / 20),
    clamp(features.edgeCount / 30),
    clamp(features.avgDegree / 10),
    clamp(features.maxFanOut / 8),
    clamp(features.criticalPathLength / 15),
    features.hasCycles ? 1 : 0,
    clamp(features.avgProcessingPowerMs / 1000),
    clamp(features.avgFailureRate / 100),
    clamp(features.avgEdgeLatencyMs / 500),
    clamp(features.avgBandwidthMbps / 1000),
    clamp(features.bottleneckScore),
    0,
  ];
};

export const synthesizeTraces = (
  nodes: CustomNode[],
  edges: CustomEdge[],
  edgeRisks: EdgeRiskScore[],
  trafficPattern: string,
  graphHash: string,
): SyntheticSpan[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeByPair = new Map(edges.map((edge) => [`${edge.source}->${edge.target}`, edge]));
  const edgeRiskById = new Map(edgeRisks.map((edgeRisk) => [edgeRisk.edgeId, edgeRisk]));
  const tracePaths = buildTracePaths(nodes, edges);
  const spans: SyntheticSpan[] = [];
  const trafficPenaltyMs = trafficPattern === 'thundering_herd' ? 40 : trafficPattern === 'burst' ? 15 : 0;

  for (let pathIndex = 0; pathIndex < tracePaths.length; pathIndex += 1) {
    const path = tracePaths[pathIndex];
    const pathSeed = `${graphHash}:path:${pathIndex}:${path.join('>')}`;
    const nextRandom = createSeededRandom(pathSeed);
    const traceId = deterministicHex(`${pathSeed}:trace`, 32);
    let parentSpanId: string | null = null;
    let currentTimeMs = 1700000000000 + pathIndex * 1000;

    for (let index = 0; index < path.length; index += 1) {
      const node = nodeById.get(path[index]);
      if (!node) {
        continue;
      }

      const previousNodeId = index > 0 ? path[index - 1] : null;
      const incomingEdge = previousNodeId ? edgeByPair.get(`${previousNodeId}->${node.id}`) : undefined;
      const edgeRisk = incomingEdge ? edgeRiskById.get(incomingEdge.id) : undefined;
      const jitterMs = Math.floor(nextRandom() * 21);
      const durationMs = (node.data.processingPowerMs ?? DEFAULT_PROCESSING_POWER_MS)
        + (incomingEdge?.latencyMs ?? 0)
        + jitterMs
        + trafficPenaltyMs;
      const spanId = deterministicHex(`${pathSeed}:span:${index}`, 16);
      const riskScore = edgeRisk?.riskScore ?? 0;
      const status: SyntheticSpan['status'] = riskScore > 0.6 ? 'error' : riskScore > 0.4 ? 'timeout' : 'ok';

      spans.push({
        spanId,
        traceId,
        parentSpanId,
        serviceName: node.data.label,
        operationName: getOperationName(node.data.type),
        startTimeMs: currentTimeMs,
        durationMs,
        status,
        tags: {
          'service.type': node.data.type,
          'risk.score': String(riskScore),
        },
      });

      currentTimeMs += durationMs;
      parentSpanId = spanId;
    }
  }

  return spans;
};

export const predictAnomalyClass = (
  features: GraphFeatures,
  edgeRisks: EdgeRiskScore[],
  nodeRisks: NodeRiskScore[],
): string => {
  const maxRiskEdge = edgeRisks.reduce<EdgeRiskScore | null>(
    (maxRisk, edgeRisk) => (!maxRisk || edgeRisk.riskScore > maxRisk.riskScore ? edgeRisk : maxRisk),
    null,
  );
  const avgNodeRisk = average(nodeRisks.map((nodeRisk) => nodeRisk.riskScore));

  if ((maxRiskEdge?.riskScore ?? 0) > 0.7 && features.maxFanOut > 3) {
    return 'Thundering Herd';
  }
  if (features.hasCycles && avgNodeRisk > 0.5) {
    return 'Retry Storm';
  }
  if (features.bottleneckScore > 0.4) {
    return 'Cascading Failure';
  }
  if (features.criticalPathLength > 6) {
    return 'Latency Chain Degradation';
  }
  return 'Stable - No Major Anomaly Predicted';
};

const callInferenceServer = async (
  nodes: CustomNode[],
  edges: CustomEdge[],
): Promise<{ predictedClass: string; confidence: number; topologyEmbedding: number[] } | null> => {
  const inferenceUrl = process.env.INFERENCE_SERVER_URL || 'http://localhost:8001';

  try {
    const response = await fetch(`${inferenceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    logger.info(
      `[GhostTrace] ML inference: ${data.predictedClass} (${(data.confidence * 100).toFixed(1)}% confidence, ${data.inferenceTimeMs}ms)`,
    );

    return {
      predictedClass: data.predictedClass,
      confidence: data.confidence,
      topologyEmbedding: data.topologyEmbedding,
    };
  } catch (err) {
    void err;
    // Inference server unavailable - fall back to rule-based silently.
    logger.warn('[GhostTrace] Inference server unavailable, using rule-based classifier');
    return null;
  }
};

export const runGhostTrace = async (request: GhostTraceRequest): Promise<GhostTraceResult> => {
  const { nodes, edges, trafficPattern = 'steady' } = request;
  const features = extractGraphFeatures(nodes, edges);
  const mlPrediction = await callInferenceServer(request.nodes, request.edges);
  const edgeRisks = computeEdgeRisks(nodes, edges, features).sort((a, b) => b.riskScore - a.riskScore);
  const nodeRisks = computeNodeRisks(nodes, edges, features).sort((a, b) => b.riskScore - a.riskScore);
  const topologyEmbedding = mlPrediction?.topologyEmbedding ?? buildTopologyEmbedding(features);
  const graphHash = getGraphHash(nodes, edges);
  const syntheticSpans = synthesizeTraces(nodes, edges, edgeRisks, trafficPattern, graphHash);
  const rulePrediction = predictAnomalyClass(features, edgeRisks, nodeRisks);
  const isRuleStable = rulePrediction.toLowerCase().startsWith('stable');
  const predictedAnomalyClass =
    mlPrediction === null
      ? rulePrediction
      : mlPrediction.predictedClass === 'stable' && mlPrediction.confidence > 0.85
        ? 'stable'
        : isRuleStable
          ? 'Latency Chain Degradation'
          : rulePrediction;
  const overallRisk = clamp(
    Math.max(
      edgeRisks[0]?.riskScore ?? 0,
      nodeRisks[0]?.riskScore ?? 0,
      features.bottleneckScore,
    ),
  );

  const top3EdgeRisks = edgeRisks.slice(0, 3);
  const top3NodeRisks = nodeRisks.slice(0, 3);
  let analysisNarrative = buildDeterministicNarrative(predictedAnomalyClass, top3EdgeRisks, top3NodeRisks);

  const isAnomalous = !predictedAnomalyClass.toLowerCase().startsWith('stable');

  const groqPrompt = isAnomalous
    ? `You are a distributed systems reliability expert analyzing an architecture.
     Predicted failure mode: ${predictedAnomalyClass}
     Overall risk score: ${(overallRisk * 100).toFixed(0)}%
     Top risk edges: ${JSON.stringify(edgeRisks.slice(0,3))}
     Top risk nodes: ${JSON.stringify(nodeRisks.slice(0,3))}
     
     Write exactly 3 sentences:
     1. Name the specific failure mode and which component triggers it
     2. Explain the blast radius - what fails downstream if it triggers
     3. Give one concrete architectural fix (be specific about component names)
     Max 80 words. Be technical and specific.`
    : `You are a distributed systems reliability expert analyzing an architecture.
     This architecture appears stable with an overall risk of ${(overallRisk * 100).toFixed(0)}%.
     Highest risk areas: ${JSON.stringify(edgeRisks.slice(0,3))}
     
     Write exactly 3 sentences:
     1. Confirm the architecture is well-designed and why
     2. Name the single highest-risk component and what could stress it
     3. Give one proactive hardening recommendation
     Max 80 words. Be specific about component names.`;

  try {
    const completion = await createCompletionWithFallback({
      messages: [{ role: 'user', content: groqPrompt }],
      temperature: 0.2,
      max_tokens: 160,
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      analysisNarrative = content.trim();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[GhostTrace] Groq narrative unavailable: ${message}`);
  }

  return {
    graphHash,
    topologyEmbedding,
    edgeRisks,
    nodeRisks,
    overallRisk,
    predictedAnomalyClass,
    syntheticSpans,
    analysisNarrative,
  };
};
