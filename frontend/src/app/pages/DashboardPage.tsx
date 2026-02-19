import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Play, FileText, MoreVertical, Plus, Share2, Trash2, Check, LayoutGrid, Users, BookMarked, Settings2, Cpu, Wifi, HardDrive } from 'lucide-react';
import { useNavigate } from 'react-router';

// â”€â”€ Premium graph thumbnail variants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Per-variant stroke opacity multipliers — subtle micro-variation (±8 pp)
const VARIANT_STROKE_OPACITIES = [0.40, 0.36, 0.44, 0.38];
const VARIANT_STROKE_BRIGHT    = [0.68, 0.64, 0.72, 0.66];

const GraphThumbnail = ({ variant, failed }: { variant: number; failed?: boolean }) => {
  const idx    = variant % VARIANT_STROKE_OPACITIES.length;
  const dimO   = VARIANT_STROKE_OPACITIES[idx];
  const brightO= VARIANT_STROKE_BRIGHT[idx];
  const stroke = failed ? `rgba(255,90,90,${dimO})` : `rgba(25,208,160,${dimO})`;
  const strokeBright = failed ? `rgba(255,90,90,${brightO})` : `rgba(25,208,160,${brightO})`;
  const fill = failed ? '#1a0a0a' : '#07120f';
  const fillActive = failed ? '#200d0d' : '#0b1f1b';
  const nodeFill = failed ? '#E86B6B' : '#19f0b4';

  const variants: React.ReactNode[] = [
    // Variant 0: three-tier architecture
    <g key="v0">
      <line x1="150" y1="40" x2="90" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="150" y1="40" x2="210" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="90" y1="90" x2="90" y2="138" stroke={stroke} strokeWidth="1.2"/>
      <line x1="210" y1="90" x2="210" y2="138" stroke={stroke} strokeWidth="1.2"/>
      <rect x="125" y="28" width="50" height="22" rx="3" fill={fillActive} stroke={strokeBright} strokeWidth="1.2"/>
      <rect x="65"  y="78" width="50" height="22" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="185" y="78" width="50" height="22" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="65"  y="126" width="50" height="22" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="185" y="126" width="50" height="22" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>
      <motion.circle r="2.5" fill={nodeFill} cx="150" cy="40"
        animate={{ opacity: [0.9, 0.4, 0.9] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}/>
    </g>,
    // Variant 1: ring topology
    <g key="v1">
      <circle cx="150" cy="90" r="52" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="4 3"/>
      <line x1="150" y1="38" x2="198" y2="116" stroke={stroke} strokeWidth="1.1"/>
      <line x1="198" y1="116" x2="102" y2="116" stroke={stroke} strokeWidth="1.1"/>
      <line x1="102" y1="116" x2="150" y2="38" stroke={stroke} strokeWidth="1.1"/>
      <rect x="134" y="26" width="32" height="20" rx="3" fill={fillActive} stroke={strokeBright} strokeWidth="1.2"/>
      <rect x="186" y="106" width="28" height="20" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="86"  y="106" width="28" height="20" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>
      <motion.circle r="2.5" fill={nodeFill} cx="150" cy="36"
        animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}/>
    </g>,
    // Variant 2: pipeline
    <g key="v2">
      <line x1="44" y1="90" x2="100" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="124" y1="90" x2="176" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="200" y1="90" x2="256" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="150" y1="65" x2="150" y2="78" stroke={stroke} strokeWidth="1"/>
      <rect x="20"  y="78" width="48" height="24" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="100" y="78" width="48" height="24" rx="3" fill={fillActive} stroke={strokeBright} strokeWidth="1.2"/>
      <rect x="176" y="78" width="48" height="24" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="130" y="50" width="40" height="17" rx="3" fill={fill} stroke={stroke} strokeWidth="0.9"/>
      <motion.circle r="2.8" fill={nodeFill} cx="44" cy="90"
        animate={{ cx: [44, 256], opacity: [1, 0] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'linear', delay: 0.6 }}/>
    </g>,
    // Variant 3: hub and spoke
    <g key="v3">
      {[0,60,120,180,240,300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = 150 + 58 * Math.cos(rad);
        const y2 = 90 + 58 * Math.sin(rad);
        return <line key={i} x1="150" y1="90" x2={x2} y2={y2} stroke={stroke} strokeWidth="1.1"/>;
      })}
      {[0,60,120,180,240,300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const cx = 150 + 58 * Math.cos(rad);
        const cy = 90 + 58 * Math.sin(rad);
        return <rect key={i} x={cx - 14} y={cy - 10} width="28" height="20" rx="3" fill={fill} stroke={stroke} strokeWidth="1"/>;
      })}
      <circle cx="150" cy="90" r="18" fill={fillActive} stroke={strokeBright} strokeWidth="1.3"/>
      <motion.circle r="2.5" fill={nodeFill} cx="150" cy="90"
        animate={{ opacity: [0.8, 0.2, 0.8] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}/>
    </g>
  ];

  return (
    <svg className="w-full h-full" viewBox="0 0 300 180" preserveAspectRatio="xMidYMid meet">
      {variants[variant % variants.length]}
    </svg>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [inviteLink, setInviteLink] = useState('');
  const [activeNav, setActiveNav] = useState('My Projects');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mock project data
  const [projects, setProjects] = useState([
    {
      id: 1,
      title: 'Velocis',
      status: 'Graded: A-',
      statusColor: '#2ad1a0',
      lastEdited: '2 mins ago by User B',
      isCollaborative: true,
      grade: 'A-'
    },
    {
      id: 2,
      title: 'InfraZero Core',
      status: 'Draft',
      statusColor: '#8FA9A3',
      lastEdited: '1 hour ago',
      isCollaborative: false,
      isDraft: true
    },
    {
      id: 3,
      title: 'Edge-Compute-Sim',
      status: 'Graded: B-',
      statusColor: '#2ad1a0',
      lastEdited: '3 days ago by User A',
      isCollaborative: true,
      grade: 'B-'
    },
    {
      id: 4,
      title: 'Netflix-Clone-Arch',
      status: 'Simulation Failed',
      statusColor: '#FF3B3B',
      lastEdited: '5 days ago',
      isCollaborative: false,
      isFailed: true
    },
    {
      id: 5,
      title: 'Kafka-Streams-Test',
      status: 'Draft',
      statusColor: '#8FA9A3',
      lastEdited: '1 week ago',
      isCollaborative: false,
      isDraft: true
    },
    {
      id: 6,
      title: 'Redis-Cluster-Lab',
      status: 'Graded: B+',
      statusColor: '#2ad1a0',
      lastEdited: '2 weeks ago by User C',
      isCollaborative: true,
      grade: 'B+'
    }
  ]);

  const handleShare = (e: React.MouseEvent, projectId: number, projectTitle: string) => {
    e.stopPropagation();
    const mockLink = `https://infrazero.dev/invite/${projectTitle.toLowerCase().replace(/\s+/g, '-')}-${projectId}`;
    navigator.clipboard.writeText(mockLink).catch(() => {});
    setCopiedId(projectId);
    setTimeout(() => setCopiedId(null), 2000);
    setOpenMenuId(null);
  };

  const handleDelete = (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation();
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setOpenMenuId(null);
  };

  const navItems = [
    { label: 'My Projects',    icon: LayoutGrid },
    { label: 'Shared with Me', icon: Users },
    { label: 'Library of Doom',icon: BookMarked },
    { label: 'Settings',       icon: Settings2 },
  ];

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#020908', fontFamily: 'Inter, sans-serif' }}>

      {/* â”€â”€ Background layer 1: grid with radial fade â”€â”€ */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: [
          'linear-gradient(rgba(25,208,160,0.038) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(25,208,160,0.038) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '80px 80px',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%)',
      }} />

      {/* â”€â”€ Background layer 2: vignette â”€â”€ */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 45%, rgba(1,4,3,0.8) 100%)',
      }} />

      {/* â”€â”€ Background layer 3: noise film grain â”€â”€ */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.03, zIndex: 1 }}>
        <filter id="iz-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="4" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
        </filter>
        <rect width="100%" height="100%" filter="url(#iz-noise)"/>
      </svg>

      {/* â”€â”€ LEFT SIDEBAR â”€â”€ */}
      <motion.aside
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0, 0.1, 1] }}
        className="relative z-10 flex-shrink-0"
        style={{
          width: '252px',
          background: 'linear-gradient(180deg, var(--iz-surface-2, #07110f) 0%, #050d0b 100%)',
          borderRight: '1px solid rgba(25,208,160,0.09)',
        }}
      >
        <div className="h-screen flex flex-col">

          {/* User Profile Block */}
          <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(25,208,160,0.07)' }}>
            <div className="flex items-center gap-3 px-3 py-3" style={{
              background: 'rgba(25,208,160,0.025)',
              border: '1px solid rgba(25,208,160,0.09)',
              borderRadius: '10px',
            }}>
              <div className="relative flex-shrink-0">
                <div className="rounded-full flex items-center justify-center"
                  style={{
                    width: '38px', height: '38px',
                    background: 'linear-gradient(135deg, #071810 0%, #0a2318 100%)',
                    border: '1px solid rgba(25,208,160,0.18)',
                  }}>
                  <span style={{ color: 'var(--iz-accent-muted, #2ad1a0)', fontSize: '16px', fontWeight: 600 }}>G</span>
                </div>
                <div className="absolute bottom-0 right-0 rounded-full"
                  style={{ width: '9px', height: '9px', backgroundColor: 'var(--iz-accent-muted, #2ad1a0)', border: '2px solid #050D0B' }}/>
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ color: 'var(--iz-text-primary, #e6fff6)', fontSize: '15px', fontWeight: 500, letterSpacing: '-0.01em' }}>Guest User</div>
                <div style={{ color: 'var(--iz-text-tertiary, rgba(230,255,246,0.48))', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', marginTop: '1px' }}>
                  Research Tier
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {navItems.map(({ label, icon: Icon }, index) => {
              const isActive = activeNav === label;
              return (
                <motion.button
                  key={label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + index * 0.04, duration: 0.25, ease: [0.25, 0, 0.1, 1] }}
                  onClick={() => {
                    if (label === 'Settings') navigate('/settings');
                    else setActiveNav(label);
                  }}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 transition-all relative"
                  style={{
                    borderRadius: '9px',
                    color: isActive ? 'var(--iz-accent-primary, #19f0b4)' : 'rgba(230,255,246,0.50)',
                    background: isActive ? 'rgba(25,208,160,0.06)' : 'transparent',
                    fontSize: '15.5px',
                    fontWeight: isActive ? 500 : 400,
                    border: isActive ? '1px solid rgba(25,208,160,0.13)' : '1px solid transparent',
                    transition: `all 200ms cubic-bezier(0.22,1,0.36,1)`,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'rgba(230,255,246,0.78)';
                      e.currentTarget.style.background = 'rgba(25,208,160,0.035)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'rgba(230,255,246,0.50)';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <Icon style={{ width: '15px', height: '15px', flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
                  {label}
                </motion.button>
              );
            })}
          </nav>

          {/* System Status Block */}
          <div className="px-5 py-5" style={{ borderTop: '1px solid rgba(25,208,160,0.07)' }}>
            <div className="uppercase mb-3"
              style={{ color: 'var(--iz-text-tertiary, rgba(230,255,246,0.48))', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', letterSpacing: '0.08em' }}>
              System Status
            </div>
            <div className="space-y-2" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>
              {[
                { icon: Wifi,      label: 'CRDT',        value: 'SYNCED', ok: true },
                { icon: Cpu,       label: 'WASM ENGINE', value: 'READY',  ok: true },
                { icon: HardDrive, label: 'LOCAL-FIRST', value: 'ACTIVE', ok: true },
              ].map(({ icon: StatusIcon, label, value, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <StatusIcon style={{ width: '10px', height: '10px', color: ok ? 'var(--iz-accent-muted, #2ad1a0)' : '#c05050', flexShrink: 0 }}/>
                  <span style={{ color: 'var(--iz-text-tertiary, rgba(230,255,246,0.48))' }}>{label}:</span>
                  <span style={{ color: ok ? 'var(--iz-accent-primary, #19f0b4)' : '#e86b6b' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </motion.aside>

      {/* â”€â”€ MAIN CONTENT AREA â”€â”€ */}
      <main className="flex-1 relative z-10" style={{ overflowY: 'auto' }}>
        <div className="px-10 py-9">

          {/* Header Row */}
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-start justify-between mb-9"
            style={{ position: 'relative' }}
          >
            {/* ── Focal spotlight — barely-there radial glow behind title ── */}
            <div aria-hidden style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 25% 40%, rgba(25,240,180,0.08), transparent 58%)',
              pointerEvents: 'none',
              borderRadius: '16px',
            }} />

            <div style={{ position: 'relative' }}>
              <h1 style={{
                color: 'var(--iz-text-primary, #e6fff6)',
                fontSize: 'clamp(30px, 2.4vw, 44px)',
                fontWeight: 660,
                letterSpacing: '-0.03em',
                lineHeight: 1.08,
                marginBottom: '8px',
              }}>
                My Projects
              </h1>
              <p style={{ color: 'var(--iz-text-secondary, rgba(230,255,246,0.72))', fontSize: 'clamp(14px, 1vw, 16px)', lineHeight: 1.55, maxWidth: '420px' }}>
                Manage simulations, collaborate in real-time, and analyze post-mortems.
              </p>
            </div>
            <button
              onClick={() => navigate('/workspace')}
              className="flex items-center gap-2.5 flex-shrink-0 iz-btn-green iz-lift uppercase tracking-wider"
              style={{
                color: '#020F0A',
                padding: '13px 28px',
                borderRadius: '2px',
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '0.07em',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(0,43,26,0), #020908)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(0,43,26,0), #020908)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(0,43,26,0), #020908)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(0,43,26,0), #020908)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              <Plus style={{ width: '16px', height: '16px' }} />
              <span>New Project</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', opacity: 0.6, letterSpacing: '0.1em' }}>INIT</span>
            </button>
          </motion.div>

          {/* ── Join Live Session Panel ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
            style={{
              background: 'linear-gradient(180deg, var(--iz-surface-3, #0a1714) 0%, var(--iz-surface-2, #07110f) 100%)',
              border: '1px solid rgba(25,208,160,0.10)',
              borderTop: '1px solid rgba(25,208,160,0.20)',
              borderRadius: '16px',
              padding: '28px 28px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(25,208,160,0.06)',
            }}
          >
            <div className="flex items-start gap-3 mb-5">
              <div style={{
                width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0,
                background: 'rgba(25,208,160,0.05)',
                border: '1px solid rgba(25,208,160,0.13)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Users style={{ width: '16px', height: '16px', color: 'var(--iz-accent-muted, #2ad1a0)' }}/>
              </div>
              <div>
                <h2 style={{ color: 'var(--iz-text-primary, #e6fff6)', fontSize: '17px', fontWeight: 600, letterSpacing: '-0.022em', marginBottom: '3px' }}>
                  Join Live Session
                </h2>
                <p style={{ color: 'var(--iz-text-secondary, rgba(230,255,246,0.72))', fontSize: '14px', lineHeight: 1.5 }}>
                  Paste an invite link to instantly join a collaborative simulation.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <input
                type="text"
                value={inviteLink}
                onChange={(e) => setInviteLink(e.target.value)}
                placeholder="https://infrazero.dev/invite/..."
                className="iz-input"
                style={{
                  flex: 1,
                  background: 'rgba(5,8,7,0.5)',
                  border: '1px solid rgba(25,208,160,0.14)',
                  borderRadius: '9px',
                  color: 'var(--iz-text-primary, #e6fff6)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12.5px',
                  padding: '10px 14px',
                }}
              />
              <button
                className="iz-btn-green iz-lift uppercase tracking-wider"
                style={{
                  color: '#020F0A',
                  padding: '13px 28px',
                  borderRadius: '2px',
                  fontSize: '14px',
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  border: 'none',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(0,43,26,0), #020908)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(0,43,26,0), #020908)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(0,43,26,0), #020908)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(0,43,26,0), #020908)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                Join
              </button>
            </div>
            {inviteLink && (
              <motion.div
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="mt-3 flex items-center gap-2"
                style={{ color: 'var(--iz-accent-muted, #2ad1a0)', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}
              >
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--iz-accent-muted, #2ad1a0)', flexShrink: 0 }}/>
                SESSION VERIFIED
              </motion.div>
            )}
          </motion.div>

          {/* â”€â”€ Project Grid â”€â”€ */}
          {projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project, index) => {
                // Controlled micro-variation — systematic, not random
                const radii        = [14, 16, 14, 15, 16, 14];
                const bodyPaddings = [18, 18, 19, 17, 18, 19];  // ±1 px variation
                const radius       = radii[index % radii.length];
                const bodyPad      = bodyPaddings[index % bodyPaddings.length];
                const statusColor  = project.isFailed ? '#e86b6b' : project.isDraft ? 'rgba(230,255,246,0.46)' : '#2ad1a0';
                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.38 + index * 0.07, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="cursor-pointer group relative iz-card-hover"
                    style={{
                      background: 'linear-gradient(180deg, rgba(10,23,20,0.9) 0%, rgba(6,16,14,0.95) 100%)',
                      border: '1.5px solid rgba(25,208,160,0.22)',
                      borderTop: '1.5px solid rgba(25,208,160,0.40)',
                      borderRadius: `${radius}px`,
                      boxShadow: '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(25,208,160,0.04)',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.borderTopColor = 'rgba(25,208,160,0.60)';
                      el.style.borderColor    = 'rgba(25,208,160,0.35)';
                      el.style.boxShadow = '0 18px 40px rgba(0,0,0,0.48), inset 0 1px 0 rgba(25,208,160,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.borderTopColor = 'rgba(25,208,160,0.40)';
                      el.style.borderColor    = 'rgba(25,208,160,0.22)';
                      el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(25,208,160,0.04)';
                      el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(25,208,160,0.04)';
                    }}
                  >
                    {/* Context menu */}
                    <div ref={openMenuId === project.id ? menuRef : undefined} className="absolute top-3 right-3 z-20">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === project.id ? null : project.id); }}
                        className="p-1.5"
                        style={{
                          background: openMenuId === project.id ? 'rgba(25,208,160,0.10)' : 'rgba(0,0,0,0.45)',
                          border: `1px solid ${openMenuId === project.id ? 'rgba(25,208,160,0.30)' : 'rgba(25,208,160,0.12)'}`,
                          borderRadius: '7px',
                          color: openMenuId === project.id ? '#2ad1a0' : 'rgba(230,255,246,0.38)',
                          transition: `all 200ms cubic-bezier(0.22,1,0.36,1)`,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(25,208,160,0.28)'; e.currentTarget.style.color = '#2ad1a0'; }}
                        onMouseLeave={(e) => {
                          if (openMenuId !== project.id) {
                            e.currentTarget.style.borderColor = 'rgba(25,208,160,0.12)';
                            e.currentTarget.style.color = 'rgba(230,255,246,0.38)';
                          }
                        }}
                      >
                        <MoreVertical style={{ width: '13px', height: '13px' }} />
                      </button>
                      <AnimatePresence>
                        {openMenuId === project.id && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.97 }}
                            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute right-0 top-full mt-1.5"
                            style={{
                              background: 'linear-gradient(180deg, rgba(10,23,20,0.98) 0%, rgba(6,16,14,0.99) 100%)',
                              border: '1px solid rgba(25,208,160,0.13)',
                              borderRadius: '11px',
                              minWidth: '165px',
                              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                              padding: '4px',
                            }}
                          >
                            <button
                              onClick={(e) => handleShare(e, project.id, project.title)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                              style={{ color: 'var(--iz-text-secondary, rgba(230,255,246,0.72))', fontSize: '13.5px', borderRadius: '8px', transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(25,208,160,0.07)'; e.currentTarget.style.color = '#2ad1a0'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(230,255,246,0.72)'; }}
                            >
                              {copiedId === project.id
                                ? <Check style={{ width: '13px', height: '13px', color: '#2ad1a0', flexShrink: 0 }} />
                                : <Share2 style={{ width: '13px', height: '13px', flexShrink: 0 }} />}
                              <span>{copiedId === project.id ? 'Link Copied!' : 'Share Project'}</span>
                            </button>
                            <div style={{ height: '1px', background: 'rgba(25,208,160,0.07)', margin: '2px 0' }} />
                            <button
                              onClick={(e) => handleDelete(e, project.id)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                              style={{ color: 'var(--iz-text-secondary, rgba(230,255,246,0.72))', fontSize: '13.5px', borderRadius: '8px', transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(232,107,107,0.08)'; e.currentTarget.style.color = '#e86b6b'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(230,255,246,0.72)'; }}
                            >
                              <Trash2 style={{ width: '13px', height: '13px', flexShrink: 0 }} />
                              <span>Delete Project</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Thumbnail */}
                    <div className="relative" style={{
                      height: '168px',
                      background: 'linear-gradient(180deg, var(--iz-surface-1, #050807) 0%, var(--iz-surface-2, #07110f) 100%)',
                      borderBottom: '1px solid rgba(25,208,160,0.07)',
                      overflow: 'hidden',
                    }}>
                      {/* Per-card noise intensity micro-variation */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: 'radial-gradient(circle, rgba(25,208,160,0.035) 1px, transparent 1px)',
                        backgroundSize: `${18 + (index % 3)}px ${18 + (index % 3)}px`,
                        opacity: 0.9 + (index % 3) * 0.05,
                      }}/>
                      <GraphThumbnail variant={index} failed={project.isFailed} />

                      {/* Status badge — subtle tone differences per grade */}
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1" style={{
                        background: 'rgba(5,8,7,0.90)',
                        border: `1px solid ${project.grade === 'A-' ? 'rgba(25,208,160,0.30)' : project.grade ? 'rgba(25,208,160,0.22)' : project.isFailed ? 'rgba(232,107,107,0.26)' : 'rgba(230,255,246,0.14)'}`,
                        borderRadius: '6px',
                        backdropFilter: 'blur(6px)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '11px',
                        color: statusColor,
                        letterSpacing: '0.04em',
                      }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0 }}/>
                        {project.grade ? `GRADE ${project.grade}` : project.isDraft ? 'DRAFT' : 'FAILED'}
                      </div>

                      {/* Hover quick actions */}
                      <div className="absolute top-3 left-3 flex gap-1.5 opacity-0 group-hover:opacity-100" style={{ transition: 'opacity 200ms cubic-bezier(0.22,1,0.36,1)' }}>
                        {([Play, FileText] as React.ComponentType<{ style?: React.CSSProperties }>[]).map((Icon, i) => (
                          <button key={i} className="p-1.5" style={{
                            background: 'rgba(5,8,7,0.88)',
                            border: '1px solid rgba(25,208,160,0.16)',
                            borderRadius: '7px',
                            color: 'rgba(230,255,246,0.40)',
                            transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)',
                          }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(25,208,160,0.38)'; e.currentTarget.style.color = '#2ad1a0'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(25,208,160,0.16)'; e.currentTarget.style.color = 'rgba(230,255,246,0.40)'; }}
                          >
                            <Icon style={{ width: '13px', height: '13px' }} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Card body — bodyPad gives ±1px micro-variation */}
                    <div style={{ padding: `16px ${bodyPad}px ${bodyPad}px` }}>
                      <h3 style={{
                        color: 'var(--iz-text-primary, #e6fff6)', fontSize: '16.5px', fontWeight: 580,
                        letterSpacing: '-0.022em', marginBottom: '6px', lineHeight: 1.28,
                      }}>
                        {project.title}
                      </h3>
                      <div style={{
                        color: statusColor, fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '12px', marginBottom: '10px', letterSpacing: '0.02em',
                      }}>
                        {project.status}
                      </div>
                      <div className="flex items-center gap-2">
                        {project.isCollaborative && (
                          <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#2ad1a0', flexShrink: 0 }}/>
                        )}
                        <span style={{ color: 'var(--iz-text-tertiary, rgba(230,255,246,0.48))', fontFamily: 'JetBrains Mono, monospace', fontSize: '11.5px' }}>
                          {project.lastEdited}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4, ease: 'easeOut' }}
              className="text-center py-20"
            >
              <h3 style={{ color: 'var(--iz-text-primary, #e6fff6)', fontSize: '26px', fontWeight: 660, letterSpacing: '-0.03em', marginBottom: '12px' }}>
                No Active Architectures
              </h3>
              <p style={{ color: 'var(--iz-text-secondary, rgba(230,255,246,0.72))', fontSize: '14px', maxWidth: '440px', margin: '0 auto 28px', lineHeight: 1.6 }}>
                Initialize your first distributed system and run a deterministic simulation.
              </p>
              <button
                className="iz-lift"
                style={{
                  background: 'linear-gradient(135deg, #1ed4a0 0%, #17b888 100%)',
                  color: '#020F0A', padding: '12px 32px', borderRadius: '11px',
                  fontSize: '13.5px', fontWeight: 600, letterSpacing: '0.01em',
                  border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(25,180,130,0.22)',
                }}
              >
                Initialize Lab
              </button>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
