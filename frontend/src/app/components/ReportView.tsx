import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, ArrowLeft, ArrowRight, AlertTriangle, Cpu, Loader2, ShieldCheck, Activity } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import { toast } from 'sonner';
import { ArchitectureDiagram, PRIORITY_COLOR, type DiagramAnnotation } from './report/ArchitectureDiagram';
import { exportReportToPdf } from '../../lib/reportPdf';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnifiedReportData {
  projectName: string;
  createdAt?: string;
  simulationId?: string | null;
  universeSeed: string;
  stableHash: string;
  /** The one letter in the product, from the model. Null when withheld. */
  grade: string | null;
  gradeSource?: 'model' | 'withheld' | 'unavailable';
  gradeWithheldReason?: string | null;
  gradeConfidence?: number | null;
  gradeRationale?: string[];
  /** The simulation's own score. Not a grade, and never rendered as a letter. */
  simulatedResilienceScore: number;
  status: string;
  metrics: {
    totalRequests: number;
    failedRequests: number;
    successRate: number;
    peakLatency: number;
    errorRatePercent: number;
  };
  latencyData: Array<{ time: number; latency: number }>;
  collapseTime: string;
  rootCause: { summary: string; primaryCause: string; contributingFactors: string[] };
  intelligence: {
    source: 'model+rules' | 'rules-only';
    model: {
      available: boolean;
      riskClass: string;
      letter: string;
      confidence: number;
      classProbabilities: Record<string, number>;
      inferenceTimeMs: number | null;
      coverageCaveat: string | null;
    } | null;
    overallRisk: number;
    predictedFailureMode: string;
    narrative: string;
    nodeFindings: Array<{
      nodeId: string;
      label: string;
      type: string;
      riskScore: number;
      reasons: string[];
      role: string | null;
      isSinglePointOfFailure: boolean;
      blastRadius: number;
    }>;
    edgeFindings: Array<{
      edgeId: string;
      sourceLabel: string;
      targetLabel: string;
      riskScore: number;
      reasons: string[];
    }>;
  };
  checks: Array<{
    id: string;
    status: 'pass' | 'warn' | 'fail';
    title: string;
    detail: string;
    targetNodeIds: string[];
    category: 'availability' | 'data' | 'traffic' | 'operations' | 'cost';
  }>;
  recommendations: Array<{
    id: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    detail: string;
    origin: 'model' | 'rules' | 'simulation';
    targetNodeIds: string[];
    targetEdgeIds: string[];
    action: string;
    kind?: string;
  }>;
  graph: { nodes: any[]; edges: any[] };
  narrativeReview?: string;
}

interface ReportViewProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  reportData: UnifiedReportData | null;
  /**
   * Apply one recommendation to the canvas and re-run the analysis.
   *
   * Predict, change, re-measure. Without this the report is a verdict the user
   * can only read; with it, every recommendation is a claim they can test in
   * one click and see re-ranked. That loop is also the only honest way to
   * present a ranking whose absolute numbers are not predictions.
   */
  onApplyChange?: (recommendationId: string) => void;
  /** Id currently being applied, so the button can show it is working. */
  applyingRecommendationId?: string | null;
}

// ─── Shared presentation ──────────────────────────────────────────────────────

const gradeInk = (grade: string): string => {
  const letter = (grade || 'F')[0].toUpperCase();
  if (letter === 'A') return '#10b981';
  if (letter === 'B') return '#3b82f6';
  if (letter === 'C') return '#eab308';
  if (letter === 'D') return '#f97316';
  return '#ef4444';
};

const ORIGIN_LABEL: Record<string, string> = {
  model: 'Trained model',
  rules: 'Rule engine',
  simulation: 'Simulation run',
};

/** Every section gets the same frame, which is what makes the page scan as a document. */
function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-[28px] border border-white/10 bg-zinc-900/40 backdrop-blur-2xl p-8 md:p-10">
      <header className="mb-7">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="font-mono text-[11px] font-bold tracking-[0.25em] text-blue-500">{step}</span>
          <h2 className="text-white text-2xl font-bold tracking-tight">{title}</h2>
        </div>
        {subtitle && <p className="text-zinc-500 text-sm leading-relaxed max-w-3xl">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1.5">{label}</div>
      <div className="font-mono text-xl font-bold tracking-tight" style={{ color: tone || '#fafafa' }}>
        {value}
      </div>
    </div>
  );
}

const LatencyTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-2xl">
      <p className="text-zinc-500 text-[10px] font-mono font-bold uppercase tracking-widest mb-1">
        t = {Number(point.payload.time).toFixed(2)}s
      </p>
      <p className="font-mono text-sm font-bold text-blue-400">{Math.round(point.value)} ms</p>
    </div>
  );
};

// ─── Report ───────────────────────────────────────────────────────────────────

export function ReportView({ isOpen, onClose, projectName, reportData, onApplyChange, applyingRecommendationId }: ReportViewProps) {
  const [isExporting, setIsExporting] = useState(false);

  const annotations = useMemo<DiagramAnnotation[]>(() => {
    if (!reportData) return [];
    return reportData.recommendations
      .map((rec, index) => ({
        index: index + 1,
        nodeIds: rec.targetNodeIds || [],
        edgeIds: rec.targetEdgeIds || [],
        priority: rec.priority,
        action: rec.action,
      }))
      .filter((a) => a.nodeIds.length > 0 || a.edgeIds.length > 0);
  }, [reportData]);

  // Only components the analysis actually scored. Charting a row per component
  // would render mostly empty bars and imply the chart failed to load.
  const riskBars = useMemo(() => {
    if (!reportData) return [];
    return reportData.intelligence.nodeFindings
      .filter((finding) => finding.riskScore > 0)
      .slice(0, 8)
      .map((finding) => ({
        name: finding.label.length > 16 ? `${finding.label.slice(0, 15)}…` : finding.label,
        risk: Math.round(finding.riskScore * 100),
      }));
  }, [reportData]);

  const classBars = useMemo(() => {
    const probabilities = reportData?.intelligence.model?.classProbabilities;
    if (!probabilities) return [];
    const order = ['low', 'medium', 'high'];
    return order
      .filter((key) => key in probabilities)
      .map((key) => ({ name: key, value: Math.round(probabilities[key] * 100) }));
  }, [reportData]);

  const handleExport = async () => {
    if (!reportData) return;
    setIsExporting(true);
    try {
      await exportReportToPdf({ ...reportData, projectName });
      toast.success('Report exported.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export the report.');
    } finally {
      setIsExporting(false);
    }
  };

  const grade = reportData?.grade ?? null;
  const ink = gradeInk(grade ?? 'F');
  const passed = (reportData?.status || '').toUpperCase().includes('PASS');
  const modelAvailable = Boolean(reportData?.intelligence.model);

  const coverageCaveat = reportData?.intelligence.model?.coverageCaveat ?? null;

  /**
   * Whether there is a letter to show.
   *
   * The decision itself is made server-side now, in one place, so the report,
   * the terminal, the dashboard card and the PDF cannot disagree about it. The
   * report used to make its own call here, and it made it about the SIMULATION's
   * letter using the MODEL's confidence -- two graders tangled into one badge.
   * A withheld grade is not a failure: the ranked changes above are relative,
   * and a relative ordering survives noise that an absolute class does not.
   */
  const gradeIsReliable = grade !== null;
  const withheldReason =
    reportData?.gradeWithheldReason ??
    coverageCaveat ??
    'The grading model made no verdict for this architecture.';

  /** The changes that lead the report. Three is what a reader will actually act on. */
  const topChanges = (reportData?.recommendations ?? []).slice(0, 3);

  const checks = reportData?.checks ?? [];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-[#050508]"
          >
            <div className="absolute inset-0 z-0 pointer-events-none">
              <img src="/night-hero.png" alt="" className="absolute inset-0 object-cover w-full h-full opacity-25 mix-blend-screen" />
              <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
            </div>
          </motion.div>

          <div className="relative min-h-screen flex flex-col items-center py-14 px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-5xl"
            >
              {/* ── Toolbar ── */}
              <div className="flex items-center justify-between mb-10">
                <button
                  onClick={onClose}
                  className="group flex items-center gap-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                  <span className="text-sm font-bold uppercase tracking-wider">Back to Canvas</span>
                </button>

                <div className="flex gap-3">
                  <button
                    onClick={() => void handleExport()}
                    disabled={!reportData || isExporting}
                    className="px-6 py-2.5 rounded-xl bg-blue-500 text-white font-bold text-xs hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    {isExporting ? 'EXPORTING…' : 'EXPORT PDF'}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {!reportData ? (
                <div className="rounded-[28px] border border-white/10 bg-zinc-900/40 p-16 text-center">
                  <p className="text-white font-bold text-lg mb-2">No report yet</p>
                  <p className="text-zinc-500 text-sm">Run a simulation to generate one.</p>
                </div>
              ) : (
                <>
                  {/* ── Title ── */}
                  <div className="mb-9">
                    <div className="flex items-center gap-3 font-mono text-[10px] font-bold tracking-[0.3em] uppercase text-blue-500 mb-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                      Architecture Simulation Report
                    </div>
                    <h1 className="text-white text-4xl md:text-5xl font-bold tracking-tight mb-3">{projectName}</h1>
                    <p className="text-zinc-500 text-sm font-mono">
                      {reportData.createdAt ? new Date(reportData.createdAt).toLocaleString() : new Date().toLocaleString()}
                      {reportData.simulationId ? ` · ${reportData.simulationId.slice(0, 8)}` : ''}
                    </p>
                  </div>

                  {/* ── 01 What to change first ── */}
                  {/*
                    The ranked changes lead, and the letter grade is deliberately
                    secondary. A grade is a percentile against production
                    topologies -- a third of real, working systems score in the
                    bottom band by construction -- so presenting it as the
                    headline invites exactly one bad experience: a working system
                    gets an F and the engineer stops trusting the tool. The
                    ranked diff is also the robust half of the output: the
                    ORDER of the changes survives noise that the absolute class
                    does not.
                  */}
                  <Section
                    step="01"
                    title="What to change first"
                    subtitle="Ranked by the risk each change is predicted to remove. Each number matches a badge on the diagram in section 02."
                  >
                    {topChanges.length === 0 ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                        <ShieldCheck size={20} className="text-emerald-400 shrink-0" />
                        <p className="text-zinc-300 text-sm">
                          No structural change is predicted to reduce risk. Section 06 still lists the
                          operational checks, which are where most young systems actually fail.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {topChanges.map((rec, index) => (
                          <div
                            key={rec.id}
                            className="flex gap-4 rounded-2xl border bg-black/30 p-5"
                            style={{ borderColor: `${PRIORITY_COLOR[rec.priority]}33` }}
                          >
                            <div
                              className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold text-black"
                              style={{ backgroundColor: PRIORITY_COLOR[rec.priority] }}
                            >
                              {index + 1}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-white font-bold text-[15px] mb-1">{rec.title}</h3>
                              <p className="text-zinc-400 text-[13px] leading-relaxed">{rec.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-8 flex flex-col md:flex-row gap-10 items-start">
                      <div className="shrink-0">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mb-1">
                          {gradeIsReliable ? 'Grade' : 'Grade withheld'}
                        </div>
                        <div
                          className="font-bold leading-none"
                          style={{ fontSize: '56px', color: gradeIsReliable ? ink : '#71717A' }}
                        >
                          {gradeIsReliable ? grade : '—'}
                        </div>
                        <div className="mt-3 font-mono text-sm text-zinc-400">
                          {gradeIsReliable
                            ? `model, ${Math.round((reportData.gradeConfidence ?? 0) * 100)}% confidence`
                            : 'no letter claimed'}
                        </div>
                        <div
                          className="mt-3 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest inline-block border"
                          style={{
                            color: passed ? '#34d399' : '#f87171',
                            borderColor: passed ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
                            backgroundColor: passed ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                          }}
                        >
                          {reportData.status}
                        </div>
                      </div>

                      <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                        <Stat label="Total Requests" value={reportData.metrics.totalRequests.toLocaleString()} />
                        <Stat
                          label="Failed"
                          value={reportData.metrics.failedRequests.toLocaleString()}
                          tone={reportData.metrics.failedRequests > 0 ? '#f87171' : undefined}
                        />
                        <Stat label="Success Rate" value={`${(reportData.metrics.successRate * 100).toFixed(2)}%`} />
                        <Stat label="Peak Latency" value={`${Math.round(reportData.metrics.peakLatency)}ms`} />
                        <Stat label="Collapse Point" value={reportData.collapseTime || '—'} />
                        <Stat
                          label="Overall Risk"
                          value={`${Math.round(reportData.intelligence.overallRisk * 100)}%`}
                          tone={reportData.intelligence.overallRisk > 0.6 ? '#f87171' : undefined}
                        />
                      </div>
                    </div>

                    <div
                      className="mt-8 flex items-start gap-3 rounded-2xl border p-4"
                      style={{
                        borderColor: modelAvailable ? 'rgba(59,130,246,0.25)' : 'rgba(245,158,11,0.25)',
                        backgroundColor: modelAvailable ? 'rgba(59,130,246,0.06)' : 'rgba(245,158,11,0.06)',
                      }}
                    >
                      {modelAvailable
                        ? <Cpu size={16} className="text-blue-400 shrink-0 mt-0.5" />
                        : <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />}
                      <div>
                        <div
                          className="text-[10px] font-bold uppercase tracking-widest mb-1"
                          style={{ color: modelAvailable ? '#60a5fa' : '#fbbf24' }}
                        >
                          {modelAvailable ? 'Model + rules' : 'Rules only'}
                        </div>
                        <p className="text-zinc-400 text-[13px] leading-relaxed">
                          {modelAvailable
                            ? 'Graded by the trained topology model, with the rule engine naming the specific failure mode and the simulation supplying runtime behaviour.'
                            : 'The trained topology model was not reachable for this run, so these findings come from the rule engine and the simulation alone. Structural findings such as single points of failure are not available.'}
                        </p>
                      </div>
                    </div>

                    {/*
                      The model reporting that it is out of its depth is worth
                      more than a confident letter. Shown whenever a material
                      share of the diagram uses component kinds the grader has no
                      measured examples of, which is common for real
                      architecture diagrams.
                    */}
                    {!gradeIsReliable && (
                      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
                        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest mb-1 text-amber-400">
                            Why no letter grade
                          </div>
                          <p className="text-zinc-400 text-[13px] leading-relaxed">{withheldReason}</p>
                        </div>
                      </div>
                    )}
                  </Section>

                  {/* ── 02 Architecture + where to change ── */}
                  <Section
                    step="02"
                    title="Your architecture, and where to change it"
                    subtitle="The topology this report was produced from. Numbered badges mark the components each recommendation in section 05 applies to; dashed links are call paths flagged as fragile."
                  >
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <ArchitectureDiagram
                        nodes={reportData.graph?.nodes || []}
                        edges={reportData.graph?.edges || []}
                        annotations={annotations}
                      />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
                      {(['critical', 'high', 'medium', 'low'] as const).map((priority) => {
                        const count = reportData.recommendations.filter((r) => r.priority === priority).length;
                        if (count === 0) return null;
                        return (
                          <div key={priority} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[priority] }} />
                            <span className="text-zinc-400 text-xs font-medium capitalize">
                              {priority} ({count})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  {/* ── 03 Simulation behaviour ── */}
                  <Section
                    step="03"
                    title="Simulation behaviour"
                    subtitle="How the architecture behaved under simulated load."
                  >
                    <div id="iz-latency-chart" className="h-[260px] w-full rounded-2xl border border-white/10 bg-black/40 p-5">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={reportData.latencyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis
                            dataKey="time"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            stroke="#52525B"
                            style={{ fontSize: '10px' }}
                            axisLine={false}
                            tickLine={false}
                            tick={{ dy: 8 }}
                            // ~8 evenly spaced labels; one per sample would overplot.
                            minTickGap={48}
                            tickFormatter={(value: number) => `${Number(value).toFixed(1)}s`}
                          />
                          <YAxis stroke="#52525B" style={{ fontSize: '10px' }} axisLine={false} tickLine={false} tick={{ dx: -6 }} unit="ms" />
                          <Tooltip content={<LatencyTooltip />} />
                          <Line type="monotone" dataKey="latency" stroke="#3B82F6" strokeWidth={2.5} dot={false} animationDuration={900} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-6 rounded-2xl border border-red-500/15 bg-red-500/[0.04] p-6">
                      <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-3">
                        <Activity size={13} />
                        Root cause
                      </div>
                      <p className="text-zinc-300 text-sm leading-relaxed mb-4">{reportData.rootCause.summary}</p>
                      {reportData.rootCause.primaryCause && reportData.rootCause.primaryCause !== 'None' && (
                        <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                          <span className="text-zinc-500 font-bold">Primary cause: </span>
                          {reportData.rootCause.primaryCause}
                        </p>
                      )}
                      {reportData.rootCause.contributingFactors.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {reportData.rootCause.contributingFactors.map((factor, i) => (
                            <div key={i} className="rounded-xl bg-black/40 border border-white/5 px-4 py-2.5 font-mono text-[11px] text-zinc-400">
                              {factor}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* ── 04 Model analysis (GhostTrace, folded in) ── */}
                  <Section
                    step="04"
                    title="Model analysis"
                    subtitle="Structural judgement of the topology from the GNN trained on production microservice traces, combined with the rule engine's failure-mode classification."
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-7">
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-4">
                          Predicted failure mode
                        </div>
                        <p className="text-white text-lg font-bold leading-snug mb-4">
                          {reportData.intelligence.predictedFailureMode}
                        </p>
                        {reportData.intelligence.model && (
                          <div className="grid grid-cols-3 gap-3">
                            {/* The letter lives in the headline and nowhere
                                else. Repeating it here is what let a withheld
                                grade sit next to a confident-looking letter. */}
                            <div>
                              <div className="text-zinc-600 text-[9px] uppercase font-bold tracking-widest mb-1">Risk class</div>
                              <div className="font-mono font-bold text-lg text-zinc-200 capitalize">
                                {reportData.intelligence.model.riskClass}
                              </div>
                            </div>
                            <div>
                              <div className="text-zinc-600 text-[9px] uppercase font-bold tracking-widest mb-1">Confidence</div>
                              <div className="font-mono font-bold text-lg text-zinc-200">
                                {(reportData.intelligence.model.confidence * 100).toFixed(0)}%
                              </div>
                            </div>
                            <div>
                              <div className="text-zinc-600 text-[9px] uppercase font-bold tracking-widest mb-1">Inference</div>
                              <div className="font-mono font-bold text-lg text-zinc-200">
                                {reportData.intelligence.model.inferenceTimeMs != null
                                  ? `${reportData.intelligence.model.inferenceTimeMs}ms`
                                  : '—'}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-4">
                          {classBars.length > 0 ? 'Risk class distribution' : 'Model unavailable'}
                        </div>
                        {classBars.length > 0 ? (
                          <div id="iz-class-chart" className="h-[130px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={classBars} layout="vertical" margin={{ left: 6, right: 24 }}>
                                <XAxis type="number" domain={[0, 100]} hide />
                                <YAxis
                                  type="category"
                                  dataKey="name"
                                  stroke="#52525B"
                                  axisLine={false}
                                  tickLine={false}
                                  width={58}
                                  style={{ fontSize: '11px', textTransform: 'capitalize' }}
                                />
                                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                                  {classBars.map((entry) => (
                                    <Cell
                                      key={entry.name}
                                      fill={entry.name === 'high' ? '#ef4444' : entry.name === 'medium' ? '#eab308' : '#10b981'}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <p className="text-zinc-500 text-sm leading-relaxed">
                            Start the inference server to include the trained model's grading in this report.
                          </p>
                        )}
                      </div>
                    </div>

                    {reportData.intelligence.narrative && (
                      <div className="rounded-2xl border border-white/10 bg-black/40 p-6 mb-7">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-3">Analysis</div>
                        <p className="text-zinc-300 text-sm leading-relaxed">{reportData.intelligence.narrative}</p>
                      </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-black/40 p-6 mb-7">
                      <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-5">
                        Component risk
                      </div>
                      {riskBars.length === 0 ? (
                        <p className="text-zinc-500 text-sm leading-relaxed">
                          No component scored above zero on the risk heuristics for this run.
                          Structural findings, if any, are listed below.
                        </p>
                      ) : (
                        <div id="iz-risk-chart" style={{ height: Math.max(70, riskBars.length * 34) }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={riskBars} layout="vertical" margin={{ left: 6, right: 30 }}>
                              <XAxis type="number" domain={[0, 100]} hide />
                              <YAxis
                                type="category"
                                dataKey="name"
                                stroke="#a1a1aa"
                                axisLine={false}
                                tickLine={false}
                                width={130}
                                style={{ fontSize: '11px' }}
                              />
                              <Bar dataKey="risk" radius={[0, 6, 6, 0]} barSize={16}>
                                {riskBars.map((entry, i) => (
                                  <Cell key={i} fill={entry.risk > 60 ? '#ef4444' : entry.risk > 30 ? '#eab308' : '#3b82f6'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    {reportData.intelligence.nodeFindings.length > 0 && (
                      <div className="space-y-3">
                        {reportData.intelligence.nodeFindings.slice(0, 8).map((finding) => (
                          <div key={finding.nodeId} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                              <div className="flex items-center gap-3">
                                <span className="text-white font-bold">{finding.label}</span>
                                {finding.isSinglePointOfFailure && (
                                  <span className="px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-400 text-[9px] font-bold uppercase tracking-wider">
                                    Single point of failure
                                  </span>
                                )}
                                {finding.role && (
                                  <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">{finding.role}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 font-mono text-[11px]">
                                <span className="text-zinc-500">
                                  risk <span className="text-zinc-300 font-bold">{Math.round(finding.riskScore * 100)}%</span>
                                </span>
                                {finding.blastRadius > 0 && (
                                  <span className="text-zinc-500">
                                    blast <span className="text-zinc-300 font-bold">{Math.round(finding.blastRadius * 100)}%</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            {finding.reasons.length > 0 && (
                              <p className="text-zinc-400 text-[13px] leading-relaxed">{finding.reasons.join(' ')}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {reportData.intelligence.edgeFindings.some((f) => f.riskScore > 0) && (
                      <div className="mt-7">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-4">
                          Riskiest call paths
                        </div>
                        <div className="space-y-2">
                          {reportData.intelligence.edgeFindings
                            .filter((finding) => finding.riskScore > 0)
                            .slice(0, 5)
                            .map((finding) => (
                            <div
                              key={finding.edgeId}
                              className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/30 px-5 py-3"
                            >
                              <div className="flex items-center gap-2 text-sm text-zinc-300 min-w-0">
                                <span className="truncate">{finding.sourceLabel}</span>
                                <ArrowRight size={13} className="text-zinc-600 shrink-0" />
                                <span className="truncate">{finding.targetLabel}</span>
                              </div>
                              <span
                                className="font-mono text-xs font-bold shrink-0"
                                style={{ color: finding.riskScore > 0.6 ? '#f87171' : finding.riskScore > 0.3 ? '#fbbf24' : '#60a5fa' }}
                              >
                                {Math.round(finding.riskScore * 100)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Section>

                  {/* ── 05 Recommendations ── */}
                  <Section
                    step="05"
                    title="Recommendations"
                    subtitle="Ordered by priority. Each number corresponds to a badge on the diagram in section 02."
                  >
                    {reportData.recommendations.length === 0 ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                        <ShieldCheck size={20} className="text-emerald-400 shrink-0" />
                        <p className="text-zinc-300 text-sm">
                          No changes recommended. This architecture held up under the simulated load.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {reportData.recommendations.map((rec, index) => (
                          <div
                            key={rec.id}
                            className="rounded-2xl border bg-black/30 p-6"
                            style={{ borderColor: `${PRIORITY_COLOR[rec.priority]}33` }}
                          >
                            <div className="flex gap-4">
                              <div
                                className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold text-black"
                                style={{ backgroundColor: PRIORITY_COLOR[rec.priority] }}
                              >
                                {index + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                                  <h3 className="text-white font-bold text-[15px]">{rec.title}</h3>
                                  <span
                                    className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider"
                                    style={{
                                      color: PRIORITY_COLOR[rec.priority],
                                      backgroundColor: `${PRIORITY_COLOR[rec.priority]}1a`,
                                    }}
                                  >
                                    {rec.priority}
                                  </span>
                                  <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">
                                    {ORIGIN_LABEL[rec.origin] || rec.origin}
                                  </span>
                                </div>
                                <p className="text-zinc-400 text-[13.5px] leading-relaxed mb-3">{rec.detail}</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="inline-flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5">
                                    <span className="text-zinc-600 text-[9px] font-bold uppercase tracking-widest">Change</span>
                                    <span className="text-zinc-200 text-xs font-bold">{rec.action}</span>
                                  </div>
                                  {onApplyChange && rec.kind && rec.targetNodeIds.length > 0 && (
                                    <button
                                      onClick={() => onApplyChange(rec.id)}
                                      disabled={Boolean(applyingRecommendationId)}
                                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                      style={{
                                        color: PRIORITY_COLOR[rec.priority],
                                        borderColor: `${PRIORITY_COLOR[rec.priority]}55`,
                                        backgroundColor: `${PRIORITY_COLOR[rec.priority]}14`,
                                      }}
                                    >
                                      {applyingRecommendationId === rec.id
                                        ? 'Applying...'
                                        : 'Apply this change'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  {/* ── 06 Operational checks ── */}
                  {/*
                    Deliberately its own section, visually distinct from the
                    recommendations above. These are rules, not model output:
                    they predict nothing and carry no measured risk delta.
                    Letting them sit among the model's counterfactual results
                    would lend them credibility they have not earned -- and
                    would bury the results that did earn it.

                    They are here because the grader is honestly narrow. It
                    reads call-graph shape, and what most often takes a young
                    system down is not shape: no backups, no rate limit, no way
                    to see what is happening when it breaks.
                  */}
                  {checks.length > 0 && (
                    <Section
                      step="06"
                      title="Operational checks"
                      subtitle="Deterministic checks, not model predictions. These cover the failures that most often take young systems down, which topology alone cannot see."
                    >
                      <div className="space-y-2">
                        {checks.map((check) => {
                          const tone =
                            check.status === 'fail' ? '#f87171'
                              : check.status === 'warn' ? '#fbbf24'
                                : '#34d399';
                          return (
                            <div
                              key={check.id}
                              className="flex gap-4 rounded-xl border bg-black/30 px-5 py-4"
                              style={{ borderColor: `${tone}26` }}
                            >
                              <span
                                className="font-mono text-[9px] font-bold uppercase tracking-widest shrink-0 pt-1"
                                style={{ color: tone, width: '2.6rem' }}
                              >
                                {check.status}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <h3 className="text-white font-bold text-[14px]">{check.title}</h3>
                                  <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">
                                    {check.category}
                                  </span>
                                </div>
                                <p className="text-zinc-400 text-[13px] leading-relaxed">{check.detail}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Section>
                  )}

                  {/* ── 07 Simulation rationale ──
                      This explains the SIMULATION's resilience score, not the
                      letter grade above it. The letter comes from the model and
                      is explained by its confidence and coverage. Labelling this
                      "grading rationale" invited the two to be read as one. */}
                  {reportData.gradeRationale && reportData.gradeRationale.length > 0 && (
                    <Section
                      step="06"
                      title="Simulation rationale"
                      subtitle={`How the simulated resilience score of ${reportData.simulatedResilienceScore}/100 was arrived at. This is a separate measurement from the letter grade.`}
                    >
                      <div className="space-y-2">
                        {reportData.gradeRationale.map((line, i) => (
                          <p key={i} className="font-mono text-[11.5px] text-zinc-400 leading-relaxed rounded-xl bg-black/40 border border-white/5 px-4 py-3">
                            {line}
                          </p>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* ── 07 Review ── */}
                  {reportData.narrativeReview && (
                    <Section step="07" title="Review summary">
                      <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {reportData.narrativeReview}
                      </p>
                    </Section>
                  )}

                  {/* ── Provenance ── */}
                  <div className="rounded-[28px] border border-white/10 bg-zinc-900/30 p-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <div className="text-zinc-600 text-[9px] uppercase font-bold tracking-widest mb-1.5">Universe Seed</div>
                      <div className="text-zinc-400 font-mono text-xs break-all">{reportData.universeSeed}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600 text-[9px] uppercase font-bold tracking-widest mb-1.5">Stable Hash</div>
                      <div className="text-zinc-400 font-mono text-xs break-all">{reportData.stableHash}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600 text-[9px] uppercase font-bold tracking-widest mb-1.5">Analysis Source</div>
                      <div className="text-zinc-400 font-mono text-xs">{reportData.intelligence.source}</div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
