import { Zap, Github, Menu, X, Terminal, Cpu, Database, Network } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import Aurora from '../../components/Aurora';
import TextType from '../components/TextType';
import TerminalOutput from '../components/TerminalOutput';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen text-[#E6F1EF]" style={{backgroundColor: '#020908', fontFamily: 'Inter, sans-serif'}}>
      {/* Strict Vertical Grid Overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{backgroundImage: 'repeating-linear-gradient(to right, rgba(0,255,170,0.06) 0px, rgba(0,255,170,0.06) 1px, transparent 1px, transparent 80px)', backgroundSize: '80px 100%'}} />
      
      {/* Fixed Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b" style={{backgroundColor: 'rgba(2,9,8,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderColor: 'rgba(0,255,170,0.1)'}}>
        <div className="mx-auto px-8 xl:px-12 2xl:px-16" style={{ maxWidth: '1920px' }}>
          <div className="flex items-center justify-between" style={{ height: 'clamp(64px, 5vh, 88px)' }}>
            <div className="tracking-tight cursor-pointer" style={{ color: '#00FFA3', fontSize: 'clamp(20px, 1.6vw, 32px)' }}
              onClick={() => navigate('/')}>
              InfraZero
            </div>

            <div className="hidden md:flex items-center" style={{ gap: 'clamp(32px, 2.8vw, 56px)' }}>
              {['Platform', 'Documentation', 'Examples', 'Blog'].map((item) => (
                <a key={item} href="#" className="uppercase tracking-wider transition-colors" 
                  style={{ color: '#8FA9A3', fontSize: 'clamp(12px, 0.9vw, 16px)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#E6F1EF'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#8FA9A3'}>
                  {item}
                </a>
              ))}
              <a href="#" className="uppercase tracking-wider transition-colors flex items-center gap-1.5" 
                style={{ color: '#8FA9A3', fontSize: 'clamp(12px, 0.9vw, 16px)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#E6F1EF'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#8FA9A3'}>
                <Github style={{ width: 'clamp(14px, 1.1vw, 20px)', height: 'clamp(14px, 1.1vw, 20px)' }} />
                GitHub
              </a>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <button onClick={() => navigate('/auth')} className="uppercase tracking-wider border transition-all"
                style={{ borderColor: 'rgba(0,255,170,0.3)', color: '#8FA9A3', backgroundColor: 'transparent', 
                  borderRadius: '2px', padding: 'clamp(8px, 0.8vw, 14px) clamp(20px, 1.8vw, 32px)', 
                  fontSize: 'clamp(12px, 0.9vw, 16px)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,255,170,0.5)'; e.currentTarget.style.color = '#E6F1EF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)'; e.currentTarget.style.color = '#8FA9A3'; }}>
                Try Demo
              </button>
              <button onClick={() => navigate('/auth')} className="uppercase tracking-wider transition-all"
                style={{ backgroundColor: '#00FFA3', color: '#030D0C', borderRadius: '2px',
                  padding: 'clamp(8px, 0.8vw, 14px) clamp(20px, 1.8vw, 32px)', fontSize: 'clamp(12px, 0.9vw, 16px)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#00D98C'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00FFA3'}>
                Get Started
              </button>
            </div>

            <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ color: '#00FFA3' }}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.2, ease: 'linear' }} className="md:hidden py-6 border-t" 
              style={{ borderColor: 'rgba(0,255,170,0.1)' }}>
              <div className="flex flex-col gap-4">
                {['Platform', 'Documentation', 'Examples', 'Blog'].map((item) => (
                  <a key={item} href="#" className="text-sm uppercase tracking-wider py-2" style={{ color: '#8FA9A3' }}>{item}</a>
                ))}
                <a href="#" className="text-sm uppercase tracking-wider py-2 flex items-center gap-2" style={{ color: '#8FA9A3' }}>
                  <Github className="w-4 h-4" />GitHub
                </a>
                <div className="flex flex-col gap-3 mt-4 pt-4 border-t" style={{ borderColor: 'rgba(0,255,170,0.1)' }}>
                  <button onClick={() => navigate('/auth')} className="px-5 py-3 text-sm uppercase tracking-wider border w-full" 
                    style={{ borderColor: 'rgba(0,255,170,0.3)', color: '#8FA9A3', borderRadius: '2px' }}>Try Demo</button>
                  <button onClick={() => navigate('/auth')} className="px-5 py-3 text-sm uppercase tracking-wider w-full" 
                    style={{ backgroundColor: '#00FFA3', color: '#030D0C', borderRadius: '2px' }}>Get Started</button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </nav>
      
      {/* SECTION 1 — HERO */}
      <section className="min-h-screen flex flex-col items-center justify-center px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ paddingTop: 'clamp(120px, 12vh, 180px)', paddingBottom: 'clamp(80px, 10vh, 140px)' }}>
        
        {/* Aurora Background Effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: -1 }}>
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <Aurora
              colorStops={["#5227FF","#7cff67","#5227FF"]}
              amplitude={0.9}
              blend={0.35}
            />
          </div>
        </div>
        
        {/* Micro Announcement Banner */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3, ease: 'linear' }} className="cursor-pointer transition-all mb-12"
          style={{ backgroundColor: '#040F0E', border: '1px solid rgba(0,255,170,0.15)', borderRadius: '4px',
            padding: 'clamp(10px, 0.9vw, 16px) clamp(20px, 1.8vw, 32px)' }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(0,255,170,0.25)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(0,255,170,0.15)'}>
          <div className="flex items-center justify-center gap-3 uppercase" 
            style={{ color: '#00FFA3', letterSpacing: '0.05em', fontSize: 'clamp(11px, 0.85vw, 15px)' }}>
            <Zap style={{ width: 'clamp(14px, 1.1vw, 20px)', height: 'clamp(14px, 1.1vw, 20px)' }} />
            <span>Beta Release — Fully Local-First Distributed Systems Lab</span>
          </div>
        </motion.div>

        {/* Massive Headline */}
        <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
          transition={{ delay: 0.1, duration: 0.4, ease: 'linear' }} className="font-bold text-center"
          style={{ color: '#E6F1EF', fontSize: 'clamp(56px, 6.5vw, 128px)', lineHeight: 1.05,
            marginBottom: 'clamp(32px, 3.5vw, 64px)', maxWidth: '1600px' }}>
          <TextType
            texts={["The Distributed Systems Lab You Control", "Build Distributed Systems with Confidence", "Deploy. Monitor. Scale."]}
            typingSpeed={120}
            pauseDuration={1500}
            deletingSpeed={70}
            showCursor
            cursorCharacter="_"
            variableSpeedEnabled={false}
            cursorBlinkDuration={0.5}
          />
        </motion.h1>

        {/* Subheadline */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
          transition={{ delay: 0.2, duration: 0.4, ease: 'linear' }} className="text-center"
          style={{ color: '#8FA9A3', fontSize: 'clamp(18px, 1.6vw, 30px)', lineHeight: 1.6,
            marginBottom: 'clamp(48px, 4.5vw, 72px)', maxWidth: '840px' }}>
          Design with AI. Collaborate peer-to-peer. Run deterministic physics simulations directly in your browser — no backend required.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
          transition={{ delay: 0.3, duration: 0.4, ease: 'linear' }} className="flex flex-wrap items-center justify-center gap-4 mb-20">
          <button onClick={() => navigate('/auth')} className="transition-all"
            style={{ backgroundColor: '#00FFA3', color: '#020908', borderRadius: '4px',
              padding: 'clamp(16px, 1.4vw, 24px) clamp(32px, 2.8vw, 52px)', fontSize: 'clamp(15px, 1.2vw, 20px)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#00D98C'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00FFA3'}>
            Try the Demo
          </button>
          <button className="border transition-all flex items-center gap-3"
            style={{ borderColor: 'rgba(0,255,170,0.4)', color: '#00FFA3', backgroundColor: 'transparent',
              borderRadius: '4px', padding: 'clamp(16px, 1.4vw, 24px) clamp(32px, 2.8vw, 52px)', 
              fontSize: 'clamp(15px, 1.2vw, 20px)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#00FFA3'; e.currentTarget.style.color = '#020908'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#00FFA3'; }}>
            <Github style={{ width: 'clamp(18px, 1.5vw, 26px)', height: 'clamp(18px, 1.5vw, 26px)' }} />
            View on GitHub
          </button>
        </motion.div>

        {/* PRODUCT FRAME — COMMAND CENTER */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.5, duration: 0.5, ease: 'linear' }} className="w-full border"
          style={{ backgroundColor: '#040F0E', borderColor: 'rgba(0,255,170,0.2)', maxWidth: '1840px' }}>
          <div className="grid md:grid-cols-2">
            {/* Left Pane — The Canvas */}
            <div className="border-r" style={{ borderColor: 'rgba(0,255,170,0.1)', padding: 'clamp(24px, 2.2vw, 44px)' }}>
              <div className="uppercase mb-4 tracking-widest" 
                style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
                AI CANVAS
              </div>
              
              {/* AI Input Box */}
              <div className="mb-6 border" style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.2)',
                fontFamily: 'JetBrains Mono, monospace', color: '#8FA9A3', padding: 'clamp(12px, 1.1vw, 20px)',
                fontSize: 'clamp(11px, 0.85vw, 15px)' }}>
                <div style={{ color: '#00FFA3' }}>→ README.md uploaded</div>
                <div className="mt-1" style={{ color: '#00FFA3' }}>→ Analyzing architecture requirements...</div>
                <div className="mt-2">Prompt: "Build a Netflix-like microservices backend"</div>
                <div className="mt-1" style={{ color: '#4A7A70' }}>↳ Generated: CloudFront · Frontend · Auth · API Gateway · Streaming · Postgres · <span style={{ color: '#00FFA3' }}>Redis ▋</span></div>
              </div>

              {/* Node Graph Visualization — Netflix-like Microservices */}
              <div className="relative border" style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.1)',
                backgroundImage: 'radial-gradient(circle, rgba(0,255,170,0.03) 1px, transparent 1px)',
                backgroundSize: 'clamp(18px, 1.65vw, 28px) clamp(18px, 1.65vw, 28px)', height: 'clamp(400px, 38vw, 620px)' }}>
                <svg className="w-full h-full" viewBox="0 0 560 380" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <filter id="nodeGlow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="aiGlow" x="-80%" y="-80%" width="260%" height="260%">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    {/* Hidden paths for animateMotion */}
                    <path id="mp-cdn-api"      d="M 75 87 C 120 140 200 165 233 180" />
                    <path id="mp-client-api"   d="M 280 87 L 280 158" />
                    <path id="mp-auth-api"     d="M 485 87 C 440 140 360 165 327 180" />
                    <path id="mp-api-stream"   d="M 258 215 C 220 255 160 275 135 280" />
                    <path id="mp-api-postgres" d="M 275 215 C 260 255 220 280 195 282" />
                    <path id="mp-api-redis"    d="M 280 215 L 280 280" />
                    <path id="mp-api-kafka"    d="M 302 215 C 340 255 400 275 425 280" />
                  </defs>

                  {/* ── EDGES ─────────────────────────────────────────── */}
                  <motion.path d="M 75 87 C 120 140 200 165 233 180"
                    fill="none" stroke="rgba(0,255,170,0.22)" strokeWidth="1.5"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.55, ease: 'linear' }} />
                  <motion.path d="M 280 87 L 280 158"
                    fill="none" stroke="rgba(0,255,170,0.22)" strokeWidth="1.5"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.35, ease: 'linear' }} />
                  <motion.path d="M 485 87 C 440 140 360 165 327 180"
                    fill="none" stroke="rgba(0,255,170,0.22)" strokeWidth="1.5"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 0.7, duration: 0.55, ease: 'linear' }} />
                  <motion.path d="M 258 215 C 220 255 160 275 135 280"
                    fill="none" stroke="rgba(0,255,170,0.22)" strokeWidth="1.5"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 1.15, duration: 0.45, ease: 'linear' }} />
                  <motion.path d="M 275 215 C 260 255 220 280 195 282"
                    fill="none" stroke="rgba(0,255,170,0.22)" strokeWidth="1.5"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 1.1, duration: 0.45, ease: 'linear' }} />
                  {/* API → Redis — brighter, AI is building this edge */}
                  <motion.path d="M 280 215 L 280 280"
                    fill="none" stroke="rgba(0,255,170,0.5)" strokeWidth="1.5" strokeDasharray="4 3"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 1.35, duration: 0.4, ease: 'linear' }} />
                  <motion.path d="M 302 215 C 340 255 400 275 425 280"
                    fill="none" stroke="rgba(0,255,170,0.22)" strokeWidth="1.5"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.45, ease: 'linear' }} />

                  {/* ── DATA-PACKET PARTICLES ──────────────────────────── */}
                  <circle r="2.5" fill="#00FFA3" opacity="0.85">
                    <animateMotion dur="2.8s" repeatCount="indefinite" begin="1.2s"><mpath href="#mp-cdn-api" /></animateMotion>
                  </circle>
                  <circle r="2.5" fill="#00FFA3" opacity="0.85">
                    <animateMotion dur="1.9s" repeatCount="indefinite" begin="1.0s"><mpath href="#mp-client-api" /></animateMotion>
                  </circle>
                  <circle r="2.5" fill="#00FFA3" opacity="0.85">
                    <animateMotion dur="2.4s" repeatCount="indefinite" begin="1.5s"><mpath href="#mp-auth-api" /></animateMotion>
                  </circle>
                  <circle r="2" fill="#00FFA3" opacity="0.6">
                    <animateMotion dur="2.1s" repeatCount="indefinite" begin="2.2s"><mpath href="#mp-api-stream" /></animateMotion>
                  </circle>
                  <circle r="2" fill="#00FFA3" opacity="0.6">
                    <animateMotion dur="2.0s" repeatCount="indefinite" begin="2.0s"><mpath href="#mp-api-postgres" /></animateMotion>
                  </circle>
                  {/* Brighter packet toward Redis — AI is routing here */}
                  <circle r="3.5" fill="#00FFA3" opacity="1" style={{ filter: 'drop-shadow(0 0 4px #00FFA3)' }}>
                    <animateMotion dur="1.6s" repeatCount="indefinite" begin="1.9s"><mpath href="#mp-api-redis" /></animateMotion>
                  </circle>
                  <circle r="2" fill="#00FFA3" opacity="0.6">
                    <animateMotion dur="2.3s" repeatCount="indefinite" begin="2.5s"><mpath href="#mp-api-kafka" /></animateMotion>
                  </circle>

                  {/* ── ROW 1: CLIENT / CDN / AUTH ────────────────────── */}

                  {/* CDN Node */}
                  <motion.g initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.3, ease: 'linear' }}>
                    <rect x="35" y="35" width="80" height="52" rx="2" fill="#040F0E" stroke="rgba(0,255,170,0.35)" strokeWidth="1" />
                    <text x="75" y="57" textAnchor="middle" fill="#4A7A70" fontSize="7" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">CDN</text>
                    <text x="75" y="75" textAnchor="middle" fill="#E6F1EF" fontSize="10.5" fontFamily="JetBrains Mono, monospace">CloudFront</text>
                  </motion.g>

                  {/* Frontend Client Node */}
                  <motion.g initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7, duration: 0.3, ease: 'linear' }}>
                    <rect x="240" y="35" width="80" height="52" rx="2" fill="#040F0E" stroke="rgba(0,255,170,0.35)" strokeWidth="1" />
                    <text x="280" y="57" textAnchor="middle" fill="#4A7A70" fontSize="7" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">CLIENT</text>
                    <text x="280" y="75" textAnchor="middle" fill="#E6F1EF" fontSize="10.5" fontFamily="JetBrains Mono, monospace">Frontend</text>
                  </motion.g>

                  {/* Auth Node */}
                  <motion.g initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.3, ease: 'linear' }}>
                    <rect x="445" y="35" width="80" height="52" rx="2" fill="#040F0E" stroke="rgba(0,255,170,0.35)" strokeWidth="1" />
                    <text x="485" y="57" textAnchor="middle" fill="#4A7A70" fontSize="7" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">SERVICE</text>
                    <text x="485" y="75" textAnchor="middle" fill="#E6F1EF" fontSize="10.5" fontFamily="JetBrains Mono, monospace">Auth</text>
                  </motion.g>

                  {/* ── ROW 2: API GATEWAY (central, glowing) ─────────── */}
                  <motion.g initial={{ opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.95, duration: 0.35, ease: 'linear' }}>
                    {/* Outer pulse ring */}
                    <motion.rect x="224" y="149" width="112" height="66" rx="4" fill="none"
                      stroke="rgba(0,255,170,0.18)" strokeWidth="1"
                      animate={{ opacity: [0.7, 0, 0.7], strokeWidth: [1, 3.5, 1] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
                    <rect x="233" y="158" width="94" height="57" rx="2" fill="#040F0E" stroke="#00FFA3" strokeWidth="2"
                      style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,170,0.55))' }} />
                    <text x="280" y="180" textAnchor="middle" fill="#4A7A70" fontSize="7" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">GATEWAY</text>
                    <text x="280" y="201" textAnchor="middle" fill="#00FFA3" fontSize="13" fontFamily="JetBrains Mono, monospace" fontWeight="bold">API</text>
                  </motion.g>

                  {/* ── ROW 3: STREAMING / POSTGRES / REDIS / KAFKA ───── */}

                  {/* Streaming Service */}
                  <motion.g initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.1, duration: 0.3, ease: 'linear' }}>
                    <rect x="45" y="280" width="90" height="52" rx="2" fill="#040F0E" stroke="rgba(0,255,170,0.35)" strokeWidth="1" />
                    <text x="90" y="301" textAnchor="middle" fill="#4A7A70" fontSize="7" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">ENGINE</text>
                    <text x="90" y="319" textAnchor="middle" fill="#E6F1EF" fontSize="10.5" fontFamily="JetBrains Mono, monospace">Streaming</text>
                  </motion.g>

                  {/* Postgres Node */}
                  <motion.g initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.15, duration: 0.3, ease: 'linear' }}>
                    <rect x="150" y="280" width="90" height="52" rx="2" fill="#040F0E" stroke="rgba(0,255,170,0.35)" strokeWidth="1" />
                    <text x="195" y="301" textAnchor="middle" fill="#4A7A70" fontSize="7" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">DATABASE</text>
                    <text x="195" y="319" textAnchor="middle" fill="#E6F1EF" fontSize="10.5" fontFamily="JetBrains Mono, monospace">Postgres</text>
                  </motion.g>

                  {/* Redis Cache — AI is inserting this node */}
                  <motion.g initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.4, duration: 0.35, ease: 'linear' }}>
                    {/* Marching-ant border */}
                    <motion.rect x="235" y="280" width="90" height="52" rx="2" fill="#040F0E"
                      stroke="#00FFA3" strokeWidth="1.5" strokeDasharray="5 3"
                      animate={{ strokeDashoffset: [0, -16] }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                    <text x="280" y="301" textAnchor="middle" fill="#00FFA3" fontSize="10.5" fontFamily="JetBrains Mono, monospace" fontWeight="bold"
                      style={{ filter: 'drop-shadow(0 0 6px rgba(0,255,170,0.7))' }}>Redis</text>
                    <motion.text x="280" y="318" textAnchor="middle" fill="#00FFA3" fontSize="7.5" fontFamily="JetBrains Mono, monospace"
                      animate={{ opacity: [1, 0.25, 1] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}>
                      ▋ AI inserting...
                    </motion.text>
                  </motion.g>

                  {/* Kafka Node */}
                  <motion.g initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.25, duration: 0.3, ease: 'linear' }}>
                    <rect x="425" y="280" width="90" height="52" rx="2" fill="#040F0E" stroke="rgba(0,255,170,0.35)" strokeWidth="1" />
                    <text x="470" y="301" textAnchor="middle" fill="#4A7A70" fontSize="7" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">QUEUE</text>
                    <text x="470" y="319" textAnchor="middle" fill="#E6F1EF" fontSize="10.5" fontFamily="JetBrains Mono, monospace">Kafka</text>
                  </motion.g>

                  {/* ── LEGEND ────────────────────────────────────────── */}
                  <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7, duration: 0.4 }}>
                    <circle cx="42" cy="355" r="3.5" fill="#00FFA3" opacity="0.9" />
                    <text x="52" y="359" fill="#4A7A70" fontSize="8" fontFamily="JetBrains Mono, monospace">data flow</text>
                    <rect x="120" y="350" width="14" height="9" rx="1" fill="none" stroke="#00FFA3" strokeWidth="1.2" strokeDasharray="3 2" />
                    <text x="140" y="359" fill="#4A7A70" fontSize="8" fontFamily="JetBrains Mono, monospace">AI generating</text>
                    <rect x="248" y="350" width="14" height="9" rx="1" fill="none" stroke="#00FFA3" strokeWidth="1.8" />
                    <text x="268" y="359" fill="#4A7A70" fontSize="8" fontFamily="JetBrains Mono, monospace">active node</text>
                  </motion.g>
                </svg>
              </div>
            </div>

            {/* Right Pane — The Terminal */}
            <div style={{ padding: 'clamp(24px, 2.2vw, 44px)' }}>
              <div className="uppercase mb-4 tracking-widest" 
                style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
                TERMINAL OUTPUT
              </div>
              <TerminalOutput />
            </div>
          </div>
        </motion.div>
      </section>

      {/* SECTION 2 — GIANT TYPOGRAPHY STATEMENT */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ paddingTop: 'clamp(120px, 12vw, 220px)', paddingBottom: 'clamp(120px, 12vw, 220px)' }}>
        <div className="mx-auto text-center" style={{ maxWidth: '1700px' }}>
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }} className="font-bold mb-16"
            style={{ color: '#E6F1EF', fontSize: 'clamp(48px, 5.2vw, 104px)', lineHeight: 1.1 }}>
            AI-generated architectures.
          </motion.h2>
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} 
            transition={{ delay: 0.1, duration: 0.4, ease: 'linear' }} className="font-bold mb-16"
            style={{ color: '#00FFA3', fontSize: 'clamp(48px, 5.2vw, 104px)', lineHeight: 1.1 }}>
            Physics-verified reliability.
          </motion.h2>
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} 
            transition={{ delay: 0.2, duration: 0.4, ease: 'linear' }} className="font-bold"
            style={{ color: '#8FA9A3', fontSize: 'clamp(48px, 5.2vw, 104px)', lineHeight: 1.1 }}>
            Deterministic by design.
          </motion.h2>
        </div>
      </section>

      {/* SECTION 3 — FEATURE 1: AI-Native Generative Canvas */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#040F0E', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <div className="mx-auto grid md:grid-cols-2 items-center gap-16" style={{ maxWidth: '1840px' }}>
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }}>
            <div className="uppercase mb-4 tracking-widest" 
              style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
              01 — AI CANVAS
            </div>
            <h3 className="font-bold mb-6" style={{ color: '#E6F1EF', fontSize: 'clamp(36px, 4vw, 72px)', lineHeight: 1.1 }}>
              Text-to-Graph Architecture
            </h3>
            <p className="mb-4" style={{ color: '#8FA9A3', fontSize: 'clamp(16px, 1.35vw, 24px)', lineHeight: 1.6 }}>
              Powered by Groq API running Llama 3 at 300+ tokens/second. Upload your system-design.pdf or paste requirements. 
              Prompt: "Build a Netflix-like microservices backend" and watch AI insert load balancers, caching layers, and message queues in real-time.
            </p>
            <p style={{ color: '#8FA9A3', opacity: 0.7, fontSize: 'clamp(14px, 1.1vw, 20px)', lineHeight: 1.6 }}>
              Every node placement validated against distributed systems best practices. No hallucinations. Pure architectural reasoning.
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }} className="relative border h-96"
            style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.2)',
              backgroundImage: 'radial-gradient(circle, rgba(0,255,170,0.03) 1px, transparent 1px)',
              backgroundSize: 'clamp(18px, 1.65vw, 28px) clamp(18px, 1.65vw, 28px)' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div animate={{ boxShadow: ['0 0 0px rgba(0,255,170,0)', '0 0 30px rgba(0,255,170,0.4)', '0 0 0px rgba(0,255,170,0)'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} className="border-2 flex items-center justify-center"
                style={{ borderColor: '#00FFA3', backgroundColor: '#040F0E', width: 'clamp(140px, 13vw, 220px)', height: 'clamp(140px, 13vw, 220px)' }}>
                <div className="text-center">
                  <div style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(11px, 1vw, 16px)' }}>
                    Redis
                  </div>
                  <div style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(9px, 0.75vw, 13px)', marginTop: '4px' }}>
                    [Inserting...]
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FEATURE 2: Hardware-Accelerated Simulation */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#020908', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <div className="mx-auto grid md:grid-cols-2 items-center gap-16" style={{ maxWidth: '1840px' }}>
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }} className="order-2 md:order-1 relative h-96"
            style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.2)',
              backgroundImage: 'radial-gradient(circle, rgba(0,255,170,0.03) 1px, transparent 1px)',
              backgroundSize: 'clamp(18px, 1.65vw, 28px) clamp(18px, 1.65vw, 28px)' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div animate={{ boxShadow: ['0 0 0px rgba(0,255,170,0)', '0 0 30px rgba(0,255,170,0.4)', '0 0 0px rgba(0,255,170,0)'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} className="border-2 flex items-center justify-center"
                style={{ borderColor: '#00FFA3', backgroundColor: '#040F0E', width: 'clamp(140px, 13vw, 220px)', height: 'clamp(140px, 13vw, 220px)' }}>
                <div className="text-center">
                  <div style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(11px, 1vw, 16px)' }}>
                    Redis
                  </div>
                  <div style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(9px, 0.75vw, 13px)', marginTop: '4px' }}>
                    [Inserting...]
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }} className="order-1 md:order-2">
            <div className="uppercase mb-4 tracking-widest" 
              style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
              02 — PHYSICS ENGINE
            </div>
            <h3 className="font-bold mb-6" style={{ color: '#E6F1EF', fontSize: 'clamp(36px, 4vw, 72px)', lineHeight: 1.1 }}>
              Deterministic WASM Physics
            </h3>
            <p className="mb-4" style={{ color: '#8FA9A3', fontSize: 'clamp(16px, 1.35vw, 24px)', lineHeight: 1.6 }}>
              Your graph compiles to a Rust struct, executes Monte Carlo simulations at 60fps in WebAssembly. 
              Run 100,000 requests through your system. Test partition tolerance. Inject cascading failures.
            </p>
            <p style={{ color: '#8FA9A3', opacity: 0.7, fontSize: 'clamp(14px, 1.1vw, 20px)', lineHeight: 1.6 }}>
              $0 backend execution cost. Everything runs locally. Same seed = same results every time.
            </p>
          </motion.div>
        </div>
      </section>

      {/* FEATURE 3: Conflict-Free Multiplayer */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#040F0E', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <div className="mx-auto grid md:grid-cols-2 items-center gap-16" style={{ maxWidth: '1840px' }}>
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }}>
            <div className="uppercase mb-4 tracking-widest" 
              style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
              03 — COLLABORATION
            </div>
            <h3 className="font-bold mb-6" style={{ color: '#E6F1EF', fontSize: 'clamp(36px, 4vw, 72px)', lineHeight: 1.1 }}>
              Peer-to-Peer Synchronization
            </h3>
            <p className="mb-4" style={{ color: '#8FA9A3', fontSize: 'clamp(16px, 1.35vw, 24px)', lineHeight: 1.6 }}>
              Built on Yjs CRDTs with WebRTC transport. No server relay. No account signup. 
              Share a URL and watch edits merge in real-time with zero conflicts.
            </p>
            <p style={{ color: '#8FA9A3', opacity: 0.7, fontSize: 'clamp(14px, 1.1vw, 20px)', lineHeight: 1.6 }}>
              User A moves a node. User B renames it. System converges instantly. Even works offline.
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }} className="relative border h-96"
            style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.2)' }}>
            <div className="absolute inset-0 p-12">
              <div className="relative h-full">
                <motion.div className="absolute" style={{ backgroundColor: '#00FFA3', width: '14px', height: '14px' }}
                  animate={{ top: ['20%', '40%', '60%'], left: ['30%', '50%', '40%'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}>
                  <div style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap',
                    fontSize: 'clamp(11px, 0.9vw, 14px)', marginLeft: '20px' }}>User A</div>
                </motion.div>
                
                <motion.div className="absolute" style={{ backgroundColor: '#00D9A3', width: '14px', height: '14px' }}
                  animate={{ top: ['60%', '30%', '50%'], left: ['60%', '40%', '70%'] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}>
                  <div style={{ color: '#00D9A3', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap',
                    fontSize: 'clamp(11px, 0.9vw, 14px)', marginLeft: '20px' }}>User B</div>
                </motion.div>

                {/* Status indicators */}
                <div className="absolute bottom-0 right-0 space-y-2">
                  <div className="flex items-center gap-2" style={{ fontSize: 'clamp(10px, 0.85vw, 13px)', fontFamily: 'JetBrains Mono, monospace' }}>
                    <div className="rounded-full" style={{ backgroundColor: '#00FFA3', width: '6px', height: '6px' }}></div>
                    <span style={{ color: '#8FA9A3' }}>User A: Moving node</span>
                  </div>
                  <div className="flex items-center gap-2" style={{ fontSize: 'clamp(10px, 0.85vw, 13px)', fontFamily: 'JetBrains Mono, monospace' }}>
                    <div className="rounded-full" style={{ backgroundColor: '#00D9A3', width: '6px', height: '6px' }}></div>
                    <span style={{ color: '#8FA9A3' }}>User B: Renaming edge</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FEATURE 4: Ops Terminal & Post-Mortem */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#020908', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <div className="mx-auto grid md:grid-cols-2 items-center gap-16" style={{ maxWidth: '1840px' }}>
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }} className="order-2 md:order-1 space-y-6">
            {/* Terminal */}
            <TerminalOutput style={{
              border: '1px solid rgba(0,255,170,0.2)',
              height: 'clamp(240px, 22vw, 380px)',
              padding: 'clamp(16px, 1.4vw, 26px)',
              fontSize: 'clamp(11px, 0.85vw, 15px)',
            }} />

            {/* Grade Panel */}
            <div className="border p-6" style={{ backgroundColor: '#040F0E', borderColor: 'rgba(0,255,170,0.3)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="uppercase tracking-widest" 
                  style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
                  Architecture Grade
                </div>
                <div style={{ color: '#FFB03B', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(40px, 4vw, 64px)' }}>
                  B-
                </div>
              </div>
              <div style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(11px, 0.9vw, 14px)' }}>
                <div className="mb-2" style={{ color: '#FF3B3B' }}>• Missing: Redis cache layer</div>
                <div className="mb-2" style={{ color: '#FFB03B' }}>• Warning: No circuit breaker</div>
                <div style={{ color: '#00FFA3' }}>✓ Database replication configured</div>
              </div>
            </div>
          </motion.div>
          
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }} className="order-1 md:order-2">
            <div className="uppercase mb-4 tracking-widest" 
              style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
              04 — TELEMETRY & REPORTING
            </div>
            <h3 className="font-bold mb-6" style={{ color: '#E6F1EF', fontSize: 'clamp(36px, 4vw, 72px)', lineHeight: 1.1 }}>
              Real-Time Telemetry & Automated Reporting
            </h3>
            <p className="mb-4" style={{ color: '#8FA9A3', fontSize: 'clamp(16px, 1.35vw, 24px)', lineHeight: 1.6 }}>
              Terminal output mimics production observability tools like Render and Vercel. Watch cascading failures unfold in real-time. 
              Export post-mortem PDFs with root cause analysis—generated entirely client-side.
            </p>
            <p style={{ color: '#8FA9A3', opacity: 0.7, fontSize: 'clamp(14px, 1.1vw, 20px)', lineHeight: 1.6 }}>
              System grades your architecture. Highlights missing resilience patterns. Suggests improvements.
            </p>
          </motion.div>
        </div>
      </section>

      {/* SECTION 4 — METRICS STRIP */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#040F0E', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} 
          transition={{ duration: 0.5, ease: 'linear' }} className="mx-auto" style={{ maxWidth: '1840px' }}>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {[
              { number: '< 50ms', label: 'CRDT Sync\nLatency' },
              { number: '$0', label: 'Backend\nExecution Cost' },
              { number: '100%', label: 'Client-Side\nWASM Execution' },
              { number: 'SHA-256', label: 'Stable Hash\nVerification' }
            ].map((metric, i) => (
              <div key={i} className="text-center border-r py-16 px-8" style={{ borderColor: 'rgba(0,255,170,0.1)' }}>
                <div className="mb-4" style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 'clamp(36px, 4vw, 68px)' }}>
                  {metric.number}
                </div>
                <div className="uppercase tracking-widest whitespace-pre-line" 
                  style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', 
                    fontSize: 'clamp(10px, 0.8vw, 14px)', lineHeight: 1.5 }}>
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* SECTION 5 — LIBRARY OF DOOM */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#020908', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <div className="mx-auto" style={{ maxWidth: '1700px' }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.5, ease: 'linear' }} className="border p-12"
            style={{ backgroundColor: '#040F0E', borderColor: '#00FFA3', borderWidth: '1px' }}>
            
            <div className="inline-block uppercase tracking-widest mb-8" 
              style={{ backgroundColor: '#00FFA3', color: '#020908', fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 600, padding: 'clamp(8px, 0.8vw, 12px) clamp(16px, 1.5vw, 24px)', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
              Educational Presets
            </div>
            
            <h3 className="font-bold mb-6" style={{ color: '#E6F1EF', fontSize: 'clamp(40px, 4.5vw, 80px)', lineHeight: 1.1 }}>
              The Library of Doom
            </h3>
            
            <p className="mb-12" style={{ color: '#8FA9A3', fontSize: 'clamp(16px, 1.35vw, 24px)', lineHeight: 1.6 }}>
              Pre-configured catastrophic failure scenarios from production systems. Each is fully interactive, reproducible, 
              and designed to teach you what not to do.
            </p>

            {/* Preset Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  number: '01',
                  title: 'The Thundering Herd',
                  description: '10,000 users hit the database simultaneously after cache expiration. Watch the system collapse. Learn cache warming strategies.'
                },
                {
                  number: '02',
                  title: 'The Retry Storm',
                  description: 'Aggressive retry logic overwhelms a recovering service. System never stabilizes. Understand exponential backoff and jitter.'
                },
                {
                  number: '03',
                  title: 'The Byzantine General',
                  description: 'Malicious node sends conflicting messages. Consensus protocol must detect and isolate. Classic distributed systems problem.'
                },
                {
                  number: '04',
                  title: 'The Split Brain',
                  description: 'Network partition creates two leaders. Both accept writes. Data diverges. Master the CAP theorem in practice.'
                }
              ].map((preset) => (
                <div key={preset.number} className="border p-6" 
                  style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.2)' }}>
                  <div className="uppercase tracking-widest mb-3" 
                    style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
                    Scenario {preset.number}
                  </div>
                  <h4 className="font-bold mb-3" style={{ color: '#E6F1EF', fontSize: 'clamp(20px, 1.8vw, 32px)' }}>
                    {preset.title}
                  </h4>
                  <p style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', 
                    fontSize: 'clamp(12px, 0.95vw, 16px)', lineHeight: 1.6 }}>
                    {preset.description}
                  </p>
                </div>
              ))}
            </div>

            <button className="border transition-all uppercase tracking-wider mt-8"
              style={{ borderColor: 'rgba(0,255,170,0.4)', color: '#00FFA3', backgroundColor: 'transparent',
                fontFamily: 'JetBrains Mono, monospace', padding: 'clamp(14px, 1.3vw, 20px) clamp(32px, 2.8vw, 48px)', fontSize: 'clamp(12px, 1vw, 15px)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#00FFA3'; e.currentTarget.style.color = '#020908'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#00FFA3'; }}>
              Browse All Scenarios →
            </button>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.1)', paddingTop: 'clamp(60px, 7vw, 100px)', paddingBottom: 'clamp(60px, 7vw, 100px)' }}>
        <div className="mx-auto" style={{ maxWidth: '1840px' }}>
          <div className="grid md:grid-cols-4 gap-12">
            <div>
              <div className="mb-4" style={{ color: '#00FFA3', fontSize: 'clamp(24px, 2vw, 32px)' }}>InfraZero</div>
              <p style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(12px, 1vw, 15px)' }}>
                Control plane for distributed systems.
              </p>
            </div>
            
            {['Platform', 'Resources', 'Connect'].map((section) => (
              <div key={section}>
                <div className="uppercase mb-4 tracking-widest" 
                  style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
                  {section}
                </div>
                <div className="space-y-2">
                  {['Features', 'Documentation', 'Examples'].map((link) => (
                    <div key={link}>
                      <a href="#" className="transition-colors" style={{ color: '#8FA9A3', fontSize: 'clamp(13px, 1vw, 16px)' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#00FFA3'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#8FA9A3'}>
                        {link}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-16 pt-8 border-t" style={{ borderColor: 'rgba(0,255,170,0.1)', 
            color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(11px, 0.9vw, 14px)' }}>
            © 2026 InfraZero. Infrastructure-grade distributed systems platform.
          </div>
        </div>
      </footer>
    </div>
  );
}
