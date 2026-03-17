import { motion, AnimatePresence } from 'motion/react';
import { X, Download, ArrowLeft, Check, Zap, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ReportViewProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  reportData: {
    simulationId: string;
    universeSeed: string;
    stableHash: string;
    grade: string;
    gradeColor: string;
    status: string;
    statusColor: string;
    totalRequests: number;
    failedRequests: number;
    peakLatency: number;
    collapseTime: string;
    rootCause: {
      summary: string;
      details: Array<{ label: string; value: string }>;
    };
    recommendations: string[];
    latencyData: Array<{ time: number; latency: number }>;
  };
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl">
        <p className="text-zinc-500 text-[10px] font-mono font-bold uppercase tracking-widest mb-2">
          Time: {data.payload.time}s
        </p>
        <p className={`font-mono text-sm font-bold ${data.value > 800 ? 'text-red-400' : 'text-blue-400'}`}>
          Latency: {data.value}ms
        </p>
        {data.value > 800 && (
          <div className="mt-2 flex items-center gap-1.5 text-red-500/80 text-[10px] font-bold uppercase">
             <AlertTriangle size={10} />
             Critical Threshold
          </div>
        )}
      </div>
    );
  }
  return null;
};

export function ReportView({ isOpen, onClose, projectName, reportData }: ReportViewProps) {
  const handleDownloadPDF = () => {
    console.log('Downloading PDF report...');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 bg-black backdrop-blur-2xl"
          >
             {/* Background Atmosphere */}
             <div className="absolute inset-0 z-0 pointer-events-none">
                <img src="/night-hero.png" alt="Atmosphere" className="absolute inset-0 object-cover w-full h-full opacity-40 mix-blend-screen" />
                <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
             </div>

             {/* Grid Overlay */}
             <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                backgroundImage: 'repeating-linear-gradient(to right, rgba(59,130,246,0.1) 0px, rgba(59,130,246,0.1) 1px, transparent 1px, transparent 80px), repeating-linear-gradient(to bottom, rgba(59,130,246,0.1) 0px, rgba(59,130,246,0.1) 1px, transparent 1px, transparent 80px)',
                backgroundSize: '80px 80px'
             }} />
          </motion.div>

          {/* Scrollable Container */}
          <div className="relative min-h-screen flex flex-col items-center py-20 px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-4xl"
            >
              {/* Top Navigation */}
              <div className="flex items-center justify-between mb-12">
                 <button
                   onClick={onClose}
                   className="group flex items-center gap-2 text-zinc-500 hover:text-white transition-colors"
                 >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-bold uppercase tracking-wider">Back to Canvas</span>
                 </button>

                 <div className="flex gap-4">
                    <button
                      onClick={handleDownloadPDF}
                      className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-xs hover:bg-white/10 transition-all flex items-center gap-2"
                    >
                       <Download size={14} />
                       EXPORT PDF
                    </button>
                    <button
                      onClick={onClose}
                      className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all"
                    >
                       <X size={18} />
                    </button>
                 </div>
              </div>

              {/* Header */}
              <div className="mb-12">
                 <div className="flex items-center gap-3 font-mono text-[10px] font-bold tracking-[0.3em] uppercase text-blue-500 mb-4">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    Simulation Report // Deterministic Output
                 </div>
                 <h1 className="text-white text-5xl font-bold tracking-tight mb-6">
                    {projectName}
                 </h1>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                       <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Simulation ID</span>
                       <div className="text-zinc-300 font-mono text-sm">{reportData.simulationId}</div>
                    </div>
                    <div className="space-y-1">
                       <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Universe Seed</span>
                       <div className="text-zinc-300 font-mono text-sm">{reportData.universeSeed}</div>
                    </div>
                    <div className="space-y-1">
                       <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Stable Hash</span>
                       <div className="text-zinc-300 font-mono text-xs truncate">{reportData.stableHash}</div>
                    </div>
                 </div>
              </div>

              {/* Main Scorecard (Glassmorphism) */}
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="mb-10 p-10 rounded-[32px] bg-zinc-900/40 backdrop-blur-3xl border border-white/10 shadow-2xl relative overflow-hidden"
              >
                 <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
                 
                 <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-12">
                    {/* Grade Section */}
                    <div className="text-center md:text-left">
                       <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mb-2">Architecture Grade</div>
                       <motion.div
                         initial={{ opacity: 0, scale: 0.5 }}
                         animate={{ opacity: 1, scale: 1 }}
                         transition={{ type: 'spring', damping: 10, delay: 0.4 }}
                         className="text-white font-bold leading-none"
                         style={{ fontSize: '120px', textShadow: '0 0 40px rgba(59,130,246,0.3)' }}
                       >
                          {reportData.grade}
                       </motion.div>
                       <div className={`mt-4 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest inline-block ${reportData.status.includes('PASS') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                          {reportData.status}
                       </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="flex-1 grid grid-cols-2 gap-8 md:pt-6">
                       {[
                         { label: 'Total Requests', value: reportData.totalRequests.toLocaleString(), icon: <Zap size={14} className="text-blue-500" /> },
                         { label: 'Peak Latency', value: `${reportData.peakLatency}ms`, icon: <Zap size={14} className="text-blue-500" /> },
                         { label: 'Failed Traffic', value: `${reportData.failedRequests.toLocaleString()}`, icon: <AlertTriangle size={14} className="text-red-500" /> },
                         { label: 'Collapse Point', value: reportData.collapseTime, icon: <AlertTriangle size={14} className="text-red-500" /> },
                       ].map((stat, i) => (
                         <div key={i} className="space-y-1">
                            <div className="flex items-center gap-2 text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
                               {stat.icon}
                               {stat.label}
                            </div>
                            <div className="text-white text-2xl font-bold font-mono tracking-tight">{stat.value}</div>
                         </div>
                       ))}
                    </div>
                 </div>
              </motion.div>

              {/* Analysis & Chart Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                 
                 {/* Left: Chart (Big) */}
                 <div className="lg:col-span-3 space-y-6">
                    <div className="p-8 rounded-[32px] bg-zinc-900/40 backdrop-blur-3xl border border-white/5">
                       <h3 className="text-white font-bold text-lg mb-8">Performance Spectrum</h3>
                       <div className="h-[280px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={reportData.latencyData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                              <XAxis 
                                dataKey="time" 
                                stroke="#52525B" 
                                style={{ fontSize: '10px', fontBold: true }}
                                axisLine={false}
                                tickLine={false}
                                tick={{ dy: 10 }}
                              />
                              <YAxis 
                                stroke="#52525B" 
                                style={{ fontSize: '10px' }}
                                axisLine={false}
                                tickLine={false}
                                tick={{ dx: -10 }}
                              />
                              <Tooltip content={<CustomTooltip />} />
                              <Line
                                type="monotone"
                                dataKey="latency"
                                stroke="#3B82F6"
                                strokeWidth={3}
                                dot={(props: any) => {
                                  if (props.payload.latency > 800) {
                                    return <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="#EF4444" stroke="none" />;
                                  }
                                  return null;
                                }}
                                animationDuration={1500}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                       </div>
                       <p className="mt-6 text-zinc-500 text-xs italic font-medium">
                          Deterministic projection of throughput under high-concurrency stress.
                       </p>
                    </div>

                    {/* Recommendations */}
                    <div className="p-8 rounded-[32px] bg-blue-500/5 border border-blue-500/10">
                       <h3 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
                          <Check size={20} className="text-blue-500" />
                          Recommended Mitigations
                       </h3>
                       <div className="space-y-4">
                          {reportData.recommendations.map((rec, i) => (
                            <div key={i} className="flex gap-4 group">
                               <div className="h-6 w-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 text-[10px] font-bold group-hover:bg-blue-500 group-hover:text-white transition-all">
                                  {i+1}
                               </div>
                               <p className="text-zinc-300 text-sm leading-relaxed flex-1">
                                  {rec}
                               </p>
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>

                 {/* Right: Insights (Small) */}
                 <div className="lg:col-span-2 space-y-6">
                    <div className="p-8 rounded-[32px] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 h-full">
                       <div className="text-red-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-4">Root Cause Analysis</div>
                       <h3 className="text-white font-bold text-xl mb-6 leading-tight">Critical Saturation Detected</h3>
                       <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                          {reportData.rootCause.summary}
                       </p>

                       <div className="space-y-3">
                          {reportData.rootCause.details.map((detail, i) => (
                             <div key={i} className="p-4 rounded-2xl bg-black/40 border border-white/5">
                                <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1">{detail.label}</div>
                                <div className="text-zinc-200 font-bold text-sm">{detail.value}</div>
                             </div>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>

              {/* Final Visual Disclaimer */}
              <div className="mt-20 text-center opacity-20 select-none">
                 <div className="font-mono text-[9px] text-zinc-500 tracking-[0.5em] uppercase font-bold mb-2">InfraZero // Autonomous SRE</div>
                 <div className="font-mono text-[8px] text-zinc-300 tracking-[0.2em] uppercase">SYSTEM_STATE: REPLICATED // HASH_CONSISTENCY: 100%</div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}