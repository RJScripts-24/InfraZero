import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Play, FileText, MoreVertical, Plus, Share2, Trash2, Check, LayoutGrid, Users, BookMarked, Settings2, Cpu, Wifi, HardDrive } from 'lucide-react';
import { useNavigate } from 'react-router';

// â”€â”€ Premium graph thumbnail variants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GraphThumbnail = ({ variant, failed }: { variant: number; failed?: boolean }) => {
  const stroke = failed ? 'rgba(255,90,90,0.5)' : 'rgba(0,220,160,0.42)';
  const strokeBright = failed ? 'rgba(255,90,90,0.8)' : 'rgba(0,220,160,0.72)';
  const fill = failed ? '#1a0a0a' : '#081916';
  const fillActive = failed ? '#200d0d' : '#0c2420';
  const nodeFill = failed ? '#FF6B6B' : '#00E5AA';

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
      statusColor: '#00FFA3',
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
      statusColor: '#00FFA3',
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
      statusColor: '#00FFA3',
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
          'linear-gradient(rgba(0,255,170,0.045) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(0,255,170,0.045) 1px, transparent 1px)',
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
          background: 'linear-gradient(180deg, #040F0C 0%, #030C09 100%)',
          borderRight: '1px solid rgba(0,255,170,0.1)',
        }}
      >
        <div className="h-screen flex flex-col">

          {/* User Profile Block */}
          <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(0,255,170,0.08)' }}>
            <div className="flex items-center gap-3 px-3 py-3" style={{
              background: 'rgba(0,255,170,0.03)',
              border: '1px solid rgba(0,255,170,0.1)',
              borderRadius: '10px',
            }}>
              <div className="relative flex-shrink-0">
                <div className="rounded-full flex items-center justify-center"
                  style={{
                    width: '38px', height: '38px',
                    background: 'linear-gradient(135deg, #061a12 0%, #0a2a1e 100%)',
                    border: '1px solid rgba(0,255,170,0.2)',
                  }}>
                  <span style={{ color: '#00D49A', fontSize: '15px', fontWeight: 600 }}>G</span>
                </div>
                <div className="absolute bottom-0 right-0 rounded-full"
                  style={{ width: '9px', height: '9px', backgroundColor: '#00C988', border: '2px solid #050D0B' }}/>
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ color: '#EAF5F0', fontSize: '13.5px', fontWeight: 500, letterSpacing: '-0.01em' }}>Guest User</div>
                <div style={{ color: '#99C4BC', fontSize: '10.5px', fontFamily: 'JetBrains Mono, monospace', marginTop: '1px' }}>
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
                    color: isActive ? '#00FFA3' : '#8DBEB5',
                    background: isActive ? 'rgba(0,255,170,0.06)' : 'transparent',
                    fontSize: '13.5px',
                    fontWeight: isActive ? 500 : 400,
                    border: isActive ? '1px solid rgba(0,255,170,0.14)' : '1px solid transparent',
                    transition: 'all 180ms cubic-bezier(0.2,0,0,1)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#C0DCD6';
                      e.currentTarget.style.background = 'rgba(0,255,170,0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#8DBEB5';
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
          <div className="px-5 py-5" style={{ borderTop: '1px solid rgba(0,255,170,0.08)' }}>
            <div className="uppercase mb-3"
              style={{ color: '#7AA89E', fontFamily: 'JetBrains Mono, monospace', fontSize: '9.5px', letterSpacing: '0.08em' }}>
              System Status
            </div>
            <div className="space-y-2" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10.5px' }}>
              {[
                { icon: Wifi,      label: 'CRDT',        value: 'SYNCED', ok: true },
                { icon: Cpu,       label: 'WASM ENGINE', value: 'READY',  ok: true },
                { icon: HardDrive, label: 'LOCAL-FIRST', value: 'ACTIVE', ok: true },
              ].map(({ icon: StatusIcon, label, value, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <StatusIcon style={{ width: '10px', height: '10px', color: ok ? '#00C988' : '#C05050', flexShrink: 0 }}/>
                  <span style={{ color: '#7AA89E' }}>{label}:</span>
                  <span style={{ color: ok ? '#00FFA3' : '#FF5050' }}>{value}</span>
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
            transition={{ delay: 0.18, duration: 0.32, ease: [0.25, 0, 0.1, 1] }}
            className="flex items-start justify-between mb-9"
          >
            <div>
              <h1 style={{
                color: '#EAF6F1',
                fontSize: 'clamp(28px, 2.2vw, 42px)',
                fontWeight: 620,
                letterSpacing: '-0.025em',
                lineHeight: 1.1,
                marginBottom: '8px',
              }}>
                My Projects
              </h1>
              <p style={{ color: '#9EC5BC', fontSize: 'clamp(13px, 0.9vw, 15px)', lineHeight: 1.5, maxWidth: '420px' }}>
                Manage simulations, collaborate in real-time, and analyze post-mortems.
              </p>
            </div>
            <button
              onClick={() => navigate('/workspace')}
              className="flex items-center gap-2.5 flex-shrink-0 iz-btn-green uppercase tracking-wider"
              style={{
                color: '#020F0A',
                padding: '13px 28px',
                borderRadius: '2px',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.07em',
                transition: 'all 160ms cubic-bezier(0.2,0,0,1)',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(0,43,26,0), #020908)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(0,43,26,0), #020908)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(0,43,26,0), #020908)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(0,43,26,0), #020908)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              <Plus style={{ width: '16px', height: '16px' }} />
              <span>New Project</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', opacity: 0.6, letterSpacing: '0.1em' }}>INIT</span>
            </button>
          </motion.div>

          {/* â”€â”€ Join Live Session Panel â”€â”€ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.32, ease: [0.25, 0, 0.1, 1] }}
            className="mb-10"
            style={{
              background: 'linear-gradient(135deg, #040F0E 0%, #061512 100%)',
              border: '1px solid rgba(0,255,170,0.12)',
              borderTop: '1px solid rgba(0,255,170,0.18)',
              borderRadius: '16px',
              padding: '28px 28px',
              boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
            }}
          >
            <div className="flex items-start gap-3 mb-5">
              <div style={{
                width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0,
                background: 'rgba(0,255,170,0.06)',
                border: '1px solid rgba(0,255,170,0.14)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Users style={{ width: '16px', height: '16px', color: '#00C988' }}/>
              </div>
              <div>
                <h2 style={{ color: '#E0F4EE', fontSize: '16px', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '3px' }}>
                  Join Live Session
                </h2>
                <p style={{ color: '#9EC5BC', fontSize: '13px', lineHeight: 1.5 }}>
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
                style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(0,255,170,0.15)',
                  borderRadius: '9px',
                  color: '#C8E0DA',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12.5px',
                  padding: '10px 14px',
                  outline: 'none',
                  transition: 'border-color 180ms ease',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(0,255,170,0.4)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(0,255,170,0.15)'}
              />
              <button
                className="iz-btn-green uppercase tracking-wider"
                style={{
                  color: '#020F0A',
                  padding: '13px 28px',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 160ms cubic-bezier(0.2,0,0,1)',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
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
                style={{ color: '#00C988', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}
              >
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00C988', flexShrink: 0 }}/>
                SESSION VERIFIED
              </motion.div>
            )}
          </motion.div>

          {/* â”€â”€ Project Grid â”€â”€ */}
          {projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project, index) => {
                const radii = [14, 16, 14, 15, 16, 14];
                const radius = radii[index % radii.length];
                const statusColor = project.isFailed ? '#F0625A' : project.isDraft ? '#7A9E97' : '#00C988';
                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.38 + index * 0.07, duration: 0.3, ease: [0.25, 0, 0.1, 1] }}
                    className="cursor-pointer group relative"
                    style={{
                      background: 'linear-gradient(160deg, #040F0C 0%, #061410 100%)',
                      border: '1px solid rgba(0,255,170,0.1)',
                      borderTop: '1px solid rgba(0,255,170,0.18)',
                      borderRadius: `${radius}px`,
                      boxShadow: '0 2px 0 0 rgba(0,255,170,0.04) inset, 0 10px 28px rgba(0,0,0,0.4)',
                      transition: 'all 200ms cubic-bezier(0.2, 0, 0, 1)',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.transform = 'translateY(-2px)';
                      el.style.borderTopColor = 'rgba(0,255,170,0.28)';
                      el.style.boxShadow = '0 2px 0 0 rgba(0,255,170,0.05) inset, 0 18px 44px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,255,170,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.transform = 'translateY(0)';
                      el.style.borderTopColor = 'rgba(0,255,170,0.18)';
                      el.style.boxShadow = '0 2px 0 0 rgba(0,255,170,0.04) inset, 0 10px 28px rgba(0,0,0,0.4)';
                    }}
                  >
                    {/* Context menu */}
                    <div ref={openMenuId === project.id ? menuRef : undefined} className="absolute top-3 right-3 z-20">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === project.id ? null : project.id); }}
                        className="p-1.5 transition-all"
                        style={{
                          background: openMenuId === project.id ? 'rgba(0,200,140,0.12)' : 'rgba(0,0,0,0.45)',
                          border: `1px solid ${openMenuId === project.id ? 'rgba(0,200,140,0.35)' : 'rgba(0,200,140,0.15)'}`,
                          borderRadius: '7px',
                          color: openMenuId === project.id ? '#00C988' : '#4E7268',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,140,0.35)'; e.currentTarget.style.color = '#00C988'; }}
                        onMouseLeave={(e) => {
                          if (openMenuId !== project.id) {
                            e.currentTarget.style.borderColor = 'rgba(0,200,140,0.15)';
                            e.currentTarget.style.color = '#4E7268';
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
                            transition={{ duration: 0.14, ease: 'easeOut' }}
                            className="absolute right-0 top-full mt-1.5"
                            style={{
                            background: 'linear-gradient(160deg, #040F0C 0%, #061410 100%)',
                              border: '1px solid rgba(0,255,170,0.15)',
                              borderRadius: '11px',
                              minWidth: '165px',
                              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                              padding: '4px',
                            }}
                          >
                            <button
                              onClick={(e) => handleShare(e, project.id, project.title)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all"
                              style={{ color: '#9DBFB9', fontSize: '12.5px', borderRadius: '8px' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,200,140,0.08)'; e.currentTarget.style.color = '#00C988'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9DBFB9'; }}
                            >
                              {copiedId === project.id
                                ? <Check style={{ width: '13px', height: '13px', color: '#00C988', flexShrink: 0 }} />
                                : <Share2 style={{ width: '13px', height: '13px', flexShrink: 0 }} />}
                              <span>{copiedId === project.id ? 'Link Copied!' : 'Share Project'}</span>
                            </button>
                            <div style={{ height: '1px', background: 'rgba(0,200,140,0.08)', margin: '2px 0' }} />
                            <button
                              onClick={(e) => handleDelete(e, project.id)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all"
                              style={{ color: '#9DBFB9', fontSize: '12.5px', borderRadius: '8px' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(240,98,90,0.08)'; e.currentTarget.style.color = '#f0625a'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9DBFB9'; }}
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
                      background: 'linear-gradient(160deg, #020A08 0%, #040E0C 100%)',
                      borderBottom: '1px solid rgba(0,255,170,0.08)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: 'radial-gradient(circle, rgba(0,255,170,0.04) 1px, transparent 1px)',
                        backgroundSize: '18px 18px',
                      }}/>
                      <GraphThumbnail variant={index} failed={project.isFailed} />

                      {/* Status badge */}
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1" style={{
                        background: 'rgba(4,14,12,0.88)',
                        border: `1px solid ${project.grade ? 'rgba(0,200,140,0.28)' : project.isFailed ? 'rgba(240,98,90,0.28)' : 'rgba(120,160,155,0.22)'}`,
                        borderRadius: '6px',
                        backdropFilter: 'blur(6px)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '10px',
                        color: statusColor,
                        letterSpacing: '0.04em',
                      }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0 }}/>
                        {project.grade ? `GRADE ${project.grade}` : project.isDraft ? 'DRAFT' : 'FAILED'}
                      </div>

                      {/* Hover quick actions */}
                      <div className="absolute top-3 left-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        {([Play, FileText] as React.ComponentType<{ style?: React.CSSProperties }>[]).map((Icon, i) => (
                          <button key={i} className="p-1.5 transition-all" style={{
                            background: 'rgba(4,14,12,0.85)',
                            border: '1px solid rgba(0,200,140,0.2)',
                            borderRadius: '7px',
                            color: '#4E7268',
                          }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,140,0.45)'; e.currentTarget.style.color = '#00C988'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,140,0.2)'; e.currentTarget.style.color = '#4E7268'; }}
                          >
                            <Icon style={{ width: '13px', height: '13px' }} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Card body */}
                    <div style={{ padding: '16px 18px 18px' }}>
                      <h3 style={{
                        color: '#DCF0EA', fontSize: '15.5px', fontWeight: 560,
                        letterSpacing: '-0.02em', marginBottom: '6px', lineHeight: 1.3,
                      }}>
                        {project.title}
                      </h3>
                      <div style={{
                        color: statusColor, fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '11px', marginBottom: '10px', letterSpacing: '0.01em',
                      }}>
                        {project.status}
                      </div>
                      <div className="flex items-center gap-2">
                        {project.isCollaborative && (
                          <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#00C988', flexShrink: 0 }}/>
                        )}
                        <span style={{ color: '#7DADA5', fontFamily: 'JetBrains Mono, monospace', fontSize: '10.5px' }}>
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
              <h3 style={{ color: '#DCF0EA', fontSize: '26px', fontWeight: 600, letterSpacing: '-0.025em', marginBottom: '12px' }}>
                No Active Architectures
              </h3>
              <p style={{ color: '#9EC5BC', fontSize: '14px', maxWidth: '440px', margin: '0 auto 28px', lineHeight: 1.6 }}>
                Initialize your first distributed system and run a deterministic simulation.
              </p>
              <button
                style={{
                  background: 'linear-gradient(135deg, #00D49A 0%, #00B882 100%)',
                  color: '#020F0A', padding: '12px 32px', borderRadius: '11px',
                  fontSize: '13.5px', fontWeight: 600, letterSpacing: '0.01em',
                  border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(0,180,130,0.25)',
                  transition: 'all 160ms cubic-bezier(0.2,0,0,1)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
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
