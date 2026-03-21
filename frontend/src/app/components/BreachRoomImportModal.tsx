import { useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, Trash2 } from 'lucide-react';
import { authFetch } from '../../lib/auth';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';

export type IncidentSource = 'manual' | 'pagerduty' | 'datadog';
export type IncidentEventType = 'latency_spike' | 'error_rate' | 'timeout' | 'crash';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IncidentEvent {
  id: string;
  affectedNodeId: string;
  type: IncidentEventType;
  severity: IncidentSeverity;
  description: string;
  timestamp: string;
}

export interface IncidentTimeline {
  title: string;
  source: IncidentSource;
  startTime: string;
  endTime: string;
  events: IncidentEvent[];
  affectedNodeIds: string[];
}

interface BreachRoomImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (timeline: IncidentTimeline) => void;
}

const EVENT_TYPES: IncidentEventType[] = ['latency_spike', 'error_rate', 'timeout', 'crash'];
const EVENT_SEVERITIES: IncidentSeverity[] = ['critical', 'high', 'medium', 'low'];

const severityBadgeClass = (severity: IncidentSeverity): string => {
  if (severity === 'critical') return 'border-red-500/35 bg-red-500/20 text-red-200';
  if (severity === 'high') return 'border-red-500/20 bg-red-500/10 text-red-200';
  if (severity === 'medium') return 'border-amber-500/25 bg-amber-500/15 text-amber-200';
  return 'border-amber-500/15 bg-amber-500/10 text-amber-100';
};

const toIsoTime = (value: string): string => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const interpolateTimestamp = (startIso: string, endIso: string, index: number, total: number): string => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return new Date().toISOString();
  }
  if (total <= 1) {
    return new Date(start).toISOString();
  }
  const ratio = index / (total - 1);
  return new Date(start + (end - start) * ratio).toISOString();
};

const parseTimelineResponse = (payload: any, fallbackSource: IncidentSource): IncidentTimeline => {
  const candidate = payload?.incidentTimeline || payload?.timeline || payload?.incident || payload;
  const rawEvents = Array.isArray(candidate?.events) ? candidate.events : [];

  if (rawEvents.length === 0) {
    throw new Error('No incident events were found in the payload.');
  }

  const startTime = toIsoTime(String(candidate?.startTime || rawEvents[0]?.timestamp || new Date().toISOString()));
  const endTime = toIsoTime(String(candidate?.endTime || rawEvents[rawEvents.length - 1]?.timestamp || startTime));

  const events: IncidentEvent[] = rawEvents.map((event: any, index: number) => {
    const type = EVENT_TYPES.includes(event?.type) ? event.type : 'error_rate';
    const severity = EVENT_SEVERITIES.includes(event?.severity) ? event.severity : 'medium';
    return {
      id: String(event?.id || `evt-${Date.now()}-${index}`),
      affectedNodeId: String(event?.affectedNodeId || event?.nodeId || event?.service || event?.target || `unknown-${index}`),
      type,
      severity,
      description: String(event?.description || event?.summary || event?.message || 'Imported incident event'),
      timestamp: toIsoTime(String(event?.timestamp || interpolateTimestamp(startTime, endTime, index, rawEvents.length))),
    };
  });

  const affectedNodeIds = Array.from(new Set(events.map((event) => event.affectedNodeId)));

  return {
    title: String(candidate?.title || candidate?.incidentTitle || 'Imported Incident'),
    source: (candidate?.source as IncidentSource | undefined) || fallbackSource,
    startTime,
    endTime,
    events,
    affectedNodeIds,
  };
};

export function BreachRoomImportModal({ isOpen, onClose, onImport }: BreachRoomImportModalProps) {
  const [title, setTitle] = useState('Production Incident');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [events, setEvents] = useState<IncidentEvent[]>([]);

  const [nodeId, setNodeId] = useState('');
  const [eventType, setEventType] = useState<IncidentEventType>('latency_spike');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [description, setDescription] = useState('');

  const [pagerDutyRaw, setPagerDutyRaw] = useState('');
  const [datadogRaw, setDatadogRaw] = useState('');
  const [parseError, setParseError] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const affectedCount = useMemo(() => new Set(events.map((event) => event.affectedNodeId)).size, [events]);

  const resetInlineError = () => setParseError('');

  const handleAddEvent = () => {
    if (!nodeId.trim() || !description.trim()) {
      setParseError('Manual events require a Node ID and description.');
      return;
    }

    resetInlineError();
    setEvents((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        affectedNodeId: nodeId.trim(),
        type: eventType,
        severity,
        description: description.trim(),
        timestamp: new Date().toISOString(),
      },
    ]);
    setNodeId('');
    setDescription('');
  };

  const handleRemoveEvent = (eventId: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== eventId));
  };

  const handleManualImport = () => {
    if (!title.trim()) {
      setParseError('Please enter an incident title.');
      return;
    }
    if (events.length === 0) {
      setParseError('Add at least one incident event before importing.');
      return;
    }

    resetInlineError();
    const safeStart = toIsoTime(startTime || new Date().toISOString());
    const safeEnd = toIsoTime(endTime || startTime || new Date().toISOString());
    const normalizedEvents = events.map((event, index) => ({
      ...event,
      timestamp: interpolateTimestamp(safeStart, safeEnd, index, events.length),
    }));

    onImport({
      title: title.trim(),
      source: 'manual',
      startTime: safeStart,
      endTime: safeEnd,
      events: normalizedEvents,
      affectedNodeIds: Array.from(new Set(normalizedEvents.map((event) => event.affectedNodeId))),
    });
    onClose();
  };

  const handleParseImport = async (source: IncidentSource, rawPayload: string) => {
    if (!rawPayload.trim()) {
      setParseError('Paste the raw webhook JSON before importing.');
      return;
    }

    setIsParsing(true);
    resetInlineError();

    try {
      const response = await authFetch('/api/breachroom/analyze', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          incidentSource: source,
          rawPayload,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || payload?.message || 'Unable to parse incident payload.'));
      }

      const timeline = parseTimelineResponse(payload, source);
      onImport(timeline);
      onClose();
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse the incident payload.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950/70 p-0 text-zinc-100 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.55)] backdrop-blur-3xl sm:max-w-3xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/55 to-transparent" />

        <DialogHeader className="border-b border-white/10 px-8 py-6">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300">
              <ShieldAlert size={18} />
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-red-400/70">Incident Replay</div>
              <DialogTitle className="text-2xl font-bold tracking-tight text-white">BreachRoom Import</DialogTitle>
              <DialogDescription className="mt-2 max-w-[560px] text-zinc-400">
                Import incident timelines in the same deterministic workflow as Workspace and Dashboard analysis flows.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div
          className="max-h-[calc(90vh-170px)] overflow-y-auto px-8 py-6"
          style={{ scrollbarGutter: 'stable' }}
        >
        <Tabs defaultValue="manual" className="mt-0 gap-3">
          <TabsList className="grid h-12 w-full grid-cols-3 rounded-2xl border border-white/15 bg-zinc-900/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <TabsTrigger value="manual" className="rounded-xl text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:text-white data-[state=active]:border data-[state=active]:border-blue-500/30 data-[state=active]:bg-zinc-700 data-[state=active]:text-white data-[state=active]:shadow-[0_0_0_1px_rgba(59,130,246,0.18)_inset]">
              Manual Entry
            </TabsTrigger>
            <TabsTrigger value="pagerduty" className="rounded-xl text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:text-white data-[state=active]:border data-[state=active]:border-blue-500/30 data-[state=active]:bg-zinc-700 data-[state=active]:text-white data-[state=active]:shadow-[0_0_0_1px_rgba(59,130,246,0.18)_inset]">
              PagerDuty JSON
            </TabsTrigger>
            <TabsTrigger value="datadog" className="rounded-xl text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:text-white data-[state=active]:border data-[state=active]:border-blue-500/30 data-[state=active]:bg-zinc-700 data-[state=active]:text-white data-[state=active]:shadow-[0_0_0_1px_rgba(59,130,246,0.18)_inset]">
              Datadog JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-4 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Step 1</p>
                  <p className="text-sm font-semibold text-zinc-100">Incident Metadata</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300">
                  {events.length} events | {affectedCount} nodes
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Title</label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} className="border-zinc-700 bg-zinc-800 text-zinc-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Start Time</label>
                  <Input
                    type="datetime-local"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="border-zinc-700 bg-zinc-800 text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">End Time</label>
                  <Input
                    type="datetime-local"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="border-zinc-700 bg-zinc-800 text-zinc-100"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Step 2</p>
                <p className="text-sm font-semibold text-zinc-100">Add Event</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Node ID</label>
                  <Input value={nodeId} onChange={(event) => setNodeId(event.target.value)} className="border-zinc-700 bg-zinc-800 text-zinc-100" placeholder="api-gateway" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Event Type</label>
                  <Select value={eventType} onValueChange={(value) => setEventType(value as IncidentEventType)}>
                    <SelectTrigger className="border-zinc-700 bg-zinc-800 text-zinc-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-100">
                      {EVENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Severity</label>
                  <Select value={severity} onValueChange={(value) => setSeverity(value as IncidentSeverity)}>
                    <SelectTrigger className="border-zinc-700 bg-zinc-800 text-zinc-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-100">
                      {EVENT_SEVERITIES.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Description</label>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-20 border-zinc-700 bg-zinc-800 text-zinc-100"
                    placeholder="Database read latency crossed 2.5s and retries escalated."
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <Button type="button" onClick={handleAddEvent} className="iz-btn-blue rounded-xl px-5 text-white">
                  Add Event
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Step 3</p>
                <p className="text-sm font-semibold text-zinc-100">Review Events</p>
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-zinc-700/70 bg-zinc-800/30 p-3">
                {events.length === 0 && <div className="text-xs text-zinc-500">No events added yet.</div>}
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-xs text-zinc-100">{event.affectedNodeId}</span>
                        <Badge className="border-zinc-600 bg-zinc-700 text-[10px] text-zinc-100">{event.type}</Badge>
                        <Badge className={`text-[10px] ${severityBadgeClass(event.severity)}`}>{event.severity}</Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveEvent(event.id)}
                        className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                        aria-label="Remove event"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-zinc-300">{event.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/60 p-3">
              {parseError ? (
                <div className="flex items-center gap-2 text-sm text-red-300">
                  <AlertTriangle size={14} />
                  <span>{parseError}</span>
                </div>
              ) : (
                <div className="text-xs text-zinc-500">Import will map events across the selected time window.</div>
              )}
              <Button type="button" onClick={handleManualImport} className="iz-btn-blue ml-auto rounded-xl px-5 text-white">
                Import Timeline
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="pagerduty" className="mt-4 space-y-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Raw PagerDuty Webhook JSON</label>
            <Textarea
              value={pagerDutyRaw}
              onChange={(event) => {
                setPagerDutyRaw(event.target.value);
                resetInlineError();
              }}
              className="min-h-64 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100"
              placeholder='{"event":"incident.triggered", ...}'
            />
            <div className="flex items-center justify-between gap-3">
              {parseError && <div className="text-sm text-red-300">{parseError}</div>}
              <Button
                type="button"
                onClick={() => void handleParseImport('pagerduty', pagerDutyRaw)}
                disabled={isParsing}
                className="iz-btn-blue ml-auto rounded-xl px-5 text-white disabled:opacity-50"
              >
                {isParsing ? 'Parsing...' : 'Parse & Import'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="datadog" className="mt-4 space-y-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Raw Datadog Alert JSON</label>
            <Textarea
              value={datadogRaw}
              onChange={(event) => {
                setDatadogRaw(event.target.value);
                resetInlineError();
              }}
              className="min-h-64 border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100"
              placeholder='{"alert_id":123, ...}'
            />
            <div className="flex items-center justify-between gap-3">
              {parseError && <div className="text-sm text-red-300">{parseError}</div>}
              <Button
                type="button"
                onClick={() => void handleParseImport('datadog', datadogRaw)}
                disabled={isParsing}
                className="iz-btn-blue ml-auto rounded-xl px-5 text-white disabled:opacity-50"
              >
                {isParsing ? 'Parsing...' : 'Parse & Import'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
