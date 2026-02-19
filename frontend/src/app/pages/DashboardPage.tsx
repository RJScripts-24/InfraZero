import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Play, FileText, MoreVertical, Plus, Share2, Trash2, Check } from 'lucide-react';
import { useNavigate } from 'react-router';

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

  const navItems = ['My Projects', 'Shared with Me', 'Library of Doom', 'Settings'];

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#020908', fontFamily: 'Inter, sans-serif' }}>
      {/* Vertical Grid Overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(to right, rgba(0,255,170,0.06) 0px, rgba(0,255,170,0.06) 1px, transparent 1px, transparent 80px)',
        backgroundSize: '80px 100%'
      }} />

      {/* LEFT SIDEBAR */}
      <motion.aside
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: 'linear' }}
        className="relative z-10"
        style={{ width: '260px', backgroundColor: '#040F0E', borderRight: '1px solid rgba(0,255,170,0.15)' }}
      >
        <div className="h-screen flex flex-col">
          {/* User Profile Block */}
          <div className="p-6 border-b" style={{ borderColor: 'rgba(0,255,170,0.15)' }}>
            <div className="flex items-center gap-3 border p-3" style={{ borderColor: 'rgba(0,255,170,0.2)', borderRadius: '2px' }}>
              <div className="relative">
                <div className="rounded-full flex items-center justify-center border" 
                  style={{ width: '40px', height: '40px', borderColor: 'rgba(0,255,170,0.3)', backgroundColor: '#020908' }}>
                  <span style={{ color: '#00FFA3', fontSize: '16px' }}>G</span>
                </div>
                <div className="absolute bottom-0 right-0 rounded-full" 
                  style={{ width: '10px', height: '10px', backgroundColor: '#00FFA3', border: '2px solid #040F0E' }}></div>
              </div>
              <div className="flex-1">
                <div style={{ color: '#E6F1EF', fontSize: '14px', fontWeight: 500 }}>Guest User</div>
                <div style={{ color: '#8FA9A3', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
                  Research Tier
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="flex-1 py-6">
            {navItems.map((item, index) => (
              <motion.button
                key={item}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.05, duration: 0.2, ease: 'linear' }}
                onClick={() => {
                  if (item === 'Settings') {
                    navigate('/settings');
                  } else {
                    setActiveNav(item);
                  }
                }}
                className="w-full text-left px-6 py-3 transition-all relative"
                style={{
                  color: activeNav === item ? '#00FFA3' : '#8FA9A3',
                  backgroundColor: activeNav === item ? '#071512' : 'transparent',
                  fontSize: '14px',
                  fontWeight: 500
                }}
                onMouseEnter={(e) => {
                  if (activeNav !== item) {
                    e.currentTarget.style.color = '#00FFA3';
                    e.currentTarget.style.backgroundColor = 'rgba(15,46,43,0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeNav !== item) {
                    e.currentTarget.style.color = '#8FA9A3';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {activeNav === item && (
                  <div className="absolute left-0 top-0 bottom-0" 
                    style={{ width: '3px', backgroundColor: '#00FFA3' }}></div>
                )}
                {item}
              </motion.button>
            ))}
          </nav>

          {/* System Status Block */}
          <div className="p-6 border-t" style={{ borderColor: 'rgba(0,255,170,0.15)' }}>
            <div className="uppercase mb-3" 
              style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', letterSpacing: '0.05em' }}>
              System Status
            </div>
            <div className="space-y-1.5" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
              <div className="flex items-center gap-2">
                <span style={{ color: '#8FA9A3' }}>CRDT:</span>
                <span style={{ color: '#00FFA3' }}>SYNCED</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: '#8FA9A3' }}>WASM ENGINE:</span>
                <span style={{ color: '#00FFA3' }}>READY</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: '#8FA9A3' }}>LOCAL-FIRST:</span>
                <span style={{ color: '#00FFA3' }}>ACTIVE</span>
              </div>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 relative z-10" style={{ overflowY: 'auto' }}>
        <div className="px-12 py-10">
          {/* Header Row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3, ease: 'linear' }}
            className="flex items-start justify-between mb-10"
          >
            <div>
              <h1 className="mb-2" style={{ color: '#E6F1EF', fontSize: 'clamp(32px, 2.5vw, 48px)', fontWeight: 600 }}>
                My Projects
              </h1>
              <p style={{ color: '#8FA9A3', fontSize: 'clamp(14px, 1vw, 18px)' }}>
                Manage simulations, collaborate in real-time, and analyze post-mortems.
              </p>
            </div>
            <button 
              onClick={() => navigate('/workspace')}
              className="flex items-center gap-2 transition-all"
              style={{ 
                backgroundColor: '#00FFA3', 
                color: '#020908', 
                padding: '14px 28px', 
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 500
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#00D98C'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00FFA3'}
            >
              <Plus style={{ width: '18px', height: '18px' }} />
              <span>New Project</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', opacity: 0.8 }}>INIT</span>
            </button>
          </motion.div>

          {/* Join Session Panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3, ease: 'linear' }}
            className="border mb-12 p-8"
            style={{ backgroundColor: '#040F0E', borderColor: 'rgba(0,255,170,0.2)', borderRadius: '4px' }}
          >
            <h2 className="mb-2" style={{ color: '#E6F1EF', fontSize: '22px', fontWeight: 600 }}>
              Join Live Session
            </h2>
            <p className="mb-6" style={{ color: '#8FA9A3', fontSize: '14px' }}>
              Paste an invite link to instantly join a collaborative simulation.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={inviteLink}
                onChange={(e) => setInviteLink(e.target.value)}
                placeholder="https://infrazero.dev/invite/..."
                className="flex-1 border transition-all px-4 py-3"
                style={{
                  backgroundColor: '#020908',
                  borderColor: 'rgba(0,255,170,0.3)',
                  color: '#E6F1EF',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '13px',
                  borderRadius: '2px',
                  outline: 'none'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#00FFA3'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)'}
              />
              <button className="transition-all uppercase tracking-wider"
                style={{
                  backgroundColor: '#00FFA3',
                  color: '#020908',
                  padding: '12px 32px',
                  borderRadius: '2px',
                  fontSize: '14px',
                  fontWeight: 600
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#00D98C'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00FFA3'}
              >
                Join
              </button>
            </div>
            {inviteLink && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: 'linear' }}
                className="mt-4"
                style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}
              >
                SESSION VERIFIED
              </motion.div>
            )}
          </motion.div>

          {/* Project Grid */}
          {projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + index * 0.08, duration: 0.3, ease: 'linear' }}
                  className="border cursor-pointer group relative transition-all"
                  style={{
                    backgroundColor: '#040F0E',
                    borderColor: 'rgba(0,255,170,0.2)',
                    borderRadius: '2px'
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#00FFA3';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(0,255,170,0.2)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  }}
                >
                  {/* Hamburger menu — top-right of card */}
                  <div ref={openMenuId === project.id ? menuRef : undefined} className="absolute top-3 right-3 z-20">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === project.id ? null : project.id); }}
                      className="p-1.5 border transition-all"
                      style={{
                        backgroundColor: openMenuId === project.id ? '#0F2E2B' : '#040F0E',
                        borderColor: openMenuId === project.id ? '#00FFA3' : 'rgba(0,255,170,0.35)',
                        borderRadius: '2px',
                        color: openMenuId === project.id ? '#00FFA3' : '#8FA9A3'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00FFA3'; e.currentTarget.style.color = '#00FFA3'; }}
                      onMouseLeave={(e) => {
                        if (openMenuId !== project.id) {
                          e.currentTarget.style.borderColor = 'rgba(0,255,170,0.35)';
                          e.currentTarget.style.color = '#8FA9A3';
                        }
                      }}
                    >
                      <MoreVertical style={{ width: '14px', height: '14px' }} />
                    </button>

                    <AnimatePresence>
                      {openMenuId === project.id && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.96 }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                          className="absolute right-0 top-full mt-1 border"
                          style={{
                            backgroundColor: '#040F0E',
                            borderColor: 'rgba(0,255,170,0.3)',
                            borderRadius: '2px',
                            minWidth: '160px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                          }}
                        >
                          {/* Share option */}
                          <button
                            onClick={(e) => handleShare(e, project.id, project.title)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
                            style={{ color: '#8FA9A3', fontSize: '13px', fontFamily: 'Inter, sans-serif' }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,255,170,0.07)'; e.currentTarget.style.color = '#00FFA3'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#8FA9A3'; }}
                          >
                            {copiedId === project.id
                              ? <Check style={{ width: '14px', height: '14px', color: '#00FFA3', flexShrink: 0 }} />
                              : <Share2 style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                            }
                            <span>{copiedId === project.id ? 'Link Copied!' : 'Share Project'}</span>
                          </button>

                          {/* Divider */}
                          <div style={{ height: '1px', backgroundColor: 'rgba(0,255,170,0.1)' }} />

                          {/* Delete option */}
                          <button
                            onClick={(e) => handleDelete(e, project.id)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
                            style={{ color: '#8FA9A3', fontSize: '13px', fontFamily: 'Inter, sans-serif' }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,59,59,0.08)'; e.currentTarget.style.color = '#FF3B3B'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#8FA9A3'; }}
                          >
                            <Trash2 style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                            <span>Delete Project</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {/* Thumbnail */}
                  <div className="relative border-b" 
                    style={{ 
                      height: '180px', 
                      backgroundColor: '#020908', 
                      borderColor: 'rgba(0,255,170,0.1)',
                      backgroundImage: 'radial-gradient(circle, rgba(0,255,170,0.03) 1px, transparent 1px)',
                      backgroundSize: '16px 16px'
                    }}>
                    {/* Mini graph visualization */}
                    <svg className="w-full h-full" viewBox="0 0 300 180" preserveAspectRatio="xMidYMid meet">
                      <line x1="80" y1="60" x2="150" y2="90" stroke="rgba(0,255,170,0.3)" strokeWidth="1.5" />
                      <line x1="220" y1="60" x2="150" y2="90" stroke="rgba(0,255,170,0.3)" strokeWidth="1.5" />
                      <line x1="150" y1="90" x2="150" y2="130" stroke="rgba(0,255,170,0.3)" strokeWidth="1.5" />
                      
                      <rect x="60" y="50" width="40" height="20" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                      <rect x="200" y="50" width="40" height="20" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                      <rect x="130" y="80" width="40" height="20" fill="#040F0E" stroke="#00FFA3" strokeWidth="1.5" />
                      <rect x="130" y="120" width="40" height="20" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                      
                      {/* Animated dots */}
                      <motion.circle r="2" fill="#00FFA3"
                        animate={{ cy: [60, 90, 130], opacity: [1, 0.5, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                        <animate attributeName="cx" values="80;150;150" dur="2s" repeatCount="indefinite" />
                      </motion.circle>
                    </svg>

                    {/* Grade/Status Badge — moved to top-left to avoid hamburger overlap */}
                    <div className="absolute top-3 left-3 px-2 py-1" 
                      style={{ 
                        backgroundColor: '#040F0E', 
                        borderColor: project.grade ? '#00FFA3' : (project.isFailed ? '#FF3B3B' : '#8FA9A3'),
                        border: '1px solid',
                        borderRadius: '2px',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '10px',
                        color: project.grade ? '#00FFA3' : (project.isFailed ? '#FF3B3B' : '#8FA9A3')
                      }}>
                      {project.grade ? `GRADE: ${project.grade}` : project.isDraft ? 'DRAFT' : 'FAILED'}
                    </div>

                    {/* Quick Actions (Hover Reveal) */}
                    <div className="absolute top-3 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 border transition-colors" 
                        style={{ backgroundColor: '#040F0E', borderColor: 'rgba(0,255,170,0.3)', borderRadius: '2px' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00FFA3'; e.currentTarget.style.color = '#00FFA3'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)'; e.currentTarget.style.color = '#8FA9A3'; }}>
                        <Play style={{ width: '14px', height: '14px', color: '#8FA9A3' }} />
                      </button>
                      <button className="p-1.5 border transition-colors" 
                        style={{ backgroundColor: '#040F0E', borderColor: 'rgba(0,255,170,0.3)', borderRadius: '2px' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00FFA3'; e.currentTarget.style.color = '#00FFA3'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)'; e.currentTarget.style.color = '#8FA9A3'; }}>
                        <FileText style={{ width: '14px', height: '14px', color: '#8FA9A3' }} />
                      </button>

                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-5">
                    <h3 className="mb-2" style={{ color: '#E6F1EF', fontSize: '18px', fontWeight: 500 }}>
                      {project.title}
                    </h3>
                    <div className="mb-3" 
                      style={{ 
                        color: project.statusColor, 
                        fontFamily: 'JetBrains Mono, monospace', 
                        fontSize: '12px' 
                      }}>
                      {project.status}
                    </div>
                    <div className="flex items-center gap-2" 
                      style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
                      {project.isCollaborative && (
                        <div className="rounded-full" 
                          style={{ width: '6px', height: '6px', backgroundColor: '#00FFA3' }}></div>
                      )}
                      <span>{project.lastEdited}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4, ease: 'linear' }}
              className="text-center py-20"
            >
              <h3 className="mb-4" style={{ color: '#E6F1EF', fontSize: '28px', fontWeight: 600 }}>
                No Active Architectures
              </h3>
              <p className="mb-8" style={{ color: '#8FA9A3', fontSize: '16px', maxWidth: '500px', margin: '0 auto 32px' }}>
                Initialize your first distributed system and run a deterministic simulation.
              </p>
              <button className="transition-all uppercase tracking-wider"
                style={{
                  backgroundColor: '#00FFA3',
                  color: '#020908',
                  padding: '16px 40px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 600
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#00D98C'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00FFA3'}
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