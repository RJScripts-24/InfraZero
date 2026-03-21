import { CustomEdge, CustomNode } from '../types/graph';
import { generateStableHash } from './stableHash';

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const compareNumbers = (left: number, right: number): number => left - right;

const compareNodes = (left: CustomNode, right: CustomNode): number => {
  return compareNumbers(toFiniteNumber(left.position?.y), toFiniteNumber(right.position?.y))
    || compareNumbers(toFiniteNumber(left.position?.x), toFiniteNumber(right.position?.x))
    || compareStrings(String(left.data?.label || ''), String(right.data?.label || ''))
    || compareStrings(String(left.data?.type || ''), String(right.data?.type || ''))
    || compareNumbers(toFiniteNumber(left.data?.processingPowerMs), toFiniteNumber(right.data?.processingPowerMs))
    || compareNumbers(toFiniteNumber(left.data?.coldStartLatencyMs), toFiniteNumber(right.data?.coldStartLatencyMs))
    || compareNumbers(toFiniteNumber(left.data?.failureRatePercent), toFiniteNumber(right.data?.failureRatePercent))
    || compareNumbers(toFiniteNumber(left.data?.recoveryTimeMs), toFiniteNumber(right.data?.recoveryTimeMs))
    || compareStrings(left.id, right.id);
};

const buildNodeRankMap = (nodes: CustomNode[]): Map<string, number> => {
  const orderedNodes = [...nodes].sort(compareNodes);
  return new Map(orderedNodes.map((node, index) => [node.id, index]));
};

const compareEdges = (nodeRankById: Map<string, number>) => (left: CustomEdge, right: CustomEdge): number => {
  return compareNumbers(nodeRankById.get(left.source) ?? Number.MAX_SAFE_INTEGER, nodeRankById.get(right.source) ?? Number.MAX_SAFE_INTEGER)
    || compareNumbers(nodeRankById.get(left.target) ?? Number.MAX_SAFE_INTEGER, nodeRankById.get(right.target) ?? Number.MAX_SAFE_INTEGER)
    || compareNumbers(toFiniteNumber(left.latencyMs), toFiniteNumber(right.latencyMs))
    || compareNumbers(toFiniteNumber(left.jitterMs), toFiniteNumber(right.jitterMs))
    || compareNumbers(toFiniteNumber(left.packetLossPercent), toFiniteNumber(right.packetLossPercent))
    || compareNumbers(toFiniteNumber(left.bandwidthLimitMbps), toFiniteNumber(right.bandwidthLimitMbps))
    || compareStrings(left.sourceHandle || '', right.sourceHandle || '')
    || compareStrings(left.targetHandle || '', right.targetHandle || '')
    || compareStrings(left.id, right.id);
};

export const orderNodesDeterministically = (nodes: CustomNode[]): CustomNode[] => {
  return [...nodes].sort(compareNodes);
};

export const orderEdgesDeterministically = (nodes: CustomNode[], edges: CustomEdge[]): CustomEdge[] => {
  const nodeRankById = buildNodeRankMap(nodes);
  return [...edges].sort(compareEdges(nodeRankById));
};

export const buildDeterministicTopologyHash = (
  projectId: string,
  nodes: CustomNode[],
  edges: CustomEdge[],
): string => {
  const orderedNodes = orderNodesDeterministically(nodes);
  const orderedEdges = orderEdgesDeterministically(orderedNodes, edges);
  const canonicalNodeIds = new Map(orderedNodes.map((node, index) => [node.id, `n${index + 1}`]));

  const fingerprint = {
    projectId,
    nodes: orderedNodes.map((node) => ({
      id: canonicalNodeIds.get(node.id),
      label: node.data?.label || '',
      type: node.data?.type || '',
      x: toFiniteNumber(node.position?.x),
      y: toFiniteNumber(node.position?.y),
      processingPowerMs: toFiniteNumber(node.data?.processingPowerMs),
      coldStartLatencyMs: toFiniteNumber(node.data?.coldStartLatencyMs),
      failureRatePercent: toFiniteNumber(node.data?.failureRatePercent),
      recoveryTimeMs: toFiniteNumber(node.data?.recoveryTimeMs),
    })),
    edges: orderedEdges.map((edge, index) => ({
      id: `e${index + 1}`,
      source: canonicalNodeIds.get(edge.source) || edge.source,
      target: canonicalNodeIds.get(edge.target) || edge.target,
      latencyMs: toFiniteNumber(edge.latencyMs),
      jitterMs: toFiniteNumber(edge.jitterMs),
      packetLossPercent: toFiniteNumber(edge.packetLossPercent),
      bandwidthLimitMbps: toFiniteNumber(edge.bandwidthLimitMbps),
    })),
  };

  return generateStableHash(fingerprint);
};
