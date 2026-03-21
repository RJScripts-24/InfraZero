import { createCompletionWithFallback } from './groq.service';
import { CustomEdge, CustomNode } from '../types/graph';
import { GhostTraceResult } from '../types/ghosttrace';
import {
  BreachRoomRequest,
  BreachRoomResult,
  IncidentEvent,
  IncidentEventType,
  IncidentTimeline,
  RecallScore,
  RevisionSuggestion,
} from '../types/breachroom';
import { logger } from '../utils/logger';

const toTimestamp = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeText = (value: unknown): string => String(value || '').trim();

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const findMatchingNode = (query: string, nodes: CustomNode[]): CustomNode | undefined => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return undefined;
  }

  return nodes.find((node) => {
    const label = node.data.label.toLowerCase();
    return label.includes(normalizedQuery) || normalizedQuery.includes(label);
  });
};

const inferIncidentType = (description: string): IncidentEventType => {
  const normalized = description.toLowerCase();
  if (normalized.includes('latency')) {
    return 'latency_spike';
  }
  if (normalized.includes('timeout')) {
    return 'timeout';
  }
  if (normalized.includes('down') || normalized.includes('unreachable')) {
    return 'crash';
  }
  if (normalized.includes('error') || normalized.includes('5xx')) {
    return 'error_rate';
  }
  if (normalized.includes('recovery') || normalized.includes('resolved')) {
    return 'recovery';
  }
  return 'error_rate';
};

const mapPagerDutySeverity = (urgency: string): IncidentEvent['severity'] => {
  const normalized = urgency.toLowerCase();
  if (normalized === 'high') {
    return 'critical';
  }
  if (normalized === 'low') {
    return 'medium';
  }
  return 'high';
};

const mapDatadogType = (monitorType: string): IncidentEventType => {
  return monitorType.toLowerCase().includes('latency') ? 'latency_spike' : 'error_rate';
};

const findAffectedEdgeId = (description: string, edges: CustomEdge[]): string | undefined => {
  const normalized = description.toLowerCase();
  return edges.find((edge) => normalized.includes(edge.id.toLowerCase()))?.id;
};

const buildTimeline = (
  incidentId: string,
  title: string,
  startTime: number,
  endTime: number,
  source: IncidentTimeline['source'],
  events: IncidentEvent[],
): IncidentTimeline => {
  const affectedNodeIds = unique(events.map((event) => event.affectedNodeId));
  const affectedEdgeIds = unique(events.map((event) => event.affectedEdgeId || ''));

  return {
    incidentId,
    title,
    startTime,
    endTime,
    source,
    events,
    affectedNodeIds,
    affectedEdgeIds,
  };
};

export const parsePagerDutyPayload = (payload: any, nodes: CustomNode[]): IncidentTimeline => {
  const now = Date.now();
  const incidentId = payload?.incident?.id || `pd-${now}`;
  const title = payload?.incident?.title || payload?.incident?.description || 'PagerDuty Incident';
  const startTime = toTimestamp(payload?.incident?.created_at, now);
  const endTime = toTimestamp(payload?.incident?.resolved_at, now);
  const alerts = Array.isArray(payload?.incident?.alerts) ? payload.incident.alerts : [];

  const events: IncidentEvent[] = alerts.map((alert: any, index: number) => {
    const description = normalizeText(
      alert?.body?.details?.description
      || alert?.body?.details?.summary
      || alert?.summary
      || title,
    );
    const serviceName = normalizeText(
      alert?.service?.summary
      || alert?.service?.name
      || alert?.body?.details?.service
      || description,
    );
    const matchedNode = findMatchingNode(serviceName, nodes) || nodes[0];
    return {
      id: normalizeText(alert?.id) || `${incidentId}-alert-${index}`,
      timestamp: toTimestamp(alert?.created_at, startTime + index * 1000),
      affectedNodeId: matchedNode?.id || '',
      affectedEdgeId: findAffectedEdgeId(description, []),
      severity: mapPagerDutySeverity(normalizeText(alert?.urgency || payload?.incident?.urgency)),
      type: inferIncidentType(description),
      description,
    };
  });

  return buildTimeline(incidentId, title, startTime, endTime, 'pagerduty', events);
};

export const parseDatadogPayload = (payload: any, nodes: CustomNode[]): IncidentTimeline => {
  const now = Date.now();
  const incidentId = `dd-${payload?.id || now}`;
  const title = payload?.title || payload?.monitor?.name || 'Datadog Incident';
  const startTime = toTimestamp(payload?.last_triggered_at, now - 3600000);
  const endTime = now;
  const monitors = Array.isArray(payload?.monitors) && payload.monitors.length > 0 ? payload.monitors : [payload];

  const events: IncidentEvent[] = monitors.map((monitorPayload: any, index: number) => {
    const tags = Array.isArray(monitorPayload?.tags) ? monitorPayload.tags : Array.isArray(payload?.tags) ? payload.tags : [];
    const serviceTag = tags.find((tag: string) => typeof tag === 'string' && tag.toLowerCase().startsWith('service:'));
    const edgeTag = tags.find((tag: string) => typeof tag === 'string' && tag.toLowerCase().startsWith('edge:'));
    const serviceName = serviceTag ? serviceTag.split(':').slice(1).join(':') : normalizeText(monitorPayload?.title || title);
    const matchedNode = findMatchingNode(serviceName, nodes) || nodes[0];
    const description = normalizeText(monitorPayload?.text || monitorPayload?.message || title);

    return {
      id: `${incidentId}-monitor-${index}`,
      timestamp: toTimestamp(monitorPayload?.last_triggered_at || payload?.last_triggered_at, startTime + index * 1000),
      affectedNodeId: matchedNode?.id || '',
      affectedEdgeId: edgeTag ? edgeTag.split(':').slice(1).join(':') : undefined,
      severity: 'high',
      type: mapDatadogType(normalizeText(monitorPayload?.monitor_type || payload?.monitor_type)),
      description,
    };
  });

  return buildTimeline(incidentId, title, startTime, endTime, 'datadog', events);
};

export const computeRecallScore = (
  ghostTraceResult: GhostTraceResult,
  timeline: IncidentTimeline,
  threshold = 0.3,
): RecallScore => {
  const predictedRiskyEdges = unique(
    ghostTraceResult.edgeRisks
      .filter((edgeRisk) => edgeRisk.riskScore > threshold)
      .map((edgeRisk) => edgeRisk.edgeId),
  );
  const actualAffectedEdges = unique(timeline.affectedEdgeIds);

  const predictedSet = new Set(predictedRiskyEdges);
  const actualSet = new Set(actualAffectedEdges);
  const truePositives = [...predictedSet].filter((edgeId) => actualSet.has(edgeId)).length;
  const falsePositives = [...predictedSet].filter((edgeId) => !actualSet.has(edgeId)).length;
  const falseNegatives = [...actualSet].filter((edgeId) => !predictedSet.has(edgeId)).length;

  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision,
    recall,
    f1Score,
    truePositives,
    falsePositives,
    falseNegatives,
    predictedRiskyEdges,
    actualAffectedEdges,
    threshold,
  };
};

export const generateRevisionSuggestions = (
  nodes: CustomNode[],
  edges: CustomEdge[],
  ghostTraceResult: GhostTraceResult,
  timeline: IncidentTimeline,
): RevisionSuggestion[] => {
  const suggestions: RevisionSuggestion[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const affectedNodeIds = new Set(timeline.affectedNodeIds);
  const seenKeys = new Set<string>();

  const pushSuggestion = (suggestion: RevisionSuggestion): void => {
    const key = `${suggestion.type}:${suggestion.targetId || suggestion.suggestedLabel || suggestion.rationale}`;
    if (seenKeys.has(key) || suggestions.length >= 5) {
      return;
    }
    seenKeys.add(key);
    suggestions.push(suggestion);
  };

  for (const nodeRisk of ghostTraceResult.nodeRisks.filter((risk) => risk.riskScore > 0.6)) {
    if (!affectedNodeIds.has(nodeRisk.nodeId)) {
      continue;
    }
    const node = nodeById.get(nodeRisk.nodeId);
    pushSuggestion({
      type: 'add_node',
      targetId: nodeRisk.nodeId,
      suggestedLabel: `Add redundant replica of ${nodeRisk.label}`,
      suggestedType: node?.data.type,
      rationale: `Add redundant replica of ${nodeRisk.label}`,
      priority: 'high',
    });
  }

  for (const edgeRisk of ghostTraceResult.edgeRisks.filter((risk) => risk.riskScore > 0.6)) {
    const edge = edgeById.get(edgeRisk.edgeId);
    const sourceLabel = edge ? nodeById.get(edge.source)?.data.label || edge.source : edgeRisk.source;
    const targetLabel = edge ? nodeById.get(edge.target)?.data.label || edge.target : edgeRisk.target;
    pushSuggestion({
      type: 'add_node',
      targetId: edgeRisk.edgeId,
      suggestedLabel: `Circuit breaker: ${sourceLabel} -> ${targetLabel}`,
      suggestedType: 'Service',
      rationale: `Insert circuit breaker between ${sourceLabel} and ${targetLabel}`,
      priority: 'high',
    });
  }

  if (ghostTraceResult.predictedAnomalyClass === 'Thundering Herd') {
    const entryNode = nodes.find((node) => !edges.some((edge) => edge.target === node.id)) || nodes[0];
    pushSuggestion({
      type: 'add_node',
      targetId: entryNode?.id,
      suggestedLabel: 'Add rate limiter at entry point',
      suggestedType: 'Gateway',
      rationale: 'Add rate limiter at entry point',
      priority: 'high',
    });
  }

  if (ghostTraceResult.predictedAnomalyClass === 'Retry Storm') {
    const riskyEdge = ghostTraceResult.edgeRisks.find((edgeRisk) => edgeRisk.riskScore > 0.6) || ghostTraceResult.edgeRisks[0];
    pushSuggestion({
      type: 'modify_edge',
      targetId: riskyEdge?.edgeId,
      rationale: 'Add exponential backoff on high-risk edges',
      priority: 'medium',
    });
  }

  for (const node of nodes) {
    if ((node.data.coldStartLatencyMs ?? 0) <= 500 || !affectedNodeIds.has(node.id)) {
      continue;
    }
    pushSuggestion({
      type: 'modify_node',
      targetId: node.id,
      suggestedLabel: node.data.label,
      suggestedType: node.data.type,
      rationale: `Enable warm pool/pre-warming for ${node.data.label}`,
      priority: 'medium',
    });
  }

  return suggestions.slice(0, 5);
};

const buildFallbackNarrative = (
  timeline: IncidentTimeline,
  recallScore: RecallScore,
  ghostTraceResult: GhostTraceResult,
  revisionSuggestions: RevisionSuggestion[],
): string => {
  const recallPercent = Math.round(recallScore.recall * 100);
  return `GhostTrace ${recallPercent > 0 ? 'partially' : 'did not'} catch the ${timeline.title} incident. The failure aligned most closely with ${ghostTraceResult.predictedAnomalyClass}, and the highest-priority fix is ${revisionSuggestions[0]?.rationale || 'improving redundancy on the affected path'}.`;
};

export const runBreachRoomAnalysis = async (request: BreachRoomRequest): Promise<BreachRoomResult> => {
  const { nodes, edges, ghostTraceResult, incidentSource, manualEvents = [], pdPayload, ddPayload } = request;

  logger.info(`[BreachRoom] Starting analysis for source=${incidentSource} with ${nodes.length} nodes and ${edges.length} edges`);

  const timeline = (() => {
    if (incidentSource === 'pagerduty') {
      return parsePagerDutyPayload(pdPayload, nodes);
    }
    if (incidentSource === 'datadog') {
      return parseDatadogPayload(ddPayload, nodes);
    }

    const now = Date.now();
    const events = manualEvents.map((event, index) => ({
      ...event,
      id: event.id || `manual-event-${index}`,
      timestamp: Number.isFinite(event.timestamp) ? event.timestamp : now + index * 1000,
    }));
    const startTime = events.length > 0 ? Math.min(...events.map((event) => event.timestamp)) : now;
    const endTime = events.length > 0 ? Math.max(...events.map((event) => event.timestamp)) : now;
    return buildTimeline(
      `manual-${now}`,
      'Manual Incident Import',
      startTime,
      endTime,
      'manual',
      events,
    );
  })();

  const recallScore = computeRecallScore(ghostTraceResult, timeline);
  const revisionSuggestions = generateRevisionSuggestions(nodes, edges, ghostTraceResult, timeline);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const affectedLabels = timeline.affectedNodeIds.map((nodeId) => nodeById.get(nodeId)?.data.label || nodeId);

  let analysisNarrative = buildFallbackNarrative(timeline, recallScore, ghostTraceResult, revisionSuggestions);

  try {
    const prompt = `You are a senior SRE reviewing an incident against a GhostTrace prediction.
Incident: ${timeline.title}
Affected nodes: ${affectedLabels.join(', ')}
GhostTrace recall score: ${Math.round(recallScore.recall * 100)}%
Predicted anomaly class: ${ghostTraceResult.predictedAnomalyClass}
Top suggestion: ${revisionSuggestions[0]?.rationale || 'Improve redundancy on the affected path'}
Write 3 sentences: (1) Whether GhostTrace caught the failure (2) Root cause analysis (3) The single most important architectural fix.
Max 80 words. Be specific about component names.`;

    const completion = await createCompletionWithFallback({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 160,
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      analysisNarrative = content.trim();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[BreachRoom] Groq narrative unavailable: ${message}`);
  }

  logger.info(`[BreachRoom] Complete. Recall=${recallScore.recall.toFixed(2)}, Suggestions=${revisionSuggestions.length}`);

  return {
    incidentTimeline: timeline,
    recallScore,
    revisionSuggestions,
    analysisNarrative,
  };
};
