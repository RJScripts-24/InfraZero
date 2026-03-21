import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Download, Ghost, X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';

interface EdgeRiskScore {
  edgeId: string;
  source: string;
  target: string;
  riskScore: number;
  reasons: string[];
}

interface NodeRiskScore {
  nodeId: string;
  label: string;
  riskScore: number;
  reasons: string[];
}

interface SyntheticSpan {
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

interface GhostTraceResult {
  graphHash: string;
  topologyEmbedding: number[];
  edgeRisks: EdgeRiskScore[];
  nodeRisks: NodeRiskScore[];
  overallRisk: number;
  predictedAnomalyClass: string;
  syntheticSpans: SyntheticSpan[];
  analysisNarrative: string;
}

interface GhostTracePanelNode {
  id: string;
  data?: {
    label?: string;
  };
}

interface GhostTracePanelProps {
  isOpen: boolean;
  onClose: () => void;
  result: GhostTraceResult | null;
  isLoading: boolean;
  nodes?: GhostTracePanelNode[];
}

const getAnomalyBadgeClass = (value: string): string => {
  if (
    value.includes('Thundering Herd')
    || value.includes('Retry Storm')
    || value.includes('Cascading Failure')
  ) {
    return 'border-red-500/30 bg-red-500/15 text-red-300';
  }
  if (value.includes('Latency Chain Degradation')) {
    return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
  }
  return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
};

const getRiskBarClass = (riskScore: number): string => {
  if (riskScore > 0.6) {
    return '[&>[data-slot=progress-indicator]]:bg-red-400';
  }
  if (riskScore > 0.3) {
    return '[&>[data-slot=progress-indicator]]:bg-amber-400';
  }
  return '[&>[data-slot=progress-indicator]]:bg-emerald-400';
};

const getSpanStatusClass = (status: SyntheticSpan['status']): string => {
  if (status === 'error') {
    return 'border-red-500/30 bg-red-500/15 text-red-300';
  }
  if (status === 'timeout') {
    return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
  }
  return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
};

export function GhostTracePanel({
  isOpen,
  onClose,
  result,
  isLoading,
  nodes = [],
}: GhostTracePanelProps) {
  const nodeLabelById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.data?.label || node.id])),
    [nodes],
  );

  const topEdgeRisks = useMemo(
    () => [...(result?.edgeRisks || [])].sort((a, b) => b.riskScore - a.riskScore).slice(0, 3),
    [result],
  );
  const topNodeRisks = useMemo(
    () => [...(result?.nodeRisks || [])].sort((a, b) => b.riskScore - a.riskScore).slice(0, 3),
    [result],
  );
  const previewSpans = result?.syntheticSpans.slice(0, 5) || [];

  const handleExport = () => {
    if (!result?.syntheticSpans?.length) {
      return;
    }

    const blob = new Blob([JSON.stringify(result.syntheticSpans, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ghosttrace-spans-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <motion.aside
      initial={{ x: 28, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 28, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="absolute top-6 right-6 z-30 w-[380px] max-w-[calc(100%-3rem)] overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/80 shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-3xl"
      style={{ maxHeight: 'calc(100vh - 160px)' }}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
            <Ghost size={18} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-400/70">Predictive Overlay</div>
            <div className="text-sm font-semibold text-white">GhostTrace Analysis</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition-colors hover:text-white"
          aria-label="Close GhostTrace panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-5 custom-scrollbar">
        {isLoading && (
          <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Analyzing topology...</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-32 rounded-full bg-white/10" />
                <div className="h-20 rounded-2xl bg-white/5" />
                <div className="h-16 rounded-2xl bg-white/5" />
                <div className="h-16 rounded-2xl bg-white/5" />
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !result && (
          <Card className="border-dashed border-white/10 bg-white/[0.02] text-zinc-200">
            <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400">
                <Ghost size={24} />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Run GhostTrace to predict failure points</div>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  The overlay will rank risky nodes, risky edges, and synthesize a trace preview for the current topology.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && result && (
          <div className="space-y-4">
            <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-white">GhostTrace Analysis</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getAnomalyBadgeClass(result.predictedAnomalyClass)}>
                    {result.predictedAnomalyClass}
                  </Badge>
                  <Badge className="border border-blue-500/20 bg-blue-500/10 text-blue-200">
                    Risk {(result.overallRisk * 100).toFixed(0)}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border border-white/5 bg-zinc-900/70 px-4 py-4 text-sm italic leading-6 text-zinc-300">
                  {result.analysisNarrative}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-white">Top Risk Edges</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {topEdgeRisks.length === 0 && (
                  <div className="text-xs text-zinc-500">No edge risk data returned.</div>
                )}
                {topEdgeRisks.map((edgeRisk) => (
                  <div key={edgeRisk.edgeId} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">
                        {(nodeLabelById.get(edgeRisk.source) || edgeRisk.source)} {'->'} {(nodeLabelById.get(edgeRisk.target) || edgeRisk.target)}
                      </div>
                      <div className="text-xs font-mono text-zinc-400">{Math.round(edgeRisk.riskScore * 100)}%</div>
                    </div>
                    <Progress
                      value={edgeRisk.riskScore * 100}
                      className={`mt-3 h-2.5 bg-white/5 ${getRiskBarClass(edgeRisk.riskScore)}`}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {edgeRisk.reasons.map((reason) => (
                        <Badge
                          key={`${edgeRisk.edgeId}-${reason}`}
                          className="border border-white/10 bg-white/5 text-[10px] uppercase tracking-wide text-zinc-300"
                        >
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-white">Top Risk Nodes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {topNodeRisks.length === 0 && (
                  <div className="text-xs text-zinc-500">No node risk data returned.</div>
                )}
                {topNodeRisks.map((nodeRisk) => (
                  <div key={nodeRisk.nodeId} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">{nodeRisk.label}</div>
                      <div className="text-xs font-mono text-zinc-400">{Math.round(nodeRisk.riskScore * 100)}%</div>
                    </div>
                    <Progress
                      value={nodeRisk.riskScore * 100}
                      className={`mt-3 h-2.5 bg-white/5 ${getRiskBarClass(nodeRisk.riskScore)}`}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {nodeRisk.reasons.map((reason) => (
                        <Badge
                          key={`${nodeRisk.nodeId}-${reason}`}
                          className="border border-white/10 bg-white/5 text-[10px] uppercase tracking-wide text-zinc-300"
                        >
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-white">Synthetic Trace Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {previewSpans.length === 0 && (
                  <div className="text-xs text-zinc-500">No trace spans generated.</div>
                )}
                {previewSpans.map((span) => (
                  <div
                    key={span.spanId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-black/20 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{span.serviceName}</div>
                      <div className="truncate text-[11px] font-mono text-zinc-500">{span.operationName}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-mono text-zinc-400">{span.durationMs}ms</div>
                      <Badge className={getSpanStatusClass(span.status)}>
                        {span.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <button
              onClick={handleExport}
              disabled={result.syntheticSpans.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100 transition-all hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={16} />
              Export Traces
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
