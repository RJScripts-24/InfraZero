import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, FileText, MoreVertical, Plus, Share2, Trash2, Check, LayoutGrid, Users, Settings2, Zap, Pencil, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { getUser, isTemporaryGuest } from '../../lib/auth';
import * as api from '../../lib/api';
import { toast } from 'sonner';

// ── Premium graph thumbnail variants ─────────────────────────────────
// Per-variant stroke opacity multipliers — subtle blue variations
const VARIANT_STROKE_OPACITIES = [0.40, 0.36, 0.44, 0.38];
const VARIANT_STROKE_BRIGHT    = [0.68, 0.64, 0.72, 0.66];

// Per-card dot grid opacity
const DOT_GRID_OPACITIES = [0.86, 0.93, 0.77, 0.97, 0.81, 0.91];

const GraphThumbnail = ({ variant, failed }: { variant: number; failed?: boolean }) => {
  const idx    = variant % VARIANT_STROKE_OPACITIES.length;
  const dimO   = VARIANT_STROKE_OPACITIES[idx];
  const brightO= VARIANT_STROKE_BRIGHT[idx];
  const stroke = failed ? `rgba(239, 68, 68, ${dimO})` : `rgba(59, 130, 246, ${dimO})`;
  const strokeBright = failed ? `rgba(239, 68, 68, ${brightO})` : `rgba(59, 130, 246, ${brightO})`;
  const fill = failed ? '#1a0a0a' : '#05070a';
  const fillActive = failed ? '#200d0d' : '#0a101f';
  const nodeFill = failed ? '#EF4444' : '#3B82F6';

  const variants: React.ReactNode[] = [
    // Variant 0: three-tier architecture
    <g key="v0">
      <line x1="150" y1="40" x2="90" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="150" y1="40" x2="210" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="90" y1="90" x2="90" y2="138" stroke={stroke} strokeWidth="1.2"/>
      <line x1="210" y1="90" x2="210" y2="138" stroke={stroke} strokeWidth="1.2"/>
      <rect x="125" y="28" width="50" height="22" rx="6" fill={fillActive} stroke={strokeBright} strokeWidth="1.2"/>
      <rect x="65"  y="78" width="50" height="22" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="185" y="78" width="50" height="22" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="65"  y="126" width="50" height="22" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="185" y="126" width="50" height="22" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>
      <motion.circle r="2.5" fill={nodeFill} cx="150" cy="40"
        animate={{ opacity: [0.9, 0.4, 0.9] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}/>
    </g>,
    // Variant 1: ring topology
    <g key="v1">
      <circle cx="150" cy="90" r="52" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="4 3"/>
      <line x1="150" y1="38" x2="198" y2="116" stroke={stroke} strokeWidth="1.1"/>
      <line x1="198" y1="116" x2="102" y2="116" stroke={stroke} strokeWidth="1.1"/>
      <line x1="102" y1="116" x2="150" y2="38" stroke={stroke} strokeWidth="1.1"/>
      <rect x="134" y="26" width="32" height="20" rx="6" fill={fillActive} stroke={strokeBright} strokeWidth="1.2"/>
      <rect x="186" y="106" width="28" height="20" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="86"  y="106" width="28" height="20" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>
      <motion.circle r="2.5" fill={nodeFill} cx="150" cy="36"
        animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}/>
    </g>,
    // Variant 2: pipeline
    <g key="v2">
      <line x1="44" y1="90" x2="100" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="124" y1="90" x2="176" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="200" y1="90" x2="256" y2="90" stroke={stroke} strokeWidth="1.2"/>
      <line x1="150" y1="65" x2="150" y2="78" stroke={stroke} strokeWidth="1"/>
      <rect x="20"  y="78" width="48" height="24" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="100" y="78" width="48" height="24" rx="6" fill={fillActive} stroke={strokeBright} strokeWidth="1.2"/>
      <rect x="176" y="78" width="48" height="24" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>
      <rect x="130" y="50" width="40" height="17" rx="6" fill={fill} stroke={stroke} strokeWidth="0.9"/>
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
        return <rect key={i} x={cx - 14} y={cy - 10} width="28" height="20" rx="6" fill={fill} stroke={stroke} strokeWidth="1"/>;
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

type DashboardProject = {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  lastEdited: string;
  isCollaborative: boolean;
  grade?: string | null;
  isDraft?: boolean;
  isFailed?: boolean;
};

/** "3 minutes ago" reads better on a card than a raw ISO timestamp. */
const relativeTime = (iso: string): string => {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'Recently';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString();
};

const toDashboardProject = (project: api.ProjectListItem): DashboardProject => ({
  id: project.id,
  title: project.title,
  status:
    project.status === 'Draft'
      ? 'Draft'
      : project.status === 'Failure'
        ? 'Simulation Failed'
        // A project with no stored letter has genuinely not been graded: the
        // model withheld it, or could not be reached. Inventing a B here was a
        // guess presented as a result.
        : project.grade
          ? `Graded: ${project.grade}`
          : 'Grade withheld',
  statusColor: project.statusColor,
  lastEdited: relativeTime(project.lastEdited),
  isCollaborative: project.isCollaborative,
  grade: project.grade,
  isDraft: project.status === 'Draft',
  isFailed: project.status === 'Failure',
});

export default function DashboardPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const [inviteLink, setInviteLink] = useState('');
  const [activeNav, setActiveNav] = useState('My Projects');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DashboardProject | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [renaming, setRenaming] = useState<DashboardProject | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const guest = isTemporaryGuest();

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

  const refreshProjects = useCallback(async () => {
    if (guest) {
      setProjects([]);
      setIsLoading(false);
      return;
    }
    try {
      const data = await api.listProjects();
      setProjects(data.map(toDashboardProject));
      setLoadError(null);
    } catch (err) {
      // Surfaced in the grid rather than silently falling back to fake rows -
      // showing invented projects when the backend is down is worse than an error.
      setLoadError(err instanceof Error ? err.message : 'Could not load projects.');
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [guest]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  /**
   * True while a create request is in flight.
   *
   * Creation can be triggered two ways, Enter in the name field and the Create
   * button, and the dialog stayed open until the request came back. Two
   * triggers a few hundred milliseconds apart therefore posted twice and made
   * two projects with the same name: the navigation followed the first, so one
   * row collected the graph and the grade while the other sat empty on the
   * dashboard forever. A ref, not state, because the second trigger can arrive
   * before React has re-rendered.
   */
  const isCreatingProjectRef = useRef(false);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);

  const handleCreateProject = async () => {
    const title = newProjectName.trim();
    if (!title || isCreatingProjectRef.current) return;

    isCreatingProjectRef.current = true;
    setIsSubmittingProject(true);
    try {
      const created = await api.createProject(title);
      setIsCreating(false);
      setNewProjectName('');
      toast.success(`Created "${created.title}"`);
      navigate(`/workspace?project=${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the project.');
    } finally {
      isCreatingProjectRef.current = false;
      setIsSubmittingProject(false);
    }
  };

  const handleRename = async () => {
    if (!renaming) return;
    const title = renameValue.trim();
    if (!title || title === renaming.title) {
      setRenaming(null);
      return;
    }

    setBusyId(renaming.id);
    try {
      await api.renameProject(renaming.id, title);
      setRenaming(null);
      toast.success('Project renamed.');
      await refreshProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename the project.');
    } finally {
      setBusyId(null);
    }
  };

  const handleShare = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setBusyId(projectId);
    try {
      const { inviteLink: link } = await api.createInviteLink(projectId);
      await navigator.clipboard.writeText(link).catch(() => undefined);
      setCopiedId(projectId);
      setTimeout(() => setCopiedId(null), 2500);
      toast.success('Invite link copied. Anyone with this link can edit live.');
      await refreshProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create an invite link.');
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setBusyId(target.id);
    try {
      await api.deleteProject(target.id);
      setPendingDelete(null);
      setProjects((prev) => prev.filter((p) => p.id !== target.id));
      toast.success(`Deleted "${target.title}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the project.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Accepts either a full invite URL or the bare token, since people paste both.
   */
  const handleJoinSession = async () => {
    const raw = inviteLink.trim();
    if (!raw) return;

    let token = raw;
    try {
      const parsed = new URL(raw);
      token = parsed.searchParams.get('invite') || parsed.pathname.split('/').filter(Boolean).pop() || raw;
    } catch {
      // Not a URL - treat the input as the token itself.
    }

    setIsJoining(true);
    try {
      const invite = await api.resolveInvite(token);
      toast.success(`Joining "${invite.title}"`);
      navigate(`/workspace?invite=${encodeURIComponent(token)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That invite link is not valid.');
    } finally {
      setIsJoining(false);
    }
  };

  const navItems = [
    { label: 'My Projects',    icon: LayoutGrid },
    { label: 'Settings',       icon: Settings2 },
  ];

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ backgroundColor: '#000000', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Background layer: Stars & Grid ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <img src="/night-hero.png" alt="Atmosphere" className="absolute inset-0 object-cover w-full h-full opacity-60 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-black/80" />
      </div>

      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: [
          'linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '80px 80px',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%)',
      }} />

      {/* ── LEFT SIDEBAR (Glassmorphism) ── */}
      <motion.aside
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0, 0.1, 1] }}
        className="relative z-10 flex-shrink-0"
        style={{
          width: '260px',
          background: 'rgba(9, 9, 11, 0.6)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="h-screen flex flex-col">

          {/* Logo Section */}
          <div className="px-8 py-8 flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
             <span className="font-bold tracking-tight text-white text-xl">InfraZero</span>
             <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
          </div>

          {/* User Profile Block */}
          <div className="px-5 pb-6">
            <div className="flex items-center gap-3 px-3 py-3" style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
            }}>
              <div className="relative flex-shrink-0">
                <div className="rounded-full flex items-center justify-center"
                  style={{
                    width: '38px', height: '38px',
                    background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
                    border: '1px solid rgba(59,130,246,0.3)',
                  }}>
                  <span style={{ color: '#60A5FA', fontSize: '15px', fontWeight: 600 }}>{(currentUser?.name?.[0] || 'G').toUpperCase()}</span>
                </div>
                <div className="absolute bottom-0 right-0 rounded-full"
                  style={{ width: '10px', height: '10px', backgroundColor: '#3B82F6', border: '2px solid #09090B' }}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-[14px] font-medium truncate">{currentUser?.name || 'Guest User'}</div>
                <div className="text-zinc-500 text-[11px] truncate">{currentUser?.email || ''}</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-1">
            {navItems.map(({ label, icon: Icon }, index) => {
              const isActive = activeNav === label;
              return (
                <motion.button
                  key={label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05, duration: 0.25 }}
                  onClick={() => {
                    if (label === 'Settings') navigate('/settings');
                    else setActiveNav(label);
                  }}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-all rounded-xl relative ${isActive ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
                >
                  <Icon size={16} className={isActive ? 'opacity-100' : 'opacity-60'} />
                  <span className="text-[14px] font-medium">{label}</span>
                  {isActive && <motion.div layoutId="nav-glow" className="absolute left-0 w-1 h-4 bg-blue-500 rounded-full blur-[2px]" />}
                </motion.button>
              );
            })}
          </nav>

        </div>
      </motion.aside>

      {/* ── MAIN CONTENT AREA ── */}
      <main className="flex-1 relative z-10" style={{ overflowY: 'auto' }}>
        <div className="px-8 lg:px-12 py-10 max-w-[1600px] mx-auto">

          {/* Header Row */}
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.32 }}
            className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6"
          >
            <div>
              <h1 className="text-white text-5xl font-bold tracking-tight mb-3">
                My Projects
              </h1>
              <p className="text-zinc-400 text-lg max-w-lg leading-relaxed">
                Manage simulations, collaborate in real-time, and analyze deterministic post-mortems.
              </p>
            </div>
            
            <motion.button
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setNewProjectName(''); setIsCreating(true); }}
              disabled={guest}
              className="iz-btn-blue relative overflow-hidden text-white font-bold py-3.5 px-8 rounded-xl flex items-center gap-3 transition-all shadow-[0_20px_40px_-10px_rgba(59,130,246,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {/* SVG Border Animation */}
              <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              
              <Plus size={18} />
              New Project
              <span className="font-mono text-[10px] opacity-50 tracking-widest pl-2">INIT</span>
            </motion.button>
          </motion.div>

          {/* ── Join Live Session Panel (Glassmorphism) ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.32 }}
            className="mb-12 p-8 rounded-[24px] border border-white/10 bg-zinc-900/40 backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-start gap-5 mb-6">
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Users size={20} />
              </div>
              <div>
                <h2 className="text-white text-xl font-bold mb-1">Join Live Session</h2>
                <p className="text-zinc-400">Paste an invite link to edit the architecture live with its owner.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={inviteLink}
                onChange={(e) => setInviteLink(e.target.value)}
                placeholder="Paste an invite link or token"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleJoinSession(); }}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-5 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/50 transition-all"
              />
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void handleJoinSession()}
                disabled={isJoining || !inviteLink.trim()}
                className="iz-btn-blue relative overflow-hidden py-3 px-10 rounded-xl text-white font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {/* SVG Border Animation */}
                <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                {isJoining ? 'Joining...' : 'Join'}
              </motion.button>
            </div>
          </motion.div>

          {/* ── Project Grid ── */}
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 py-32 text-zinc-500">
              <Loader2 size={20} className="animate-spin text-blue-500" />
              <span className="text-sm font-medium">Loading your projects...</span>
            </div>
          ) : loadError ? (
            <div className="py-24 text-center">
              <div className="inline-block px-8 py-6 rounded-2xl border border-red-500/20 bg-red-500/5">
                <p className="text-red-400 font-bold mb-2">Could not load your projects</p>
                <p className="text-zinc-500 text-sm mb-5 max-w-md">{loadError}</p>
                <button
                  onClick={() => { setIsLoading(true); void refreshProjects(); }}
                  className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-bold hover:bg-white/10 transition-all"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : guest ? (
            <div className="py-24 text-center">
              <div className="inline-block px-8 py-6 rounded-2xl border border-white/10 bg-zinc-900/40">
                <p className="text-white font-bold mb-2">You are exploring as a guest</p>
                <p className="text-zinc-500 text-sm mb-5 max-w-md">
                  Guest sessions are not saved. Sign in to create projects, run simulations and keep your reports.
                </p>
                <button
                  onClick={() => navigate('/auth')}
                  className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition-all"
                >
                  Sign in
                </button>
              </div>
            </div>
          ) : projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {projects.map((project, index) => {
                const statusColor  = project.isFailed ? '#EF4444' : project.isDraft ? '#71717A' : '#3B82F6';
                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 + index * 0.08 }}
                    className="group relative rounded-[28px] border border-white/10 bg-zinc-900/30 backdrop-blur-2xl hover:bg-zinc-900/50 transition-all duration-500 overflow-hidden shadow-[0_20px_50px_-15px_rgba(0,0,0,0.4)]"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                  >
                    {/* Thumbnail Viewport */}
                    <div className="h-44 relative bg-black/40 border-b border-white/5 overflow-hidden">
                       {/* Subtle Background Interaction */}
                      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                         backgroundImage: `radial-gradient(circle, rgba(59,130,246,0.3) 1px, transparent 1px)`,
                         backgroundSize: '20px 20px',
                         opacity: DOT_GRID_OPACITIES[index % DOT_GRID_OPACITIES.length] * 0.4
                      }} />
                      
                      <GraphThumbnail variant={index} failed={project.isFailed} />

                      {/* Status Overlay */}
                      <div className="absolute bottom-3 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                        <span className="text-[10px] font-mono font-bold tracking-widest text-white/80 uppercase">
                          {project.isDraft
                            ? 'Draft'
                            : project.isFailed
                              ? 'Failure'
                              : project.grade
                                ? `Grade ${project.grade}`
                                : 'Ungraded'}
                        </span>
                      </div>

                      {/* Over-the-thumbnail Menu Toggle */}
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === project.id ? null : project.id); }}
                            className="p-2 rounded-xl bg-black/50 border border-white/20 text-white/60 hover:text-white"
                          >
                            <MoreVertical size={14} />
                          </button>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="p-7">
                      <div className="flex items-start justify-between mb-2">
                        <h3
                          onClick={() => navigate(`/workspace?project=${project.id}`)}
                          className="text-white text-xl font-bold tracking-tight cursor-pointer hover:text-blue-400 transition-colors"
                        >
                          {project.title}
                        </h3>
                        {project.isCollaborative && (
                          <div className="flex -space-x-2">
                            <div className="w-6 h-6 rounded-full border border-black bg-blue-500 flex items-center justify-center text-[10px] font-bold">U1</div>
                            <div className="w-6 h-6 rounded-full border border-black bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400">+2</div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 mb-6">
                        <span className="text-sm font-medium" style={{ color: statusColor }}>{project.status}</span>
                        <div className="w-1 h-1 rounded-full bg-zinc-800" />
                        <span className="text-xs text-zinc-500 font-mono">{project.lastEdited}</span>
                      </div>

                      <div className="flex items-center gap-3">
                         <button
                            onClick={() => navigate(`/workspace?project=${project.id}&run=1`)}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2">
                            <Play size={14} fill="currentColor" />
                            Run Sim
                         </button>
                         <button
                            title={project.isDraft ? 'Run a simulation first to generate a report' : 'Open the latest report'}
                            onClick={() => navigate(`/workspace?project=${project.id}&report=1`)}
                            disabled={project.isDraft}
                            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                            <FileText size={16} />
                         </button>
                      </div>
                    </div>

                    {/* Project Context Menu (Absolute) */}
                    <AnimatePresence>
                      {openMenuId === project.id && (
                        <div ref={menuRef} className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
                           <motion.div 
                             initial={{ opacity:0, scale:0.9 }}
                             animate={{ opacity:1, scale:1 }}
                             className="w-full space-y-2"
                           >
                              <div className="text-center mb-4">
                                <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Project Actions</p>
                                <h4 className="text-white font-bold">{project.title}</h4>
                              </div>
                              <button
                                onClick={(e) => void handleShare(e, project.id)}
                                disabled={busyId === project.id}
                                className="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-all flex items-center gap-3 justify-center disabled:opacity-50">
                                {busyId === project.id
                                  ? <Loader2 size={16} className="animate-spin" />
                                  : copiedId === project.id
                                    ? <Check size={16} className="text-blue-400" />
                                    : <Share2 size={16} />}
                                {copiedId === project.id ? 'Invite Copied' : 'Share Project'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenaming(project);
                                  setRenameValue(project.title);
                                  setOpenMenuId(null);
                                }}
                                className="w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-all flex items-center gap-3 justify-center">
                                <Pencil size={16} />
                                Rename Project
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setPendingDelete(project); setOpenMenuId(null); }}
                                className="w-full py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium hover:bg-red-500/20 transition-all flex items-center gap-3 justify-center">
                                <Trash2 size={16} />
                                Delete Project
                              </button>
                              <button onClick={() => setOpenMenuId(null)} className="w-full py-2 text-zinc-500 text-sm hover:text-zinc-300">
                                Close
                              </button>
                           </motion.div>
                        </div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-center py-32"
            >
              <div className="w-20 h-20 bg-blue-500/10 border border-blue-500/20 rounded-3xl mx-auto flex items-center justify-center mb-8">
                 <Zap size={32} className="text-blue-500" />
              </div>
              <h3 className="text-white text-3xl font-bold tracking-tight mb-4">
                No active architectures
              </h3>
              <p className="text-zinc-500 text-lg max-w-sm mx-auto mb-10 leading-relaxed">
                Create your first architecture, then run a simulation to grade it.
              </p>
              <button
                onClick={() => { setNewProjectName(''); setIsCreating(true); }}
                className="iz-btn-blue relative overflow-hidden py-4 px-12 rounded-xl text-white font-bold"
              >
                {/* SVG Border Animation */}
                <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                Create Project
              </button>
            </motion.div>
          )}
        </div>
      </main>

      {/* ── Create / Rename / Delete dialogs ── */}
      <AnimatePresence>
        {(isCreating || renaming) && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => { setIsCreating(false); setRenaming(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="relative w-full max-w-md p-8 rounded-[28px] border border-white/10 bg-zinc-900 shadow-2xl"
            >
              <h2 className="text-white text-2xl font-bold mb-2 tracking-tight">
                {renaming ? 'Rename project' : 'New project'}
              </h2>
              <p className="text-zinc-500 text-sm mb-6">
                {renaming
                  ? 'Give this architecture a clearer name.'
                  : 'Name your architecture. You can rename it at any time.'}
              </p>

              <input
                autoFocus
                value={renaming ? renameValue : newProjectName}
                maxLength={120}
                onChange={(e) => (renaming ? setRenameValue(e.target.value) : setNewProjectName(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void (renaming ? handleRename() : handleCreateProject());
                  if (e.key === 'Escape') { setIsCreating(false); setRenaming(null); }
                }}
                placeholder="e.g. Payments Platform"
                className="w-full px-5 py-3.5 bg-black/50 border border-white/10 rounded-xl text-white font-medium focus:outline-none focus:border-blue-500/60 transition-all placeholder:text-zinc-700 mb-6"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => { setIsCreating(false); setRenaming(null); }}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-zinc-400 font-medium hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void (renaming ? handleRename() : handleCreateProject())}
                  disabled={
                    !(renaming ? renameValue.trim() : newProjectName.trim()) ||
                    (!renaming && isSubmittingProject)
                  }
                  className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {renaming ? 'Save' : isSubmittingProject ? 'Creating...' : 'Create'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingDelete && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setPendingDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="relative w-full max-w-md p-8 rounded-[28px] border border-red-500/25 bg-zinc-900 shadow-2xl text-center"
            >
              <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5 text-red-500">
                <Trash2 size={26} />
              </div>
              <h2 className="text-white text-2xl font-bold mb-3 tracking-tight">Delete project</h2>
              <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                <span className="text-white font-semibold">{pendingDelete.title}</span> and all of its
                simulation reports will be permanently deleted. This cannot be undone.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => void handleDelete()}
                  disabled={busyId === pendingDelete.id}
                  className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busyId === pendingDelete.id && <Loader2 size={16} className="animate-spin" />}
                  Delete permanently
                </button>
                <button
                  onClick={() => setPendingDelete(null)}
                  className="w-full py-2.5 text-zinc-500 font-medium hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
