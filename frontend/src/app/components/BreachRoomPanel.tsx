import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Pause, Play, ShieldAlert, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Node } from '@xyflow/react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Slider } from './ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import type { IncidentTimeline } from './BreachRoomImportModal';

interface RecallScore {
  recall: number;
  precision: number;
  f1Score: number;
  truePositives: number;
  falseNegatives: number;
  actualAffectedEdges: string[];
  predictedEdgeRisks?: Array<{
    edgeId: string;
    riskScore: number;
  }>;
}

interface RevisionSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  type: string;
  rationale: string;
}

export interface BreachRoomResult {
  recallScore: RecallScore;
  revisionSuggestions: RevisionSuggestion[];
  aiNarrative: string;
}

interface BreachRoomPanelProps {
  isOpen: boolean;
  onClose: () => void;
  result: BreachRoomResult | null;
  isLoading: boolean;
  nodes: Node[];
  timeline: IncidentTimeline | null;
  currentReplayTick: number;
  onTickChange: (tick: number) => void;
  totalTicks: number;
}

const priorityBadgeClass = (priority: 'high' | 'medium' | 'low'): string => {
  if (priority === 'high') return 'border-red-500/30 bg-red-500/15 text-red-300';
  if (priority === 'medium') return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
  return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
};

const recallColorClass = (value: number): string => {
  if (value > 0.7) return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
  if (value > 0.4) return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
  return 'text-red-300 border-red-500/30 bg-red-500/10';
};

export function BreachRoomPanel({
  isOpen,
  onClose,
  result,
  isLoading,
  nodes,
  timeline,
  currentReplayTick,
  onTickChange,
  totalTicks,
}: BreachRoomPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying || totalTicks <= 0) return;
    const timer = window.setInterval(() => {
      if (currentReplayTick >= totalTicks) {
        setIsPlaying(false);
        return;
      }
      onTickChange(currentReplayTick + 1);
    }, 500);
    return () => window.clearInterval(timer);
  }, [isPlaying, currentReplayTick, totalTicks, onTickChange]);

  useEffect(() => {
    if (currentReplayTick >= totalTicks && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentReplayTick, totalTicks, isPlaying]);

  const nodeLabelById = useMemo(
    () => new Map(nodes.map((node) => [String(node.id), ((node.data as { label?: string } | undefined)?.label || String(node.id))])),
    [nodes],
  );

  const riskByEdgeId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of result?.recallScore.predictedEdgeRisks || []) {
      map.set(entry.edgeId, entry.riskScore);
    }
    return map;
  }, [result]);

  const replayEvents = useMemo(() => {
    if (!timeline) return [];
    return timeline.events.filter((_, index) => index <= currentReplayTick);
  }, [timeline, currentReplayTick]);

  const currentTickTimestamp = useMemo(() => {
    if (!timeline || timeline.events.length === 0) return 'No timeline loaded';
    return timeline.events[Math.min(currentReplayTick, timeline.events.length - 1)]?.timestamp || timeline.startTime;
  }, [timeline, currentReplayTick]);

  const recall = result?.recallScore.recall || 0;
  const precision = result?.recallScore.precision || 0;
  const f1Score = result?.recallScore.f1Score || 0;
  const actualAffectedEdges = result?.recallScore.actualAffectedEdges || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: 28, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 28, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-6 right-6 z-30 w-[420px] max-w-[calc(100%-3rem)] overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/85 shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-3xl"
          style={{ maxHeight: 'calc(100vh - 160px)' }}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300">
                <ShieldAlert size={18} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-400/70">Incident Validation</div>
                <div className="text-sm font-semibold text-white">BreachRoom</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition-colors hover:text-white"
              aria-label="Close BreachRoom panel"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[calc(100vh-220px)] space-y-4 overflow-y-auto p-5 custom-scrollbar">
            {isLoading && (
              <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Cross-checking incident replay...</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
                  <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
                </CardContent>
              </Card>
            )}

            {!isLoading && !result && (
              <Card className="border-dashed border-white/10 bg-white/[0.02] text-zinc-200">
                <CardContent className="py-10 text-center text-sm text-zinc-400">
                  Import an incident timeline to compare GhostTrace predictions against observed failures.
                </CardContent>
              </Card>
            )}

            {!isLoading && result && (
              <>
                <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-white">Recall Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`mb-4 rounded-2xl border px-4 py-6 text-center ${recallColorClass(recall)}`}>
                          <div className="text-4xl font-bold">{Math.round(recall * 100)}%</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em]">Recall</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[280px] bg-zinc-900 text-zinc-100">
                        GhostTrace predicted {result.recallScore.truePositives} of{' '}
                        {result.recallScore.truePositives + result.recallScore.falseNegatives} actual failure edges.
                      </TooltipContent>
                    </Tooltip>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <div className="text-zinc-500">Precision</div>
                        <div className="text-lg font-semibold text-zinc-100">{Math.round(precision * 100)}%</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <div className="text-zinc-500">F1 Score</div>
                        <div className="text-lg font-semibold text-zinc-100">{Math.round(f1Score * 100)}%</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-white">Timeline Replay</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Slider
                      min={0}
                      max={Math.max(totalTicks, 0)}
                      step={1}
                      value={[Math.min(currentReplayTick, Math.max(totalTicks, 0))]}
                      onValueChange={(value) => onTickChange(value[0] ?? 0)}
                      disabled={!timeline || totalTicks <= 0}
                      className="[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-thumb]]:border-red-400 [&_[data-slot=slider-range]]:bg-red-400"
                    />
                    <div className="text-xs text-zinc-400">{new Date(currentTickTimestamp).toLocaleString()}</div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-zinc-600 bg-zinc-800/70 text-zinc-100 hover:bg-zinc-700"
                      onClick={() => setIsPlaying((prev) => !prev)}
                      disabled={!timeline || totalTicks <= 0}
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                      {isPlaying ? 'Pause Replay' : 'Play Replay'}
                    </Button>
                    <div className="max-h-36 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
                      {replayEvents.length === 0 && <div className="text-xs text-zinc-500">No events at this tick yet.</div>}
                      {replayEvents.map((event) => (
                        <div key={event.id} className="rounded-lg border border-white/5 bg-zinc-900/70 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-zinc-400">{new Date(event.timestamp).toLocaleTimeString()}</span>
                            <Badge className="border-zinc-600 bg-zinc-800 text-zinc-100">{event.type}</Badge>
                          </div>
                          <div className="mt-1 text-zinc-200">{event.description}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-white">GhostTrace Accuracy</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="px-4 text-zinc-400">Edge/Node</TableHead>
                          <TableHead className="text-zinc-400">Predicted Risk</TableHead>
                          <TableHead className="text-zinc-400">Actual Failure</TableHead>
                          <TableHead className="pr-4 text-zinc-400">Caught?</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {actualAffectedEdges.map((edgeId) => {
                          const riskScore = riskByEdgeId.get(edgeId) || 0;
                          const caught = riskScore > 0.3;
                          const [sourceId, targetId] = edgeId.split('->');
                          const label = targetId
                            ? `${nodeLabelById.get(sourceId) || sourceId} -> ${nodeLabelById.get(targetId) || targetId}`
                            : edgeId;

                          return (
                            <TableRow key={edgeId} className="border-white/5 hover:bg-white/[0.02]">
                              <TableCell className="px-4 font-mono text-zinc-300">{label}</TableCell>
                              <TableCell className="text-zinc-200">{Math.round(riskScore * 100)}%</TableCell>
                              <TableCell className="text-red-300">Yes</TableCell>
                              <TableCell className="pr-4">
                                {caught ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-300">
                                    <CheckCircle2 size={14} /> Yes
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-300">
                                    <XCircle size={14} /> No
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.03] text-zinc-100">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-white">Revision Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.revisionSuggestions.length === 0 && (
                      <div className="text-xs text-zinc-500">No revision suggestions returned.</div>
                    )}
                    {result.revisionSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex flex-wrap gap-2">
                          <Badge className={priorityBadgeClass(suggestion.priority)}>{suggestion.priority}</Badge>
                          <Badge className="border-zinc-600 bg-zinc-800/80 text-zinc-200">{suggestion.type}</Badge>
                        </div>
                        <div className="mb-3 text-sm text-zinc-200">{suggestion.rationale}</div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 border-zinc-600 bg-zinc-800/70 text-xs text-zinc-100 hover:bg-zinc-700"
                          onClick={() => toast('Coming soon - canvas edit API')}
                        >
                          Apply to Canvas
                        </Button>
                      </div>
                    ))}
                    <div className="rounded-xl border border-white/5 bg-zinc-900/70 p-3 text-sm italic text-zinc-300">
                      {result.aiNarrative}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
