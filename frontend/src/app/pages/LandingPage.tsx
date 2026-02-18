import { Zap, Github, Menu, X, Terminal, Cpu, Database, Network } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import Aurora from '../../components/Aurora';
import TextType from '../components/TextType';

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
                <div className="mt-2">Prompt: "Build a Netflix-like microservices backend"</div>
              </div>

              {/* Node Graph Visualization */}
              <div className="relative border" style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.1)',
                backgroundImage: 'radial-gradient(circle, rgba(0,255,170,0.03) 1px, transparent 1px)',
                backgroundSize: 'clamp(18px, 1.65vw, 28px) clamp(18px, 1.65vw, 28px)', height: 'clamp(400px, 38vw, 620px)' }}>
                <svg className="w-full h-full" viewBox="0 0 500 400" preserveAspectRatio="xMidYMid meet">
                  {/* Edges */}
                  <line x1="100" y1="80" x2="200" y2="150" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
                  <line x1="300" y1="80" x2="200" y2="150" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
                  <line x1="200" y1="150" x2="150" y2="280" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
                  <line x1="200" y1="150" x2="350" y2="280" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
                  
                  {/* Frontend Node */}
                  <motion.g initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} 
                    transition={{ delay: 0.7, duration: 0.3, ease: 'linear' }}>
                    <rect x="60" y="50" width="80" height="60" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                    <text x="100" y="85" textAnchor="middle" fill="#E6F1EF" fontSize="11" fontFamily="JetBrains Mono, monospace">
                      Frontend
                    </text>
                  </motion.g>

                  {/* Auth Node */}
                  <motion.g initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} 
                    transition={{ delay: 0.8, duration: 0.3, ease: 'linear' }}>
                    <rect x="260" y="50" width="80" height="60" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                    <text x="300" y="85" textAnchor="middle" fill="#E6F1EF" fontSize="11" fontFamily="JetBrains Mono, monospace">
                      Auth
                    </text>
                  </motion.g>

                  {/* API Node - Active/Selected */}
                  <motion.g initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} 
                    transition={{ delay: 0.9, duration: 0.3, ease: 'linear' }}>
                    <rect x="160" y="120" width="80" height="60" fill="#040F0E" stroke="#00FFA3" strokeWidth="2" 
                      style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,170,0.4))' }} />
                    <text x="200" y="155" textAnchor="middle" fill="#00FFA3" fontSize="11" fontFamily="JetBrains Mono, monospace">
                      API
                    </text>
                  </motion.g>

                  {/* Database Node */}
                  <motion.g initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} 
                    transition={{ delay: 1.0, duration: 0.3, ease: 'linear' }}>
                    <rect x="110" y="250" width="80" height="60" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                    <text x="150" y="285" textAnchor="middle" fill="#E6F1EF" fontSize="11" fontFamily="JetBrains Mono, monospace">
                      Database
                    </text>
                  </motion.g>

                  {/* Redis Node (AI inserting) */}
                  <motion.g initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} 
                    transition={{ delay: 1.1, duration: 0.3, ease: 'linear' }}>
                    <rect x="310" y="250" width="80" height="60" fill="#040F0E" stroke="#00FFA3" strokeWidth="2" strokeDasharray="4,4" />
                    <text x="350" y="285" textAnchor="middle" fill="#00FFA3" fontSize="11" fontFamily="JetBrains Mono, monospace">
                      Redis
                    </text>
                    <text x="350" y="300" textAnchor="middle" fill="#00FFA3" fontSize="8" fontFamily="JetBrains Mono, monospace" opacity="0.7">
                      [AI inserting...]
                    </text>
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
              
              <div className="overflow-hidden border" style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.1)',
                color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', height: 'clamp(400px, 38vw, 620px)',
                padding: 'clamp(16px, 1.4vw, 26px)', fontSize: 'clamp(11px, 0.85vw, 15px)' }}>
                <div className="space-y-1.5">
                  <div style={{ color: '#00FFA3' }}>$ infra-zero simulate --topology distributed</div>
                  <div className="mt-3">[00:00:01] Parsing architecture graph...</div>
                  <div>[00:00:02] Nodes: 5 | Edges: 8</div>
                  <div>[00:00:03] Compiling to Rust WASM module...</div>
                  <div style={{ color: '#00FFA3' }}>[00:00:04] ✓ Compilation complete (142ms)</div>
                  <div className="mt-3">[00:00:05] Initializing Monte Carlo simulation...</div>
                  <div>[00:00:06] Simulating 10,000 requests...</div>
                  <div className="mt-3" style={{ color: '#FFB03B' }}>[00:00:08] [WARN] Service 'Video-Transcoder' queue depth &gt; 80%</div>
                  <div>[00:00:09] Applying backpressure strategy...</div>
                  <div style={{ color: '#00FFA3' }}>[00:00:10] ✓ System stabilized</div>
                  <div className="mt-3">[00:00:12] Running consensus protocol tests...</div>
                  <div>[00:00:13] Testing leader election...</div>
                  <div style={{ color: '#00FFA3' }}>[00:00:14] ✓ Leader elected: node-api-2</div>
                  <div>[00:00:15] Testing network partition tolerance...</div>
                  <div style={{ color: '#00FFA3' }}>[00:00:17] ✓ CAP theorem verified (CP mode)</div>
                  <div className="mt-3">[00:00:18] Generating deterministic hash...</div>
                  <div style={{ color: '#00FFA3' }}>[00:00:19] SHA-256: 4f3d8a9b2c1e7f6a...</div>
                  <div className="mt-3">[00:00:20] Simulation complete.</div>
                  <div className="mt-2 animate-pulse">_</div>
                </div>
              </div>
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
            transition={{ duration: 0.4, ease: 'linear' }} className="order-2 md:order-1 relative h-96">
            <svg className="w-full h-full" viewBox="0 0 500 400" preserveAspectRatio="xMidYMid meet">
              {/* Central node */}
              <circle cx="250" cy="200" r="20" fill="#00FFA3" opacity="0.8" />
              
              {/* Burst pattern with success/failure dots */}
              {[...Array(12)].map((_, i) => {
                const angle = (i / 12) * Math.PI * 2;
                const x1 = 250;
                const y1 = 200;
                const x2 = 250 + Math.cos(angle) * 180;
                const y2 = 200 + Math.sin(angle) * 180;
                const isFailed = i === 3 || i === 7;
                return (
                  <g key={i}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} 
                      stroke={isFailed ? 'rgba(255,59,59,0.2)' : 'rgba(0,255,170,0.2)'} strokeWidth="1" />
                    <motion.circle cx={x1} cy={y1} r="4" fill={isFailed ? '#FF3B3B' : '#00FFA3'}
                      animate={{ cx: [x1, x2], cy: [y1, y2], opacity: [1, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.15, ease: 'linear' }} />
                  </g>
                );
              })}
            </svg>
            
            {/* Metrics overlay */}
            <div className="absolute bottom-8 left-8 right-8 grid grid-cols-2 gap-4">
              <div className="border p-4" style={{ backgroundColor: '#040F0E', borderColor: 'rgba(0,255,170,0.3)' }}>
                <div className="mb-1" style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
                  SUCCESS
                </div>
                <div style={{ color: '#00FFA3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(24px, 2.2vw, 40px)' }}>
                  98.2%
                </div>
              </div>
              <div className="border p-4" style={{ backgroundColor: '#040F0E', borderColor: 'rgba(255,59,59,0.3)' }}>
                <div className="mb-1" style={{ color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
                  FAILED
                </div>
                <div style={{ color: '#FF3B3B', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(24px, 2.2vw, 40px)' }}>
                  1.8%
                </div>
              </div>
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
            <div className="overflow-hidden border" style={{ backgroundColor: '#020908', borderColor: 'rgba(0,255,170,0.2)',
              color: '#8FA9A3', fontFamily: 'JetBrains Mono, monospace', height: 'clamp(240px, 22vw, 380px)',
              padding: 'clamp(16px, 1.4vw, 26px)', fontSize: 'clamp(11px, 0.85vw, 15px)' }}>
              <div className="space-y-1.5">
                <div>[00:15:23] Load test initiated: 50k concurrent users</div>
                <div>[00:15:24] Traffic spike detected</div>
                <div>[00:15:25] Cache miss ratio: 78%</div>
                <div className="mt-2" style={{ color: '#FF3B3B', fontWeight: 600 }}>[00:15:26] [FATAL] Cascading Failure detected</div>
                <div style={{ color: '#FF3B3B' }}>[00:15:26] Database connection pool exhausted</div>
                <div style={{ color: '#FF3B3B' }}>[00:15:27] Auth service unresponsive</div>
                <div className="mt-2">[00:15:28] Circuit breaker triggered</div>
                <div style={{ color: '#00FFA3' }}>[00:15:30] ✓ System recovered</div>
                <div className="mt-2">[00:15:31] Generating post-mortem report...</div>
              </div>
            </div>

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
