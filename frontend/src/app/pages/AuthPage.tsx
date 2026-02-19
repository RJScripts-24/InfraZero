import { motion } from 'motion/react';
import { Github, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useEffect, useState } from 'react';

export default function AuthPage() {
  const navigate = useNavigate();

  // ── Live simulation state ──────────────────────────────────────────
  const LOGS = [
    { t: 'info',    msg: '[00:00:01] Simulation seed: 0xDEADBEEF' },
    { t: 'ok',      msg: '[00:00:02] API Gateway  ▶  healthy  (p50: 12ms)' },
    { t: 'ok',      msg: '[00:00:03] Auth Service ▶  healthy  (p50: 8ms)' },
    { t: 'warn',    msg: '[00:00:05] Redis Cache  ▷  eviction  pressure +14%' },
    { t: 'ok',      msg: '[00:00:06] Postgres     ▶  healthy  (conn: 42/100)' },
    { t: 'info',    msg: '[00:00:08] Load Balancer rr-routing  rps: 4 210' },
    { t: 'error',   msg: '[00:00:11] Queue Worker  ✗  backlog   spike → 1 800 msgs' },
    { t: 'warn',    msg: '[00:00:13] Postgres      ▷  slow query  p99: 340ms' },
    { t: 'ok',      msg: '[00:00:15] Auto-scaled   +2 workers  spawned' },
    { t: 'info',    msg: '[00:00:17] CRDT merge    delta-state  synced' },
    { t: 'ok',      msg: '[00:00:19] Queue backlog ▶  draining  (1 200 msgs)' },
    { t: 'ok',      msg: '[00:00:22] Chaos test    ✓  system stable  post-event' },
  ];

  const [logLines, setLogLines]   = useState<typeof LOGS>([LOGS[0]]);
  const [tick,     setTick]       = useState(0);
  const [rps,      setRps]        = useState(4210);
  const [p50,      setP50]        = useState(12);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
      setLogLines(prev => {
        const next = LOGS[(prev.length) % LOGS.length];
        const updated = [...prev, next];
        return updated.length > 6 ? updated.slice(-6) : updated;
      });
      setRps(r  => Math.max(3800, Math.min(5200, r  + Math.round((Math.random() - 0.48) * 180))));
      setP50(p  => Math.max(8,    Math.min(42,   p  + Math.round((Math.random() - 0.5)  * 4))));
    }, 1800);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Node layout (viewBox 600 × 520) ────────────────────────────────
  const nodes = [
    { id: 'cdn',   label: 'CDN',        x: 300, y:  38, active: true  },
    { id: 'lb',    label: 'Load Bal.',   x: 300, y: 118, active: true  },
    { id: 'gw',    label: 'API GW',      x: 300, y: 200, active: true  },
    { id: 'auth',  label: 'Auth Svc',    x: 155, y: 290, active: true  },
    { id: 'api',   label: 'API Svc',     x: 445, y: 290, active: true  },
    { id: 'db',    label: 'Postgres',    x: 155, y: 385, active: tick % 8 < 6 },
    { id: 'cache', label: 'Redis',       x: 355, y: 385, active: true  },
    { id: 'queue', label: 'Queue',       x: 510, y: 385, active: true  },
    { id: 'work',  label: 'Worker',      x: 510, y: 470, active: tick % 5 < 4 },
  ] as const;

  const edges = [
    { x1:300,y1:68,  x2:300,y2:98  },
    { x1:300,y1:148, x2:300,y2:180 },
    { x1:270,y1:218, x2:185,y2:268 },
    { x1:330,y1:218, x2:415,y2:268 },
    { x1:155,y1:320, x2:155,y2:360 },
    { x1:200,y1:295, x2:315,y2:380 },
    { x1:415,y1:308, x2:380,y2:360 },
    { x1:470,y1:308, x2:495,y2:360 },
    { x1:510,y1:415, x2:510,y2:450 },
  ];

  const packetPaths = [
    { d:'M 300 38 L 300 118 L 300 200 L 155 290 L 155 385', dur:'3.2s', delay:'0s',   color:'#00FFA3' },
    { d:'M 300 38 L 300 118 L 300 200 L 445 290 L 355 385', dur:'2.8s', delay:'-1.4s',color:'#00FFA3' },
    { d:'M 300 38 L 300 118 L 300 200 L 445 290 L 510 385 L 510 470', dur:'4s', delay:'-2s', color:'#26D980' },
    { d:'M 300 200 L 155 290 L 155 385', dur:'2s', delay:'-0.8s', color:'rgba(255,200,0,0.9)' },
  ];

  return (
    <div className="min-h-screen flex" style={{ 
      backgroundColor: '#020908',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Vertical Grid Lines Overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(to right, rgba(0,255,170,0.06) 0px, rgba(0,255,170,0.06) 1px, transparent 1px, transparent 80px)',
        backgroundSize: '80px 100%'
      }} />

      {/* Left Panel - Branding & Technical Context */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'linear' }}
        className="hidden lg:flex lg:w-[55%] relative flex-col justify-between"
        style={{ 
          backgroundColor: '#040F0E',
          padding: 'clamp(48px, 4vw, 80px)'
        }}
      >
        {/* Logo */}
        <div className="flex items-center" style={{ gap: 'clamp(8px, 0.7vw, 12px)' }}>
          <span style={{ 
            color: '#E6F1EF',
            fontSize: 'clamp(24px, 1.8vw, 36px)',
            fontWeight: 500
          }}>
            InfraZero
          </span>
          <div style={{ 
            width: 'clamp(6px, 0.5vw, 8px)',
            height: 'clamp(6px, 0.5vw, 8px)',
            backgroundColor: '#00FFA3',
            borderRadius: '50%'
          }} />
        </div>

        {/* ── MAIN VISUAL ── */}
        <div className="flex-1 flex flex-col items-center justify-center" style={{ gap: 'clamp(16px, 1.5vw, 24px)' }}>

          {/* SIM status bar */}
          <div className="flex items-center w-full justify-between" style={{ maxWidth: 560, fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(9px, 0.75vw, 11px)' }}>
            <div className="flex items-center gap-2">
              <motion.div animate={{ opacity:[1,0.3,1] }} transition={{ duration:1, repeat:Infinity }} style={{ width:7, height:7, borderRadius:'50%', backgroundColor:'#00FFA3' }} />
              <span style={{ color:'#00FFA3', letterSpacing:'0.08em' }}>SIM RUNNING</span>
            </div>
            <span style={{ color:'#4A7A70' }}>SEED: 0xDEADBEEF</span>
            <span style={{ color:'#4A7A70' }}>TICK: {String(tick).padStart(4,'0')}</span>
          </div>

          {/* SVG Diagram */}
          <div className="relative w-full" style={{ maxWidth: 560, aspectRatio: '560/520' }}>
            <svg width="100%" height="100%" viewBox="0 0 560 520" preserveAspectRatio="xMidYMid meet">
              <defs>
                {/* Glow filter */}
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="glow-strong">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                {/* Packet paths (hidden) */}
                {packetPaths.map((p, i) => (
                  <path key={i} id={`pp${i}`} d={p.d} fill="none" />
                ))}
              </defs>

              {/* Background grid dots */}
              {Array.from({ length: 7 }).map((_, xi) =>
                Array.from({ length: 7 }).map((_, yi) => (
                  <circle key={`${xi}-${yi}`} cx={40 + xi * 80} cy={30 + yi * 70} r="1"
                    fill="rgba(0,255,170,0.12)" />
                ))
              )}

              {/* Edges */}
              {edges.map((e, i) => (
                <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke="rgba(0,255,170,0.22)" strokeWidth="1.5"
                  strokeDasharray="6 4" />
              ))}
              {/* Edge animated dash */}
              {edges.map((e, i) => (
                <line key={`a${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke="rgba(0,255,170,0.5)" strokeWidth="1.5"
                  strokeDasharray="6 4">
                  <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.2s" repeatCount="indefinite" />
                </line>
              ))}

              {/* Data packets */}
              {packetPaths.map((p, i) => (
                <circle key={i} r="4" fill={p.color} filter="url(#glow)">
                  <animateMotion dur={p.dur} begin={p.delay} repeatCount="indefinite">
                    <mpath href={`#pp${i}`} />
                  </animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" dur={p.dur} begin={p.delay} repeatCount="indefinite" />
                </circle>
              ))}

              {/* Nodes */}
              {nodes.map(n => (
                <g key={n.id}>
                  {/* Outer pulse ring */}
                  {n.active && (
                    <circle cx={n.x} cy={n.y} r="28" fill="none" stroke="#00FFA3" strokeWidth="0.8" opacity="0.3">
                      <animate attributeName="r" values="22;34;22" dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.3;0;0.3" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Node box */}
                  <rect x={n.x - 42} y={n.y - 22} width="84" height="44"
                    fill="#040F0E"
                    stroke={n.active ? '#00FFA3' : 'rgba(0,255,170,0.2)'}
                    strokeWidth={n.active ? '1.5' : '1'}
                    filter={n.active ? 'url(#glow)' : undefined}
                  />
                  {/* Status dot */}
                  <circle cx={n.x + 34} cy={n.y - 14} r="3.5"
                    fill={n.active ? '#00FFA3' : '#FF4444'}>
                    {n.active && <animate attributeName="opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />}
                  </circle>
                  {/* Label */}
                  <text x={n.x} y={n.y + 5} textAnchor="middle"
                    fill={n.active ? '#E6F1EF' : '#4A7A70'}
                    fontSize="11" fontFamily="JetBrains Mono, monospace">
                    {n.label}
                  </text>
                </g>
              ))}

              {/* Edge RPS labels */}
              <text x="310" y="83"  fill="#26595A" fontSize="9" fontFamily="JetBrains Mono, monospace">{rps.toLocaleString()} rps</text>
              <text x="310" y="164" fill="#26595A" fontSize="9" fontFamily="JetBrains Mono, monospace">p50: {p50}ms</text>
            </svg>
          </div>

          {/* Live terminal log */}
          <div className="w-full" style={{
            maxWidth: 560,
            backgroundColor: '#020D0B',
            border: '1px solid rgba(0,255,170,0.15)',
            borderRadius: '2px',
            padding: 'clamp(10px, 1vw, 14px)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'clamp(8px, 0.72vw, 10px)',
            lineHeight: 1.7,
            minHeight: '90px',
            overflow: 'hidden',
          }}>
            <div style={{ color:'#4A7A70', marginBottom:4, letterSpacing:'0.06em' }}>▸ SIMULATION LOG</div>
            {logLines.map((l, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                style={{ color: l.t === 'ok' ? '#00FFA3' : l.t === 'warn' ? '#F59E0B' : l.t === 'error' ? '#EF4444' : '#8FA9A3' }}>
                {l.msg}
              </motion.div>
            ))}
            <motion.span animate={{ opacity:[1,0,1] }} transition={{ duration:0.9, repeat:Infinity }}
              style={{ color:'#00FFA3' }}>█</motion.span>
          </div>

          {/* Tagline */}
          <div className="text-center" style={{ maxWidth: 500 }}>
            <h2 className="mb-2" style={{
              color: '#E6F1EF',
              fontSize: 'clamp(22px, 1.8vw, 34px)',
              fontWeight: 600,
              lineHeight: 1.2
            }}>
              Your Architecture. Deterministic.
            </h2>
            <p style={{
              color: '#8FA9A3',
              fontSize: 'clamp(12px, 0.95vw, 16px)',
              lineHeight: 1.6
            }}>
              Sign in to save simulations, run chaos tests, and generate reproducible post-mortem reports.
            </p>
          </div>
        </div>

        {/* Bottom tech indicators */}
        <div style={{ 
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'clamp(9px, 0.7vw, 11px)',
          color: '#8FA9A3',
          letterSpacing: '0.05em'
        }}>
          <div>LOCAL-FIRST MODE</div>
          <div>AUTH: OAUTH 2.0</div>
          <div>ENCRYPTION: TLS 1.3</div>
        </div>
      </motion.div>

      {/* Divider */}
      <div style={{ 
        width: '1px',
        backgroundColor: 'rgba(0,255,170,0.15)'
      }} />

      {/* Right Panel - Authentication Form */}
      <motion.div 
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'linear', delay: 0.2 }}
        className="flex-1 flex items-center justify-center relative"
        style={{ 
          backgroundColor: '#020908',
          padding: 'clamp(24px, 3vw, 48px)'
        }}
      >
        <div style={{ width: '100%', maxWidth: '420px' }}>
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'linear', delay: 0.3 }}
            className="mb-8"
          >
            <h1 className="mb-3" style={{ 
              color: '#E6F1EF',
              fontSize: 'clamp(32px, 2.5vw, 48px)',
              fontWeight: 600,
              lineHeight: 1.1
            }}>
              Welcome to InfraZero.
            </h1>
            <p style={{ 
              color: '#8FA9A3',
              fontSize: 'clamp(14px, 1.1vw, 18px)',
              lineHeight: 1.5
            }}>
              Secure access to your distributed systems lab.
            </p>
          </motion.div>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-8">
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'linear', delay: 0.4 }}
              className="w-full flex items-center justify-center border transition-all"
              style={{
                backgroundColor: '#040F0E',
                borderColor: 'rgba(0,255,170,0.3)',
                padding: 'clamp(14px, 1.2vw, 18px)',
                borderRadius: '2px',
                gap: 'clamp(10px, 0.8vw, 14px)',
                color: '#E6F1EF',
                fontSize: 'clamp(14px, 1vw, 16px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#00FFA3';
                e.currentTarget.style.backgroundColor = '#071512';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)';
                e.currentTarget.style.backgroundColor = '#040F0E';
              }}
              onClick={() => {
                // Handle GitHub OAuth
                console.log('GitHub OAuth');
              }}
            >
              <Github style={{ width: 'clamp(18px, 1.4vw, 22px)', height: 'clamp(18px, 1.4vw, 22px)' }} />
              Continue with GitHub
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'linear', delay: 0.48 }}
              className="w-full flex items-center justify-center border transition-all"
              style={{
                backgroundColor: '#040F0E',
                borderColor: 'rgba(0,255,170,0.3)',
                padding: 'clamp(14px, 1.2vw, 18px)',
                borderRadius: '2px',
                gap: 'clamp(10px, 0.8vw, 14px)',
                color: '#E6F1EF',
                fontSize: 'clamp(14px, 1vw, 16px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#00FFA3';
                e.currentTarget.style.backgroundColor = '#071512';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)';
                e.currentTarget.style.backgroundColor = '#040F0E';
              }}
              onClick={() => {
                // Handle Google OAuth
                console.log('Google OAuth');
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z" fill="#4285F4"/>
                <path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z" fill="#34A853"/>
                <path d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z" fill="#FBBC05"/>
                <path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'linear', delay: 0.56 }}
              className="w-full flex items-center justify-center border transition-all"
              style={{
                backgroundColor: 'transparent',
                borderColor: 'rgba(0,255,170,0.2)',
                padding: 'clamp(14px, 1.2vw, 18px)',
                borderRadius: '2px',
                gap: 'clamp(10px, 0.8vw, 14px)',
                color: '#8FA9A3',
                fontSize: 'clamp(14px, 1vw, 16px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,170,0.4)';
                e.currentTarget.style.color = '#E6F1EF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,170,0.2)';
                e.currentTarget.style.color = '#8FA9A3';
              }}
              onClick={() => {
                // Navigate to dashboard as guest
                navigate('/dashboard');
              }}
            >
              <UserCircle style={{ width: 'clamp(18px, 1.4vw, 22px)', height: 'clamp(18px, 1.4vw, 22px)' }} />
              Continue as Guest
            </motion.button>
          </div>

          {/* Security & Research Context */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'linear', delay: 0.56 }}
            className="border mb-6"
            style={{
              backgroundColor: '#040F0E',
              borderColor: 'rgba(0,255,170,0.2)',
              padding: 'clamp(16px, 1.4vw, 24px)',
              borderRadius: '2px'
            }}
          >
            <h3 className="mb-2" style={{
              color: '#00FFA3',
              fontSize: 'clamp(12px, 0.9vw, 14px)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              Security & Research Integrity
            </h3>
            <p style={{
              color: '#8FA9A3',
              fontSize: 'clamp(12px, 0.9vw, 14px)',
              lineHeight: 1.6
            }}>
              InfraZero runs simulations client-side. Your architecture data remains isolated. OAuth is used only for identity and project metadata.
            </p>
          </motion.div>

          {/* Footer Text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: 'linear', delay: 0.64 }}
            className="text-center"
            style={{
              color: '#8FA9A3',
              fontSize: 'clamp(11px, 0.85vw, 13px)'
            }}
          >
            By joining, you agree to our{' '}
            <a 
              href="#"
              className="transition-colors"
              style={{ color: '#00FFA3' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#00D98C'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#00FFA3'}
            >
              Research Terms
            </a>
            .
          </motion.div>
        </div>

        {/* Bottom-right tech indicator (mobile hidden) */}
        <div className="hidden lg:block absolute bottom-8 right-8" style={{ 
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'clamp(9px, 0.7vw, 11px)',
          color: '#8FA9A3',
          letterSpacing: '0.05em',
          textAlign: 'right'
        }}>
          <div>LOCAL-FIRST MODE</div>
          <div>AUTH: OAUTH 2.0</div>
          <div>ENCRYPTION: TLS 1.3</div>
        </div>
      </motion.div>
    </div>
  );
}