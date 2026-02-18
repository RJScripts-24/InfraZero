import { useEffect, useRef, useState, useCallback } from 'react';

type LogEntry = { text: string; level: 'info' | 'warn' | 'error' | 'success' | 'cmd' };

const LOG_SEQUENCES: LogEntry[][] = [
  [
    { text: '$ infra-zero simulate --topology distributed --users 50000', level: 'cmd' },
    { text: '[00:00:01] Parsing architecture graph...', level: 'info' },
    { text: '[00:00:02] Nodes: 8 | Edges: 14 | Services: 6', level: 'info' },
    { text: '[00:00:03] Compiling to Rust WASM module...', level: 'info' },
    { text: '[00:00:04] ✓ Compilation complete (142ms)', level: 'success' },
    { text: '[00:00:05] Initializing Monte Carlo engine...', level: 'info' },
    { text: '[00:15:23] Load test initiated: 50k concurrent users', level: 'info' },
    { text: '[00:15:24] Traffic spike detected — p99 latency: 240ms', level: 'info' },
    { text: '[00:15:25] Cache miss ratio: 78%', level: 'info' },
    { text: '[00:15:26] [FATAL] Cascading Failure detected', level: 'error' },
    { text: '[00:15:26] Database connection pool exhausted', level: 'error' },
    { text: '[00:15:27] Auth service unresponsive', level: 'error' },
    { text: '[00:15:28] Circuit breaker triggered', level: 'info' },
    { text: '[00:15:30] ✓ System recovered', level: 'success' },
    { text: '[00:15:31] Generating post-mortem report...', level: 'info' },
    { text: '[00:15:32] SHA-256: 4f3d8a9b2c1e7f6a5d0e3c8b1a9f2e4d', level: 'info' },
    { text: '[00:15:33] ✓ Simulation complete. Report saved.', level: 'success' },
  ],
  [
    { text: '$ infra-zero deploy --env production', level: 'cmd' },
    { text: '[00:00:01] Resolving dependency graph...', level: 'info' },
    { text: '[00:00:02] Pulling base image: node:20-alpine', level: 'info' },
    { text: '[00:00:03] ✓ Image pulled (1.2s)', level: 'success' },
    { text: '[00:00:04] Building Docker layer cache...', level: 'info' },
    { text: '[00:00:06] RUN npm ci --production', level: 'info' },
    { text: '[00:00:08] ✓ Dependencies installed (2.4s)', level: 'success' },
    { text: '[00:00:09] Compiling TypeScript...', level: 'info' },
    { text: '[00:00:10] ✓ Build complete → dist/ (874ms)', level: 'success' },
    { text: '[00:00:11] Pushing image to registry...', level: 'info' },
    { text: '[00:00:13] ✓ Pushed: registry.infra-zero.io/api:sha-4f3d8a9', level: 'success' },
    { text: '[00:00:14] Rolling out to 3 replicas...', level: 'info' },
    { text: '[00:00:15] ✓ api-pod-1 → Running', level: 'success' },
    { text: '[00:00:16] ✓ api-pod-2 → Running', level: 'success' },
    { text: '[00:00:17] ✓ api-pod-3 → Running', level: 'success' },
    { text: '[00:00:18] ✓ Deployment complete. All health checks passed.', level: 'success' },
  ],
  [
    { text: '$ infra-zero health-check --all', level: 'cmd' },
    { text: '[00:00:01] Checking 12 services...', level: 'info' },
    { text: '[00:00:02] ✓ api-gateway → healthy (32ms)', level: 'success' },
    { text: '[00:00:02] ✓ auth-service → healthy (18ms)', level: 'success' },
    { text: "[00:00:03] [WARN] queue-worker → degraded (p99: 820ms)", level: 'warn' },
    { text: '[00:00:03] ✓ postgres-primary → healthy (5ms)', level: 'success' },
    { text: "[00:00:04] [WARN] redis-cluster → high memory (87%)", level: 'warn' },
    { text: '[00:00:05] ✓ search-service → healthy (44ms)', level: 'success' },
    { text: '[00:00:06] 10/12 services healthy | 2 degraded', level: 'info' },
    { text: '[00:00:07] Triggering auto-remediation for queue-worker...', level: 'info' },
    { text: '[00:00:09] ✓ queue-worker restarted → healthy (61ms)', level: 'success' },
    { text: '[00:00:10] Flushing redis-cluster stale keys...', level: 'info' },
    { text: '[00:00:11] ✓ redis-cluster → memory 42%', level: 'success' },
    { text: '[00:00:12] ✓ All 12 services healthy.', level: 'success' },
  ],
];

const LINE_DELAY = 170;
const SEQUENCE_PAUSE = 800;
const MAX_LINES = 30;

export default function TerminalOutput({
  className = '',
  style = {},
}: { className?: string; style?: React.CSSProperties }) {
  const [visibleLines, setVisibleLines] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqIdx = useRef(0);
  const lineIdx = useRef(0);

  const getColor = (level: LogEntry['level']) => {
    if (level === 'cmd' || level === 'success') return '#00FFA3';
    if (level === 'warn') return '#FFB03B';
    if (level === 'error') return '#FF3B3B';
    return '#8FA9A3';
  };

  const tick = useCallback(() => {
    const seq = LOG_SEQUENCES[seqIdx.current];
    if (lineIdx.current >= seq.length) {
      timerRef.current = setTimeout(() => {
        seqIdx.current = (seqIdx.current + 1) % LOG_SEQUENCES.length;
        lineIdx.current = 0;
        tick();
      }, SEQUENCE_PAUSE);
      return;
    }
    const entry = seq[lineIdx.current];
    lineIdx.current += 1;
    setVisibleLines((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
    timerRef.current = setTimeout(tick, LINE_DELAY);
  }, []);

  useEffect(() => {
    timerRef.current = setTimeout(tick, LINE_DELAY);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [tick]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleLines]);

  return (
    <div
      className={className}
      style={{
        background: '#020908',
        border: '1px solid rgba(0,255,170,0.1)',
        color: '#8FA9A3',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 'clamp(11px, 0.85vw, 15px)',
        height: 'clamp(400px, 38vw, 620px)',
        padding: 'clamp(16px, 1.4vw, 26px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <style>{`
        @keyframes _terminal_blink { 0%,100%{opacity:1} 50%{opacity:0} }
        ._terminal_cursor { animation: _terminal_blink 1s step-start infinite; }
        ._terminal_scroll::-webkit-scrollbar { display: none; }
        ._terminal_scroll { scrollbar-width: none; }
      `}</style>
      <div ref={scrollRef} className="_terminal_scroll" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {visibleLines.map((entry, i) => (
            <div
              key={i}
              style={{
                color: getColor(entry.level),
                fontWeight: entry.level === 'error' ? 600 : 400,
                lineHeight: 1.6,
                whiteSpace: 'pre',
              }}
            >
              {entry.text}
            </div>
          ))}
          <span className="_terminal_cursor" style={{ color: '#00FFA3', userSelect: 'none' }}>█</span>
        </div>
      </div>
    </div>
  );
}
