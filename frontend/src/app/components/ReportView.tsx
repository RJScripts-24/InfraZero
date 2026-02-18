import { motion, AnimatePresence } from 'motion/react';
import { X, Download, ArrowLeft } from 'lucide-react';
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
      <div
        style={{
          backgroundColor: '#061B1A',
          border: '1px solid rgba(0,255,170,0.3)',
          borderRadius: '2px',
          padding: '8px 12px',
        }}
      >
        <p style={{ color: '#8FA9A3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', marginBottom: '4px' }}>
          Time: {data.payload.time}s
        </p>
        <p style={{ color: data.value > 800 ? '#FF3B3B' : '#00FFA3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
          Latency: {data.value}ms
        </p>
        {data.value > 800 && (
          <p style={{ color: '#FF3B3B', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' }}>
            Failure threshold exceeded
          </p>
        )}
      </div>
    );
  }
  return null;
};

export function ReportView({ isOpen, onClose, projectName, reportData }: ReportViewProps) {
  const handleDownloadPDF = () => {
    // Mock PDF download
    console.log('Downloading PDF report...');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'linear' }}
            className="fixed inset-0 z-50"
            style={{ backgroundColor: 'rgba(6, 27, 26, 0.95)' }}
          >
            {/* Grid overlay */}
            <div
              className="fixed inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to right, rgba(0,255,170,0.06) 0px, rgba(0,255,170,0.06) 1px, transparent 1px, transparent 80px)',
                backgroundSize: '80px 100%',
              }}
            />

            {/* Scrollable Content */}
            <div className="h-full overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.4, ease: 'linear' }}
                className="relative"
                style={{
                  maxWidth: '960px',
                  margin: '0 auto',
                  padding: '80px 40px',
                }}
              >
                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="absolute top-8 right-8 p-2 transition-colors"
                  style={{ color: '#8FA9A3' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#00FFA3')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#8FA9A3')}
                >
                  <X size={24} />
                </button>

                {/* Header */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'linear', delay: 0.1 }}
                  className="mb-8"
                >
                  <h1
                    style={{
                      color: '#E6F1EF',
                      fontSize: '32px',
                      fontWeight: 700,
                      marginBottom: '16px',
                    }}
                  >
                    Simulation Report: {projectName}
                  </h1>
                  <div
                    style={{
                      color: '#8FA9A3',
                      fontSize: '12px',
                      fontFamily: 'JetBrains Mono, monospace',
                      lineHeight: '1.8',
                    }}
                  >
                    <div>SIMULATION ID: {reportData.simulationId}</div>
                    <div>UNIVERSE SEED: {reportData.universeSeed}</div>
                    <div>STABLE HASH: {reportData.stableHash}</div>
                  </div>
                  <div
                    className="mt-6"
                    style={{
                      height: '1px',
                      backgroundColor: 'rgba(0,255,170,0.2)',
                    }}
                  />
                </motion.div>

                {/* Scorecard */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'linear', delay: 0.2 }}
                  className="mb-12 border p-8"
                  style={{
                    backgroundColor: '#0B2321',
                    borderColor: 'rgba(0,255,170,0.25)',
                    borderRadius: '4px',
                  }}
                >
                  <div className="flex items-start justify-between">
                    {/* Left - Grade */}
                    <div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, ease: 'linear', delay: 0.4 }}
                        style={{
                          color: reportData.gradeColor,
                          fontSize: '96px',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 700,
                          lineHeight: 1,
                          marginBottom: '8px',
                        }}
                      >
                        {reportData.grade}
                      </motion.div>
                      <div
                        style={{
                          color: '#8FA9A3',
                          fontSize: '11px',
                          fontFamily: 'JetBrains Mono, monospace',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                        }}
                      >
                        ARCHITECTURE GRADE
                      </div>
                    </div>

                    {/* Right - Status */}
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          color: reportData.statusColor,
                          fontSize: '18px',
                          fontWeight: 700,
                          marginBottom: '16px',
                        }}
                      >
                        {reportData.status}
                      </div>
                      <div
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '13px',
                          lineHeight: '1.8',
                        }}
                      >
                        <div>
                          <span style={{ color: '#8FA9A3' }}>Total Requests: </span>
                          <span style={{ color: '#00FFA3' }}>{reportData.totalRequests.toLocaleString()}</span>
                        </div>
                        <div>
                          <span style={{ color: '#8FA9A3' }}>Failed Requests: </span>
                          <span style={{ color: '#FF3B3B' }}>{reportData.failedRequests.toLocaleString()}</span>
                        </div>
                        <div>
                          <span style={{ color: '#8FA9A3' }}>Peak Latency: </span>
                          <span style={{ color: '#00FFA3' }}>{reportData.peakLatency}ms</span>
                        </div>
                        <div>
                          <span style={{ color: '#8FA9A3' }}>System Collapse Time: </span>
                          <span style={{ color: '#00FFA3' }}>{reportData.collapseTime}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Root Cause Analysis */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'linear', delay: 0.3 }}
                  className="mb-12"
                >
                  <div
                    className="mb-4"
                    style={{
                      color: '#00FFA3',
                      fontSize: '13px',
                      fontFamily: 'JetBrains Mono, monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontWeight: 600,
                    }}
                  >
                    ROOT CAUSE ANALYSIS
                  </div>
                  <div
                    className="mb-4"
                    style={{
                      height: '1px',
                      backgroundColor: 'rgba(0,255,170,0.2)',
                    }}
                  />
                  <p
                    style={{
                      color: '#E6F1EF',
                      fontSize: '15px',
                      lineHeight: '1.8',
                      marginBottom: '24px',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: reportData.rootCause.summary.replace(
                        /(Single Point of Failure|Load Balancer|cascading downstream failures)/g,
                        '<span style="color: #00FFA3; font-weight: 600;">$1</span>'
                      ),
                    }}
                  />
                  <div
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '13px',
                      lineHeight: '1.8',
                    }}
                  >
                    {reportData.rootCause.details.map((detail, i) => (
                      <div key={i} className="flex items-start gap-3 mb-2">
                        <span style={{ color: '#00FFA3' }}>•</span>
                        <div>
                          <span style={{ color: '#8FA9A3' }}>{detail.label}: </span>
                          <span style={{ color: '#00FFA3' }}>{detail.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Latency Graph */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'linear', delay: 0.4 }}
                  className="mb-12"
                >
                  <div
                    className="mb-4"
                    style={{
                      color: '#00FFA3',
                      fontSize: '13px',
                      fontFamily: 'JetBrains Mono, monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontWeight: 600,
                    }}
                  >
                    LATENCY & TRAFFIC ANALYSIS
                  </div>
                  <div
                    className="mb-4"
                    style={{
                      height: '1px',
                      backgroundColor: 'rgba(0,255,170,0.2)',
                    }}
                  />
                  <div
                    className="border p-6"
                    style={{
                      backgroundColor: '#0B2321',
                      borderColor: 'rgba(0,255,170,0.2)',
                      borderRadius: '4px',
                    }}
                  >
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={reportData.latencyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,170,0.08)" />
                        <XAxis
                          dataKey="time"
                          stroke="#8FA9A3"
                          style={{
                            fontSize: '11px',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                          label={{
                            value: 'Time (seconds)',
                            position: 'insideBottom',
                            offset: -5,
                            style: { fill: '#8FA9A3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' },
                          }}
                        />
                        <YAxis
                          stroke="#8FA9A3"
                          style={{
                            fontSize: '11px',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                          label={{
                            value: 'Latency (ms)',
                            angle: -90,
                            position: 'insideLeft',
                            style: { fill: '#8FA9A3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' },
                          }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="latency"
                          stroke="#00FFA3"
                          strokeWidth={2}
                          dot={(props: any) => {
                            const { cx, cy, payload, key } = props;
                            if (payload.latency > 800) {
                              return (
                                <circle
                                  key={key}
                                  cx={cx}
                                  cy={cy}
                                  r={5}
                                  fill="#FF3B3B"
                                  stroke="#FF3B3B"
                                  strokeWidth={2}
                                />
                              );
                            }
                            return null;
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <p
                      className="mt-4"
                      style={{
                        color: '#8FA9A3',
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontStyle: 'italic',
                      }}
                    >
                      Latency spike correlates with load balancer saturation.
                    </p>
                  </div>
                </motion.div>

                {/* Failure Cascade Visual */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'linear', delay: 0.5 }}
                  className="mb-12"
                >
                  <div
                    className="border p-6"
                    style={{
                      backgroundColor: '#0B2321',
                      borderColor: 'rgba(0,255,170,0.2)',
                      borderRadius: '4px',
                    }}
                  >
                    <div className="flex items-center justify-center gap-8">
                      {/* Load Balancer - Failed */}
                      <div className="text-center">
                        <div
                          className="border-2 px-6 py-4 mb-2"
                          style={{
                            borderColor: '#FF3B3B',
                            backgroundColor: 'rgba(255,59,59,0.1)',
                            borderRadius: '2px',
                          }}
                        >
                          <div
                            style={{
                              color: '#FF3B3B',
                              fontSize: '13px',
                              fontFamily: 'JetBrains Mono, monospace',
                              fontWeight: 600,
                            }}
                          >
                            Load Balancer
                          </div>
                        </div>
                        <div
                          style={{
                            color: '#FF3B3B',
                            fontSize: '10px',
                            fontFamily: 'JetBrains Mono, monospace',
                            textTransform: 'uppercase',
                          }}
                        >
                          Failure Origin
                        </div>
                      </div>

                      {/* Arrow */}
                      <div style={{ color: '#FF3B3B', fontSize: '24px' }}>→</div>

                      {/* API Services - Degraded */}
                      <div className="text-center">
                        <div
                          className="border px-6 py-4"
                          style={{
                            borderColor: 'rgba(0,255,170,0.3)',
                            backgroundColor: '#061B1A',
                            borderRadius: '2px',
                          }}
                        >
                          <div
                            style={{
                              color: '#8FA9A3',
                              fontSize: '13px',
                              fontFamily: 'JetBrains Mono, monospace',
                            }}
                          >
                            API Services
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div style={{ color: '#8FA9A3', fontSize: '24px' }}>→</div>

                      {/* Database - OK */}
                      <div className="text-center">
                        <div
                          className="border px-6 py-4"
                          style={{
                            borderColor: 'rgba(0,255,170,0.3)',
                            backgroundColor: '#061B1A',
                            borderRadius: '2px',
                          }}
                        >
                          <div
                            style={{
                              color: '#8FA9A3',
                              fontSize: '13px',
                              fontFamily: 'JetBrains Mono, monospace',
                            }}
                          >
                            Database
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Recommendations */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'linear', delay: 0.6 }}
                  className="mb-12"
                >
                  <div
                    className="mb-4"
                    style={{
                      color: '#00FFA3',
                      fontSize: '13px',
                      fontFamily: 'JetBrains Mono, monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontWeight: 600,
                    }}
                  >
                    RECOMMENDED FIXES
                  </div>
                  <div
                    className="mb-4"
                    style={{
                      height: '1px',
                      backgroundColor: 'rgba(0,255,170,0.2)',
                    }}
                  />
                  <div
                    style={{
                      fontSize: '15px',
                      lineHeight: '1.8',
                    }}
                  >
                    {reportData.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-3 mb-3">
                        <span style={{ color: '#00FFA3', fontSize: '18px' }}>•</span>
                        <span
                          style={{ color: '#E6F1EF' }}
                          dangerouslySetInnerHTML={{
                            __html: rec.replace(
                              /(horizontal scaling|circuit breaker|Redis caching|retry backoff)/gi,
                              '<span style="color: #00FFA3; font-weight: 600;">$1</span>'
                            ),
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Footer Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'linear', delay: 0.7 }}
                >
                  <div
                    className="mb-6"
                    style={{
                      height: '1px',
                      backgroundColor: 'rgba(0,255,170,0.2)',
                    }}
                  />
                  <div className="flex items-center justify-end gap-4">
                    <button
                      onClick={onClose}
                      className="flex items-center gap-2 border px-5 py-3 transition-all"
                      style={{
                        borderColor: 'rgba(0,255,170,0.3)',
                        color: '#00FFA3',
                        backgroundColor: 'transparent',
                        borderRadius: '2px',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#00FFA3';
                        e.currentTarget.style.backgroundColor = '#0F2E2B';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <ArrowLeft size={16} />
                      BACK TO EDITOR
                    </button>

                    <button
                      onClick={handleDownloadPDF}
                      className="flex items-center gap-2 px-5 py-3 transition-all"
                      style={{
                        backgroundColor: '#00FFA3',
                        color: '#061B1A',
                        borderRadius: '2px',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#00D98C')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00FFA3')}
                    >
                      <Download size={16} />
                      DOWNLOAD PDF
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '10px',
                          opacity: 0.8,
                          marginLeft: '4px',
                        }}
                      >
                        EXPORT
                      </span>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}