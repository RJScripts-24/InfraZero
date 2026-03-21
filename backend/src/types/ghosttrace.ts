import { CustomEdge, CustomNode } from './graph';

export interface GraphFeatures {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  maxFanOut: number;
  criticalPathLength: number;
  hasCycles: boolean;
  avgProcessingPowerMs: number;
  avgFailureRate: number;
  avgEdgeLatencyMs: number;
  avgBandwidthMbps: number;
  bottleneckScore: number;
}

export interface EdgeRiskScore {
  edgeId: string;
  source: string;
  target: string;
  riskScore: number;
  reasons: string[];
}

export interface NodeRiskScore {
  nodeId: string;
  label: string;
  riskScore: number;
  reasons: string[];
}

export interface SyntheticSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  serviceName: string;
  operationName: string;
  startTimeMs: number;
  durationMs: number;
  status: 'ok' | 'error' | 'timeout';
  tags: Record<string, string>;
}

export interface GhostTraceResult {
  graphHash: string;
  topologyEmbedding: number[];
  edgeRisks: EdgeRiskScore[];
  nodeRisks: NodeRiskScore[];
  overallRisk: number;
  predictedAnomalyClass: string;
  syntheticSpans: SyntheticSpan[];
  analysisNarrative: string;
}

export interface GhostTraceRequest {
  nodes: CustomNode[];
  edges: CustomEdge[];
  trafficPattern?: 'steady' | 'burst' | 'thundering_herd';
}
