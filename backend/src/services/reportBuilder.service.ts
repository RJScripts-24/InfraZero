// backend/src/services/reportBuilder.service.ts
import { CustomEdge, CustomNode } from '../types/graph';
import { GhostTraceResult } from '../types/ghosttrace';
import {
  ReportEdgeFinding,
  ReportIntelligence,
  ReportNodeFinding,
  ReportRecommendation,
  RecommendationPriority,
  UnifiedReport,
} from '../types/report';
import { EngineRunResult } from './simulationEngineBridge.service';
import { runArchitectureChecks } from './architectureChecks.service';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const nodeLabel = (node: CustomNode | undefined, fallback: string): string =>
  String(node?.data?.label || fallback);

const nodeType = (node: CustomNode | undefined): string => String(node?.data?.type || 'Node Service');

const priorityFromRisk = (risk: number): RecommendationPriority => {
  if (risk >= 0.75) return 'critical';
  if (risk >= 0.5) return 'high';
  if (risk >= 0.25) return 'medium';
  return 'low';
};

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Turns a component's role into the concrete redundancy fix for that kind of
 * component. A database and a stateless service are both "add redundancy", but
 * the actual change is completely different, and a recommendation that does not
 * name the real change is not actionable.
 */
const redundancyFixForRole = (role: string | null, type: string): { action: string; detail: string } => {
  const key = (role || type).toLowerCase();

  if (key.includes('database') || key.includes('postgres') || key.includes('sql')) {
    return {
      action: 'Add read replica + failover',
      detail:
        'Promote this to a primary/replica pair with automatic failover, and route read-only queries to the replica. A single database instance on the critical path means every dependent service fails with it.',
    };
  }
  if (key.includes('cache') || key.includes('redis')) {
    return {
      action: 'Run clustered + guard misses',
      detail:
        'Run this cache in clustered mode and make callers degrade to the origin on a miss rather than erroring. An unclustered cache turns a cache outage into a full outage.',
    };
  }
  if (key.includes('gateway') || key.includes('loadbalancer') || key.includes('infrastructure')) {
    return {
      action: 'Run 2+ instances behind health checks',
      detail:
        'Deploy at least two instances across availability zones with health-checked failover. Every request enters through this component, so it has no tolerance for a single-instance failure.',
    };
  }
  if (key.includes('queue') || key.includes('rabbit') || key.includes('kafka')) {
    return {
      action: 'Mirror the queue + add a DLQ',
      detail:
        'Mirror this broker across nodes and attach a dead-letter queue. Without it, a broker failure silently drops in-flight work instead of parking it for retry.',
    };
  }
  return {
    action: 'Scale horizontally',
    detail:
      'Run more than one instance of this component behind the existing entry point so a single instance failure degrades capacity instead of removing the capability.',
  };
};

/**
 * Instances behind one box. Absent means one, which is the safe reading: an
 * unstated replica count should be treated as no redundancy rather than
 * assumed redundancy.
 */
const replicaCountOf = (node: CustomNode | undefined): number =>
  Math.max(1, Math.round(node?.data?.replicas ?? 1));

/** Below this share of nodes in trained roles, the grade is a weak signal. */
const COVERAGE_CAVEAT_THRESHOLD = 0.85;

/** Below this model confidence, a three-class letter is close to a coin flip. */
const MIN_GRADE_CONFIDENCE = 0.5;

const ROLE_PLAIN_NAME: Record<string, string> = {
  loadbalancer: 'load balancers',
  batch: 'batch and analytics tiers',
  worker: 'async workers',
  cdn: 'CDN edges',
  objectstore: 'object stores',
  external: 'client devices',
};

/**
 * Turn the model's own coverage report into a sentence a reader can act on.
 *
 * Returns null when the graph sits comfortably inside the trained range, so the
 * report stays quiet rather than hedging every grade out of habit.
 */
const buildCoverageCaveat = (
  coverage: { fraction: number; untrainedNodeCount: number; untrainedRoles: string[] } | null,
): string | null => {
  if (!coverage || coverage.fraction >= COVERAGE_CAVEAT_THRESHOLD) {
    return null;
  }
  const named = coverage.untrainedRoles
    .map((role) => ROLE_PLAIN_NAME[role] ?? role)
    .join(', ');
  return (
    `${coverage.untrainedNodeCount} of these components (${named}) are kinds the grader has ` +
    `no measured production examples of - the traces it learned from record only service, ` +
    `database, cache, queue and gateway calls. Read this grade as a weak signal rather than ` +
    `a verdict; the structural findings below are unaffected.`
  );
};

/**
 * Short imperative shown as the annotation on the architecture diagram.
 *
 * Keyed by the intervention family the inference server reports, so a new
 * intervention added in `recommend.py` degrades to a generic label rather than
 * breaking the report.
 */
const MODEL_ACTION_BY_KIND: Record<string, string> = {
  add_cache: 'Add read cache',
  partition_database: 'Split shared store',
  decouple_with_queue: 'Decouple with queue',
  replicate: 'Add replica',
  break_cycle: 'Break cycle',
};

/**
 * Builds the actionable half of the report.
 *
 * Sources are merged in descending order of authority: the trained model's
 * structural findings first (it saw production traces), then the rule engine's
 * per-edge/per-node risks, then whatever the simulation's own root-cause
 * analyser suggested. Each recommendation records which produced it, so the UI
 * can be honest about where the advice came from.
 */
const buildRecommendations = (
  nodes: CustomNode[],
  edges: CustomEdge[],
  ghost: GhostTraceResult | null,
  engine: EngineRunResult | null,
  nodeFindings: ReportNodeFinding[],
  edgeFindings: ReportEdgeFinding[],
): ReportRecommendation[] => {
  const nodesById = new Map(nodes.map((node) => [String(node.id), node]));
  const recommendations: ReportRecommendation[] = [];
  const seenTargets = new Set<string>();
  let counter = 0;

  const push = (rec: Omit<ReportRecommendation, 'id'>): void => {
    // One recommendation per (action, target) pair - the same component can
    // legitimately need two different fixes, but not the same fix twice.
    const dedupeKey = `${rec.action}::${rec.targetNodeIds.join(',')}::${rec.targetEdgeIds.join(',')}`;
    if (seenTargets.has(dedupeKey)) {
      return;
    }
    seenTargets.add(dedupeKey);
    counter += 1;
    recommendations.push({ ...rec, id: `rec-${counter}` });
  };

  // ---- 0. Model, counterfactually scored ----
  //
  // These come first because they are the only recommendations where the model
  // evaluated the fix on this specific topology rather than asserting that a
  // pattern is bad in general.
  //
  // What they are NOT is a prediction of the real-world effect. The number the
  // grader produces is the grader re-scoring its own modified output, and that
  // number has now been checked against measurement: across 6,000 matched pairs
  // of real production architectures differing by one component, the direction
  // it implies agreed with the measured change in tail latency 55% of the time
  // -- better than a coin flip, worse than the 59.7% you get by always guessing
  // that an addition makes things slower.
  //
  // So the risk scale is reported as what it is, an internal ordering, and
  // never as a predicted latency change. Presenting "-40% tail latency" from a
  // number that cannot beat a one-line rule would be the most confident thing
  // in the report and the least supported. See
  // ml-pipeline/microservices/validate_current_recommender.py.
  for (const model of ghost?.architectureGrade?.recommendations ?? []) {
    // Only surface nodes that still exist on the canvas. The counterfactual
    // graphs contain synthesised nodes (a cache that does not exist yet), and
    // the report draws targets onto the diagram - an id with nothing to point
    // at would annotate empty space.
    const targets = model.targetNodes.filter((nodeId) => nodesById.has(String(nodeId)));
    if (targets.length === 0) {
      continue;
    }

    const changesGrade = model.gradeBefore !== model.gradeAfter;
    const priority: RecommendationPriority =
      model.severity === 'high' && changesGrade
        ? 'critical'
        : model.severity === 'high'
          ? 'high'
          : model.severity === 'medium'
            ? 'medium'
            : 'low';

    push({
      priority,
      title: model.summary,
      detail:
        `${model.detail} On the model's internal ranking this is the ` +
        `${changesGrade ? 'largest' : 'strongest'} single change available for this topology` +
        `${changesGrade ? `, and it is the one that moves the grade from ${model.gradeBefore} to ${model.gradeAfter}` : ''}. ` +
        `That ranking orders candidate changes; it is not a prediction of how much ` +
        `latency you will save.` +
        (typeof model.predictedDeltaPercent === 'number' && typeof model.signConfidence === 'number'
          ? ` Measured-pair model: ${model.predictedDeltaPercent > 0 ? '+' : ''}` +
            `${model.predictedDeltaPercent.toFixed(0)}% tail latency, ` +
            `${Math.round(model.signConfidence * 100)}% confident of the direction` +
            (typeof model.groundedInPairs === 'number'
              ? `, from ${model.groundedInPairs.toLocaleString()} measured pairs.`
              : '.')
          : ''),
      origin: 'model',
      targetNodeIds: targets,
      targetEdgeIds: [],
      action: MODEL_ACTION_BY_KIND[model.kind] ?? 'Apply fix',
      kind: model.kind,
    });
  }

  // ---- 1. Model: single points of failure, weighted by blast radius ----
  for (const finding of nodeFindings) {
    if (!finding.isSinglePointOfFailure) {
      continue;
    }
    const fix = redundancyFixForRole(finding.role, finding.type);
    push({
      priority: priorityFromRisk(Math.max(finding.blastRadius, finding.riskScore)),
      title: `${finding.label} is a single point of failure`,
      detail: `${Math.round(finding.blastRadius * 100)}% of the architecture is downstream of ${finding.label}. ${fix.detail}`,
      origin: 'model',
      targetNodeIds: [finding.nodeId],
      targetEdgeIds: [],
      action: fix.action,
    });
  }

  // ---- 2. Rules: highest-risk components ----
  for (const finding of nodeFindings.slice(0, 4)) {
    if (finding.riskScore < 0.4 || finding.reasons.length === 0) {
      continue;
    }
    const fix = redundancyFixForRole(finding.role, finding.type);
    push({
      priority: priorityFromRisk(finding.riskScore),
      title: `${finding.label} is carrying disproportionate risk`,
      detail: `${finding.reasons.join(' ')} ${fix.detail}`,
      origin: 'rules',
      targetNodeIds: [finding.nodeId],
      targetEdgeIds: [],
      action: fix.action,
    });
  }

  // ---- 3. Rules: highest-risk links ----
  for (const finding of edgeFindings.slice(0, 4)) {
    if (finding.riskScore < 0.4) {
      continue;
    }
    push({
      priority: priorityFromRisk(finding.riskScore),
      title: `${finding.sourceLabel} to ${finding.targetLabel} is a fragile call path`,
      detail: `${finding.reasons.join(' ')} Add a timeout, bounded retries with jitter, and a circuit breaker on this call so a slow ${finding.targetLabel} cannot block ${finding.sourceLabel}.`,
      origin: 'rules',
      targetNodeIds: [finding.source, finding.target],
      targetEdgeIds: [finding.edgeId],
      action: 'Add timeout + circuit breaker',
    });
  }

  // ---- 4. Simulation: whatever actually broke during the run ----
  const engineRecommendations = engine?.recommendations ?? [];
  for (const text of engineRecommendations) {
    if (!text || !text.trim()) {
      continue;
    }
    // Bind the sentence to any component it names so it can still be drawn.
    const mentioned = nodes
      .filter((node) => {
        const label = nodeLabel(node, '').trim();
        return label.length > 2 && text.toLowerCase().includes(label.toLowerCase());
      })
      .map((node) => String(node.id));

    // The engine emits a single imperative sentence. Using it as the title reads
    // better than a generic heading with the sentence repeated underneath.
    const sentence = text.trim().replace(/\s+/g, ' ');
    const title = sentence.length <= 80
      ? sentence.replace(/\.$/, '')
      : `${sentence.slice(0, 77).trimEnd()}...`;

    push({
      priority: 'medium',
      title,
      detail: `The simulated run surfaced this directly: ${sentence}`,
      origin: 'simulation',
      targetNodeIds: mentioned,
      targetEdgeIds: [],
      action: 'Apply change',
    });
  }

  // ---- 5. Structural gaps worth flagging even on a healthy graph ----
  const hasCache = nodes.some((node) => nodeType(node).toLowerCase().includes('cache'));
  const hasDatabase = nodes.some((node) => /database|postgres|sql/i.test(nodeType(node)));
  if (hasDatabase && !hasCache && nodes.length >= 3) {
    const dbNodes = nodes
      .filter((node) => /database|postgres|sql/i.test(nodeType(node)))
      .map((node) => String(node.id));
    push({
      priority: 'medium',
      title: 'No cache in front of the datastore',
      detail:
        'Every read reaches the database directly. Introducing a cache in front of it absorbs read bursts and keeps the database from becoming the throughput ceiling under load.',
      origin: 'rules',
      targetNodeIds: dbNodes,
      targetEdgeIds: [],
      action: 'Insert cache layer',
    });
  }

  const orphans = nodes.filter((node) => {
    const id = String(node.id);
    return !edges.some((edge) => String(edge.source) === id || String(edge.target) === id);
  });
  if (orphans.length > 0 && nodes.length > 1) {
    push({
      priority: 'low',
      title: `${orphans.length} component${orphans.length === 1 ? '' : 's'} not connected to the graph`,
      detail: `${orphans.map((node) => nodeLabel(node, String(node.id))).join(', ')} ${
        orphans.length === 1 ? 'has' : 'have'
      } no inbound or outbound links, so nothing in the simulation ever exercises ${
        orphans.length === 1 ? 'it' : 'them'
      }. Connect or remove.`,
      origin: 'rules',
      targetNodeIds: orphans.map((node) => String(node.id)),
      targetEdgeIds: [],
      action: 'Connect or remove',
    });
  }

  void nodesById;
  return recommendations.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
};

const buildIntelligence = (
  nodes: CustomNode[],
  ghost: GhostTraceResult | null,
): { intelligence: ReportIntelligence; nodeFindings: ReportNodeFinding[]; edgeFindings: ReportEdgeFinding[] } => {
  const nodesById = new Map(nodes.map((node) => [String(node.id), node]));
  const grade = ghost?.architectureGrade ?? null;
  const rolesById = new Map((grade?.nodeRoles ?? []).map((role) => [role.id, role]));

  const nodeFindings: ReportNodeFinding[] = (ghost?.nodeRisks ?? []).map((risk) => {
    const node = nodesById.get(risk.nodeId);
    const role = rolesById.get(risk.nodeId);
    return {
      nodeId: risk.nodeId,
      label: risk.label || nodeLabel(node, risk.nodeId),
      type: nodeType(node),
      riskScore: clamp01(risk.riskScore),
      reasons: risk.reasons ?? [],
      role: role?.role ?? null,
      // A component the topology marks as an articulation point is only a
      // single point of failure if there is genuinely one of it. Reporting a
      // three-instance gateway as a SPOF is the fastest way to lose an
      // engineer's trust, because they can see that it is not.
      isSinglePointOfFailure:
        Boolean(role?.isSinglePointOfFailure) && replicaCountOf(node) <= 1,
      blastRadius: clamp01(role?.blastRadius ?? 0),
    };
  });

  // A node the model flagged structurally but the rule engine never scored still
  // belongs in the report - otherwise a clean-looking graph hides its SPOF.
  for (const role of grade?.nodeRoles ?? []) {
    if (nodeFindings.some((finding) => finding.nodeId === role.id)) {
      continue;
    }
    if (!role.isSinglePointOfFailure) {
      continue;
    }
    const node = nodesById.get(role.id);
    nodeFindings.push({
      nodeId: role.id,
      label: role.label || nodeLabel(node, role.id),
      type: nodeType(node),
      riskScore: clamp01(role.blastRadius),
      reasons: ['Flagged by the topology model as an articulation point.'],
      role: role.role,
      isSinglePointOfFailure: true,
      blastRadius: clamp01(role.blastRadius),
    });
  }

  nodeFindings.sort((a, b) => b.riskScore - a.riskScore);

  const edgeFindings: ReportEdgeFinding[] = (ghost?.edgeRisks ?? [])
    .map((risk) => ({
      edgeId: risk.edgeId,
      source: risk.source,
      target: risk.target,
      sourceLabel: nodeLabel(nodesById.get(risk.source), risk.source),
      targetLabel: nodeLabel(nodesById.get(risk.target), risk.target),
      riskScore: clamp01(risk.riskScore),
      reasons: risk.reasons ?? [],
    }))
    .sort((a, b) => b.riskScore - a.riskScore);

  const intelligence: ReportIntelligence = {
    source: grade ? 'model+rules' : 'rules-only',
    model: grade
      ? {
        available: true,
        riskClass: grade.riskClass,
        letter: grade.letter,
        confidence: grade.confidence,
        classProbabilities: grade.classProbabilities ?? {},
        inferenceTimeMs: grade.inferenceTimeMs,
        coverageCaveat: buildCoverageCaveat(grade.trainingCoverage),
      }
      : null,
    overallRisk: clamp01(ghost?.overallRisk ?? 0),
    predictedFailureMode: ghost?.predictedAnomalyClass ?? 'Not analysed',
    narrative: ghost?.analysisNarrative ?? '',
    nodeFindings,
    edgeFindings,
  };

  return { intelligence, nodeFindings, edgeFindings };
};

interface BuildReportInput {
  projectId: string | null;
  projectName: string;
  nodes: CustomNode[];
  edges: CustomEdge[];
  engine: EngineRunResult;
  ghost: GhostTraceResult | null;
  narrativeReview: string;
}

/**
 * Decide the one letter the whole product shows, and whether to show one at all.
 *
 * The letter is the model's. The simulation engine keeps its own 0-100 score
 * under its own name; it no longer issues a competing letter, because two
 * letters that disagree are worse than one letter plus an honest gap.
 *
 * Withholding is deliberate and matches how the report already behaved: a
 * three-class grade at this accuracy is trustworthy enough to rank changes and
 * not always trustworthy enough to stamp a verdict, so outside the model's
 * trained coverage, or barely above chance, the product says so instead of
 * guessing.
 */
const resolveGrade = (
  model: ReportIntelligence['model'],
): Pick<UnifiedReport, 'grade' | 'gradeSource' | 'gradeWithheldReason' | 'gradeConfidence'> => {
  if (!model) {
    return {
      grade: null,
      gradeSource: 'unavailable',
      gradeWithheldReason:
        'The grading model could not be reached, so no letter is being claimed. The structural ' +
        'findings and the simulation below are unaffected.',
      gradeConfidence: null,
    };
  }

  if (model.coverageCaveat) {
    return {
      grade: null,
      gradeSource: 'withheld',
      gradeWithheldReason: model.coverageCaveat,
      gradeConfidence: model.confidence,
    };
  }

  if (model.confidence < MIN_GRADE_CONFIDENCE) {
    return {
      grade: null,
      gradeSource: 'withheld',
      gradeWithheldReason:
        `The model is only ${Math.round(model.confidence * 100)}% confident across three classes, ` +
        'which is close to chance. The ranked changes above survive that noise; a letter does not.',
      gradeConfidence: model.confidence,
    };
  }

  return {
    grade: model.letter,
    gradeSource: 'model',
    gradeWithheldReason: null,
    gradeConfidence: model.confidence,
  };
};

/**
 * Fuses the WASM simulation, the GNN grader and the rule engine into the single
 * payload the report page and the PDF exporter both render from.
 *
 * Keeping this in one place is what stops the on-screen report and the exported
 * PDF from drifting apart.
 */
export const buildUnifiedReport = (input: BuildReportInput): UnifiedReport => {
  const { engine, ghost, nodes, edges } = input;

  const { intelligence, nodeFindings, edgeFindings } = buildIntelligence(nodes, ghost);
  const recommendations = buildRecommendations(nodes, edges, ghost, engine, nodeFindings, edgeFindings);
  // Deterministic checks, kept as their own list. See architectureChecks.service.
  const checks = runArchitectureChecks(nodes, edges);

  const totalRequests = engine.totalRequests ?? 0;
  const failedRequests = engine.totalFailures ?? 0;
  const successRate = totalRequests > 0 ? (totalRequests - failedRequests) / totalRequests : 1;

  return {
    schemaVersion: 1,
    simulationId: null,
    projectId: input.projectId,
    projectName: input.projectName,
    createdAt: new Date().toISOString(),

    universeSeed: engine.universeSeed,
    stableHash: engine.graphHash,

    ...resolveGrade(intelligence.model),
    // The engine's rationale explains the engine's score, so it travels with
    // it rather than sitting under a letter it no longer produces.
    gradeRationale: engine.gradeRationale ?? [],
    simulatedResilienceScore: engine.gradeScore ?? 0,
    status: engine.status,

    metrics: {
      totalRequests,
      failedRequests,
      successRate,
      peakLatency: engine.peakLatency ?? 0,
      errorRatePercent: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
    },
    latencyData: engine.latencyData ?? [],
    collapseTime: engine.collapseTime ?? '-',
    rootCause: {
      summary: engine.rootCause?.summary ?? 'No dominant failure mode identified.',
      primaryCause: engine.rootCause?.primaryCause ?? 'None',
      // The engine repeats the primary cause as its first detail row; showing it
      // twice in the same panel reads as a rendering bug.
      contributingFactors: (engine.rootCause?.details ?? [])
        .filter((detail) => detail.label.trim().toLowerCase() !== 'primary cause')
        .map((detail) => `${detail.label}: ${detail.value}`),
    },

    intelligence,
    recommendations,
    checks,

    graph: { nodes, edges },
    narrativeReview: input.narrativeReview,
  };
};
