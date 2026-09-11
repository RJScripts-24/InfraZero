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

/**
 * Per-node structural judgement from the GNN's own feature encoding.
 *
 * `isSinglePointOfFailure` is the articulation-point flag and `blastRadius` the
 * share of the graph downstream of this node - together they answer "if this one
 * dies, how much goes with it", which is what turns a risk score into an
 * actionable recommendation.
 */
export interface ModelNodeRole {
  id: string;
  label: string;
  role: string;
  isSinglePointOfFailure: boolean;
  blastRadius: number;
}

/**
 * A change the model itself scored, rather than one a rule asserted.
 *
 * The inference server applies each candidate edit to a real copy of the graph,
 * re-encodes it and re-scores it with the GNN. `improvement` is the drop in the
 * model's own expected risk that follows - so this is a measured counterfactual
 * attached to specific nodes, not a rule's opinion of how bad a pattern is.
 *
 * A change the model does not believe in scores near zero and never reaches us.
 */
export interface ModelRecommendation {
  /** Intervention family, e.g. 'add_cache' | 'partition_database' | 'break_cycle'. */
  kind: string;
  summary: string;
  detail: string;
  targetNodes: string[];
  riskBefore: number;
  riskAfter: number;
  /** riskBefore - riskAfter, on the ordered low<medium<high scale. */
  improvement: number;
  gradeBefore: string;
  gradeAfter: string;
  severity: 'high' | 'medium' | 'low';

  /**
   * Predicted change in tail latency, as a percentage. Negative is faster.
   *
   * This comes from the intervention-effect model, which is fitted on matched
   * pairs of real production architectures differing by one component -- so it
   * is a prediction about a measured quantity, unlike `improvement`, which is
   * only ever the grader re-scoring its own output.
   *
   * Null when the inference server predates the delta model.
   */
  predictedDeltaPercent: number | null;

  /** Model confidence in the DIRECTION of the effect, 0-1. Null if unavailable. */
  signConfidence: number | null;

  /**
   * How many measured matched pairs stand behind this class of intervention.
   *
   * Shown to the user because it is the difference between "grounded in 27,378
   * measured cache additions" and a number with nothing behind it.
   */
  groundedInPairs: number | null;
}

/**
 * Output of the GNN architecture grader, trained on Alibaba production
 * microservice traces. Absent when the inference server is unreachable and the
 * rule-based classifier is standing in.
 */
export interface ArchitectureGrade {
  /** Ordered risk class: 'low' | 'medium' | 'high'. */
  riskClass: string;
  /** Report-card letter for display: A | C | F. */
  letter: string;
  /** Model confidence in the predicted class, 0-1. */
  confidence: number;
  /** Full distribution over the three risk classes. */
  classProbabilities: Record<string, number>;
  /** Wall-clock inference time reported by the model server, in ms. */
  inferenceTimeMs: number | null;
  /** Per-node structural judgement. Empty when the server predates this field. */
  nodeRoles: ModelNodeRole[];
  /** Counterfactually scored fixes, best first. Empty on an older server. */
  recommendations: ModelRecommendation[];
  /**
   * How much of this graph the grading head has calibrated experience of.
   *
   * The encoder learns load balancers, batch tiers and async workers during
   * self-supervised pretraining on deployment manifests, but the grading head
   * is fitted on Alibaba call traces, which cannot express any of them. A
   * diagram made largely of those roles is being graded partly outside the
   * head's trained range -- which is common for exactly the uploaded
   * architecture diagrams this product targets -- so its grade should be
   * presented as a weak signal rather than a verdict.
   *
   * Null when the inference server predates this field.
   */
  trainingCoverage: TrainingCoverage | null;
}

export interface TrainingCoverage {
  /** Share of nodes whose role appears in the supervised training set, 0-1. */
  fraction: number;
  untrainedNodeCount: number;
  untrainedRoles: string[];
}

export interface GhostTraceResult {
  graphHash: string;
  topologyEmbedding: number[];
  edgeRisks: EdgeRiskScore[];
  nodeRisks: NodeRiskScore[];
  overallRisk: number;
  predictedAnomalyClass: string;
  architectureGrade: ArchitectureGrade | null;
  syntheticSpans: SyntheticSpan[];
  analysisNarrative: string;
}

export interface GhostTraceRequest {
  nodes: CustomNode[];
  edges: CustomEdge[];
  trafficPattern?: 'steady' | 'burst' | 'thundering_herd';
}
