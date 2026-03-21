import { CustomEdge, CustomNode } from './graph';
import { GhostTraceResult } from './ghosttrace';

export type IncidentEventType = 'latency_spike' | 'error_rate' | 'timeout' | 'crash' | 'recovery';

export interface IncidentEvent {
  id: string;
  timestamp: number;
  affectedNodeId: string;
  affectedEdgeId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: IncidentEventType;
  description: string;
}

export interface IncidentTimeline {
  incidentId: string;
  title: string;
  startTime: number;
  endTime: number;
  source: 'manual' | 'pagerduty' | 'datadog';
  events: IncidentEvent[];
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
}

export interface RecallScore {
  precision: number;
  recall: number;
  f1Score: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  predictedRiskyEdges: string[];
  actualAffectedEdges: string[];
  threshold: number;
}

export interface RevisionSuggestion {
  type: 'add_node' | 'add_edge' | 'modify_node' | 'modify_edge' | 'remove_node';
  targetId?: string;
  suggestedLabel?: string;
  suggestedType?: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
}

export interface BreachRoomResult {
  incidentTimeline: IncidentTimeline;
  recallScore: RecallScore;
  revisionSuggestions: RevisionSuggestion[];
  analysisNarrative: string;
}

export interface BreachRoomRequest {
  nodes: CustomNode[];
  edges: CustomEdge[];
  ghostTraceResult: GhostTraceResult;
  incidentSource: 'manual' | 'pagerduty' | 'datadog';
  manualEvents?: IncidentEvent[];
  pdPayload?: any;
  ddPayload?: any;
}
