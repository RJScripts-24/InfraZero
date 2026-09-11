// backend/src/types/report.ts
import { CustomEdge, CustomNode } from './graph';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * One actionable change, bound to the components it applies to.
 *
 * `targetNodeIds` / `targetEdgeIds` are what let the report draw the change onto
 * the architecture diagram instead of only describing it in prose - the user
 * asked to see *where* to change, not just *what*.
 */
export interface ReportRecommendation {
  id: string;
  priority: RecommendationPriority;
  title: string;
  detail: string;
  /** Which analysis produced this: the trained model, the rule engine, or the simulation. */
  origin: 'model' | 'rules' | 'simulation';
  targetNodeIds: string[];
  targetEdgeIds: string[];
  /** Short imperative used as the diagram annotation, e.g. "Add read replica". */
  action: string;
  /**
   * Which intervention family this is, when the model produced it.
   *
   * The canvas needs it to apply the change: "Split shared store" is a label,
   * `partition_database` is an instruction. Absent for rule- and
   * simulation-derived recommendations, which describe a problem rather than a
   * mechanical edit.
   */
  kind?: string;
}

/**
 * One deterministic check against the architecture.
 *
 * Kept as a separate list from `recommendations`, and rendered separately, for
 * one reason: these are RULES. They do not come from the model, they carry no
 * predicted risk delta, and letting them borrow the model's credibility would
 * misrepresent both.
 *
 * They exist because the things that most often take a young system down are
 * not topology problems at all -- no backups, one region, no rate limit, no way
 * to see what is happening. A grader trained on call-graph shape is blind to
 * every one of those, and staying silent about them because they are unglamorous
 * would leave the biggest risks unmentioned.
 */
export interface ReportCheck {
  id: string;
  /** 'pass' when satisfied, 'warn' when it should be looked at, 'fail' when it matters now. */
  status: 'pass' | 'warn' | 'fail';
  title: string;
  detail: string;
  /** Components the check applies to; empty when it is about the whole system. */
  targetNodeIds: string[];
  category: 'availability' | 'data' | 'traffic' | 'operations' | 'cost';
}

export interface ReportNodeFinding {
  nodeId: string;
  label: string;
  type: string;
  riskScore: number;
  reasons: string[];
  /** Role the model assigned (service, database, cache...). Null when model unavailable. */
  role: string | null;
  isSinglePointOfFailure: boolean;
  /** Share of the graph that fails with this node, 0-1. */
  blastRadius: number;
}

export interface ReportEdgeFinding {
  edgeId: string;
  source: string;
  target: string;
  sourceLabel: string;
  targetLabel: string;
  riskScore: number;
  reasons: string[];
}

/**
 * The model-derived half of the report.
 *
 * `source` states plainly which engine produced the verdict so the UI never
 * implies a trained-model result when the inference server was actually down.
 */
export interface ReportIntelligence {
  source: 'model+rules' | 'rules-only';
  model: {
    available: boolean;
    riskClass: string;
    letter: string;
    confidence: number;
    classProbabilities: Record<string, number>;
    inferenceTimeMs: number | null;
    /**
     * Set when a material share of the graph uses component roles the grading
     * head has no labelled examples of, so the grade should be read as a weak
     * signal. Null when the graph is well inside the model's trained range.
     *
     * This exists because it is the normal case for the diagrams this product
     * targets: a real architecture diagram is full of load balancers, CDN edges
     * and batch tiers, and an Alibaba call trace cannot express any of them.
     * Presenting a hedge as a verdict would be the dishonest option.
     */
    coverageCaveat: string | null;
  } | null;
  overallRisk: number;
  predictedFailureMode: string;
  narrative: string;
  nodeFindings: ReportNodeFinding[];
  edgeFindings: ReportEdgeFinding[];
}

export interface ReportMetrics {
  totalRequests: number;
  failedRequests: number;
  successRate: number;
  peakLatency: number;
  errorRatePercent: number;
}

export interface UnifiedReport {
  schemaVersion: 1;
  simulationId: string | null;
  projectId: string | null;
  projectName: string;
  createdAt: string;

  universeSeed: string;
  stableHash: string;

  /**
   * The one letter grade in the product, and it comes from the trained model.
   *
   * There used to be two. The simulation engine graded a topology from its own
   * saturation heuristics and the model graded it from learned fragility, and
   * both letters were shown -- in the same terminal, and again in the same
   * report. They disagree often: on `GoogleCloudPlatform/microservices-demo`
   * the engine said C while the model said F at 89% confidence. A reader
   * cannot act on two contradictory letters, so the model's is the grade and
   * the engine now reports what it actually measures, below.
   *
   * `null` means no letter is being claimed. That is a real state, not an
   * error: the report shows its ranked changes and withholds the letter when
   * the graph sits outside the model's trained coverage, when the model is
   * barely above chance, or when the inference server is unreachable.
   */
  grade: string | null;
  /** Where the letter came from, or why there is not one. */
  gradeSource: 'model' | 'withheld' | 'unavailable';
  /** Reader-facing explanation of a withheld grade. Null when a letter is shown. */
  gradeWithheldReason: string | null;
  /** Model confidence behind `grade`, 0-1. Null when there is no model verdict. */
  gradeConfidence: number | null;
  gradeRationale: string[];
  /**
   * The simulation's own 0-100 resilience score at the load the run used.
   *
   * Deliberately not a letter and deliberately not called a grade. It measures
   * something narrower than the grade does: whether this topology kept up with
   * the offered traffic. Presenting it as a second letter is what created the
   * contradiction described above.
   */
  simulatedResilienceScore: number;
  status: string;

  metrics: ReportMetrics;
  latencyData: Array<{ time: number; latency: number }>;
  collapseTime: string;
  rootCause: {
    summary: string;
    primaryCause: string;
    contributingFactors: string[];
  };

  intelligence: ReportIntelligence;
  recommendations: ReportRecommendation[];

  /**
   * Deterministic checks, kept apart from the model's recommendations on
   * purpose. See `ReportCheck`.
   */
  checks: ReportCheck[];

  /** The exact topology this report describes, for the in-report block diagram. */
  graph: { nodes: CustomNode[]; edges: CustomEdge[] };

  /** Free-text LLM review of the run. Empty when Groq is unavailable. */
  narrativeReview: string;
}
