import { Zap, Github, Menu, X, Terminal, Cpu, Database, Network } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import Particles from '../components/Particles';
import TerminalOutput from '../components/TerminalOutput';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="relative min-h-screen text-[#FFFFFF] overflow-x-hidden w-full" style={{backgroundColor: '#000000', fontFamily: 'Inter, sans-serif'}}>
      {/* Strict Vertical Grid Overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{backgroundImage: 'repeating-linear-gradient(to right, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px)', backgroundSize: '80px 100%'}} />
      
      {/* Dynamic Navbar */}
      <div className={`fixed left-0 right-0 z-50 flex justify-center px-4 pointer-events-none transition-all duration-300 ${isScrolled ? 'top-6' : 'top-0 py-6'}`}>
        <nav className={`pointer-events-auto flex items-center justify-between transition-all duration-300 ${isScrolled ? 'rounded-full border shadow-lg px-6 xl:px-8' : 'w-full max-w-[1400px] px-4'}`} 
          style={{ 
            backgroundColor: isScrolled ? 'rgba(30,30,35,0.7)' : 'transparent', 
            backdropFilter: isScrolled ? 'blur(20px)' : 'none', 
            WebkitBackdropFilter: isScrolled ? 'blur(20px)' : 'none', 
            borderColor: isScrolled ? 'rgba(255,255,255,0.08)' : 'transparent', 
            height: 'clamp(56px, 6vh, 64px)', 
            width: isScrolled ? 'max-content' : '100%', 
            maxWidth: isScrolled ? '100%' : '1400px', 
            gap: 'clamp(20px, 3vw, 40px)' 
          }}>
            <div className={`tracking-tight cursor-pointer ${!isScrolled ? 'flex-1' : ''}`} style={{ color: '#3B82F6', fontSize: 'clamp(20px, 1.6vw, 32px)' }}
              onClick={() => navigate('/')}>
              InfraZero
            </div>

            <div className="hidden md:flex items-center justify-center" style={{ gap: 'clamp(32px, 2.8vw, 56px)' }}>
              {['Platform', 'Documentation', 'Examples', 'Blog'].map((item) => (
                <a key={item} href="#" className="uppercase tracking-wider transition-colors" 
                  style={{ color: '#A1A1AA', fontSize: 'clamp(12px, 0.9vw, 16px)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#A1A1AA'}>
                  {item}
                </a>
              ))}
              <a href="#" className="uppercase tracking-wider transition-colors flex items-center gap-1.5" 
                style={{ color: '#A1A1AA', fontSize: 'clamp(12px, 0.9vw, 16px)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#A1A1AA'}>
                <Github style={{ width: 'clamp(14px, 1.1vw, 20px)', height: 'clamp(14px, 1.1vw, 20px)' }} />
                GitHub
              </a>
            </div>

            <div className={`hidden md:flex items-center gap-3 justify-end ${!isScrolled ? 'flex-1' : ''}`}>
              <button onClick={() => navigate('/auth')} className="uppercase tracking-wider border transition-all"
                style={{ borderColor: 'rgba(59,130,246,0.3)', color: '#A1A1AA', backgroundColor: 'transparent', 
                  borderRadius: '2px', padding: 'clamp(8px, 0.8vw, 14px) clamp(20px, 1.8vw, 32px)', 
                  fontSize: 'clamp(12px, 0.9vw, 16px)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'; e.currentTarget.style.color = '#A1A1AA'; }}>
                Try Demo
              </button>
              <button onClick={() => navigate('/auth')} className="uppercase tracking-wider transition-all iz-btn-blue"
                style={{ color: '#030D0C', borderRadius: '2px',
                  padding: 'clamp(8px, 0.8vw, 14px) clamp(20px, 1.8vw, 32px)', fontSize: 'clamp(12px, 0.9vw, 16px)' }}>
                <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                Get Started
              </button>
            </div>

            <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ color: '#3B82F6' }}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.2, ease: 'linear' }} className="md:hidden py-6 border-t" 
              style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
              <div className="flex flex-col gap-4">
                {['Platform', 'Documentation', 'Examples', 'Blog'].map((item) => (
                  <a key={item} href="#" className="text-sm uppercase tracking-wider py-2" style={{ color: '#A1A1AA' }}>{item}</a>
                ))}
                <a href="#" className="text-sm uppercase tracking-wider py-2 flex items-center gap-2" style={{ color: '#A1A1AA' }}>
                  <Github className="w-4 h-4" />GitHub
                </a>
                <div className="flex flex-col gap-3 mt-4 pt-4 border-t" style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
                  <button onClick={() => navigate('/auth')} className="px-5 py-3 text-sm uppercase tracking-wider border w-full" 
                    style={{ borderColor: 'rgba(59,130,246,0.3)', color: '#A1A1AA', borderRadius: '2px' }}>Try Demo</button>
                  <button onClick={() => navigate('/auth')} className="px-5 py-3 text-sm uppercase tracking-wider w-full iz-btn-blue" 
                    style={{ color: '#030D0C', borderRadius: '2px' }}>
                    <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                    <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                    Get Started
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </nav>
      </div>
      
      {/* SECTION 1 — HERO */}
      <section className="min-h-screen flex flex-col items-center justify-center px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ paddingTop: 'clamp(120px, 12vh, 180px)', paddingBottom: 'clamp(80px, 10vh, 140px)' }}>
        
        {/* Authentic WeKraft Background */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Starry Night */}
          <img src="/night-hero.png" alt="Starry Background" className="absolute inset-0 object-cover w-full h-full opacity-100 mix-blend-screen" />

          
          {/* Very subtle gradient at bottom only so text is readable, no dark overlay on stars */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#000000]" />
        </div>

        {/* Diagonal Light Sweep Effect */}
        <div className="absolute top-[-20%] left-[-10%] w-[120%] h-[120%] pointer-events-none z-0"
          style={{ background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.03) 25%, transparent 35%)' }}></div>

        {/* Micro Announcement Banner */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3, ease: 'linear' }} className="cursor-pointer transition-all mb-10 rounded-full border shadow-[0_0_20px_rgba(59,130,246,0.1)] relative z-10"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)',
            padding: '8px 24px', backdropFilter: 'blur(8px)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}>
          <div className="flex items-center justify-center gap-3" 
            style={{ color: '#E4E4E7', fontSize: 'clamp(13px, 0.9vw, 15px)' }}>
            <span style={{ color: '#FCD34D' }}>✨</span>
            <span style={{ opacity: 0.5 }}>|</span>
            <span>Better way to build architecture</span>
          </div>
        </motion.div>

        {/* Massive Headline - WeKraft Style Gradient */}
        <motion.h1 initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} 
          transition={{ delay: 0.1, duration: 0.5, ease: 'easeOut' }} className="font-extrabold text-center relative z-10"
          style={{ fontSize: 'clamp(64px, 8vw, 140px)', lineHeight: 1.1,
            marginBottom: 'clamp(32px, 3.5vw, 64px)', maxWidth: '1400px',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 80%, #52525B 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0px 10px 20px rgba(0,0,0,0.8))' }}>
          The Distributed Systems Lab<br/>You Control <span className="inline-block" style={{ 
            background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', 
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            display: 'inline-block', filter: 'drop-shadow(0px 0px 30px rgba(59,130,246,0.3))' 
          }}>📈</span>
        </motion.h1>

        {/* Subheadline - WeKraft Style */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
          transition={{ delay: 0.2, duration: 0.4, ease: 'linear' }} className="text-center relative z-10"
          style={{ color: '#D4D4D8', fontSize: 'clamp(18px, 1.4vw, 24px)', lineHeight: 1.6,
            marginBottom: 'clamp(48px, 4.5vw, 64px)', maxWidth: '800px', fontWeight: 400 }}>
          AI agents that plan, assign, and track — autonomously. Collaborate seamlessly, real-time sync, zero deadline drift. Build together — frictionless.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
          transition={{ delay: 0.3, duration: 0.4, ease: 'linear' }} className="flex flex-wrap items-center justify-center gap-4 mb-20">
          <button onClick={() => navigate('/auth')} className="transition-all rounded-full bg-blue-600 hover:bg-blue-500 font-semibold"
            style={{ color: '#FFFFFF', padding: 'clamp(14px, 1.2vw, 20px) clamp(28px, 2.5vw, 44px)', fontSize: 'clamp(15px, 1.2vw, 18px)' }}>
            Try the Demo
          </button>
          <button className="border transition-all flex items-center gap-3 rounded-full"
            style={{ borderColor: 'rgba(59,130,246,0.4)', color: '#3B82F6', backgroundColor: 'transparent',
              padding: 'clamp(14px, 1.2vw, 20px) clamp(28px, 2.5vw, 44px)', fontSize: 'clamp(15px, 1.2vw, 18px)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
            <Github style={{ width: 'clamp(18px, 1.5vw, 26px)', height: 'clamp(18px, 1.5vw, 26px)' }} />
            View on GitHub
          </button>
        </motion.div>

        {/* PRODUCT FRAME — COMMAND CENTER (Terminal Only) */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} 
          whileHover={{ y: -5, boxShadow: '0 40px 80px -20px rgba(59,130,246,0.15)' }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-full border relative z-10 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all"
          style={{ backgroundColor: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.08)', maxWidth: '1200px' }}>
          
          <div style={{ padding: 'clamp(16px, 1.5vw, 24px)' }}>
            <div className="uppercase mb-4 tracking-widest flex items-center justify-between" 
              style={{ color: '#A1A1AA', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
              <span>TERMINAL OUTPUT</span>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
            </div>
            {/* Terminal Output Component */}
            <div className="w-full relative z-20 h-[400px]">
              <TerminalOutput />
            </div>
          </div>
        </motion.div>
      </section>

      {/* SECTION 2 — GIANT TYPOGRAPHY STATEMENT */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10 overflow-hidden" 
        style={{ paddingTop: 'clamp(120px, 12vw, 220px)', paddingBottom: 'clamp(120px, 12vw, 220px)' }}>
        <Particles
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleColors={["#3B82F6"]}
          moveParticlesOnHover={false}
          particleHoverFactor={1.6}
          alphaParticles={false}
          particleBaseSize={150}
          sizeRandomness={1.1}
          cameraDistance={20}
          disableRotation={false}
        />
        <div className="mx-auto text-center relative" style={{ maxWidth: '1700px' }}>
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }} className="font-bold mb-16"
            style={{ color: '#FFFFFF', fontSize: 'clamp(48px, 5.2vw, 104px)', lineHeight: 1.1 }}>
            AI-generated architectures.
          </motion.h2>
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} 
            transition={{ delay: 0.1, duration: 0.4, ease: 'linear' }} className="font-bold mb-16"
            style={{ color: '#3B82F6', fontSize: 'clamp(48px, 5.2vw, 104px)', lineHeight: 1.1 }}>
            Physics-verified reliability.
          </motion.h2>
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} 
            transition={{ delay: 0.2, duration: 0.4, ease: 'linear' }} className="font-bold"
            style={{ color: '#A1A1AA', fontSize: 'clamp(48px, 5.2vw, 104px)', lineHeight: 1.1 }}>
            Deterministic by design.
          </motion.h2>
        </div>
      </section>

      {/* SECTION 3 — FEATURE 1: AI-Native Generative Canvas */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#0A0A0A', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <div className="mx-auto grid md:grid-cols-2 items-center gap-16" style={{ maxWidth: '1840px' }}>
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.4, ease: 'linear' }}>
            <div className="uppercase mb-4 tracking-widest" 
              style={{ color: '#3B82F6', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.8vw, 14px)' }}>
              01 — AI CANVAS
            </div>
            <h3 className="font-bold mb-6" style={{ color: '#FFFFFF', fontSize: 'clamp(36px, 4vw, 72px)', lineHeight: 1.1 }}>
              Text-to-Graph Architecture
            </h3>
            <p className="mb-4" style={{ color: '#A1A1AA', fontSize: 'clamp(16px, 1.35vw, 24px)', lineHeight: 1.6 }}>
              Powered by Groq API running Llama 3 at 300+ tokens/second. Upload your system-design.pdf or paste requirements. 
              Prompt: "Build a Netflix-like microservices backend" and watch AI insert load balancers, caching layers, and message queues in real-time.
            </p>
            <p style={{ color: '#A1A1AA', opacity: 0.7, fontSize: 'clamp(14px, 1.1vw, 20px)', lineHeight: 1.6 }}>
              Every node placement validated against distributed systems best practices. No hallucinations. Pure architectural reasoning.
            </p>
          </motion.div>
          {/* AI Canvas — animated graph building */}
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            whileHover={{ y: -5, boxShadow: '0 30px 60px -15px rgba(59,130,246,0.15)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="relative border h-96 overflow-hidden rounded-2xl transition-all shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
            style={{ backgroundColor: '#000000', borderColor: 'rgba(59,130,246,0.2)',
              backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.03) 1px, transparent 1px)',
              backgroundSize: 'clamp(18px, 1.65vw, 28px) clamp(18px, 1.65vw, 28px)' }}>

            {/* Prompt bar */}
            <div className="absolute top-0 left-0 right-0 border-b px-3 py-2 flex items-center gap-2"
              style={{ borderColor: 'rgba(59,130,246,0.15)', backgroundColor: 'rgba(4,15,14,0.9)', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#71717A' }}>
              <span style={{ color: '#3B82F6' }}>▶</span>
              <motion.span animate={{ opacity: [1,0.4,1] }} transition={{ duration: 1.6, repeat: Infinity }}
                style={{ color: '#3B82F6' }}>AI</motion.span>
              <span>&nbsp;"add Redis cache layer between API and Postgres"</span>
            </div>

            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 340" preserveAspectRatio="xMidYMid meet" style={{ top: '32px', height: 'calc(100% - 32px)' }}>
              <defs>
                <filter id="sglow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <path id="s-c-a"  d="M 200 48 L 200 105" />
                <path id="s-a-p"  d="M 175 145 C 150 175 115 190 102 205" />
                <path id="s-a-r"  d="M 200 145 L 200 200" />
                <path id="s-a-cf" d="M 225 145 C 250 175 285 190 298 205" />
              </defs>

              {/* edges */}
              <motion.path d="M 200 48 L 200 105" fill="none" stroke="rgba(59,130,246,0.25)" strokeWidth="1.5"
                initial={{ pathLength:0 }} animate={{ pathLength:1 }} transition={{ delay:0.3, duration:0.4, ease:'linear' }}/>
              <motion.path d="M 175 145 C 150 175 115 190 102 205" fill="none" stroke="rgba(59,130,246,0.25)" strokeWidth="1.5"
                initial={{ pathLength:0 }} animate={{ pathLength:1 }} transition={{ delay:0.7, duration:0.45, ease:'linear' }}/>
              <motion.path d="M 200 145 L 200 200" fill="none" stroke="rgba(59,130,246,0.55)" strokeWidth="1.5" strokeDasharray="4 3"
                initial={{ pathLength:0 }} animate={{ pathLength:1 }} transition={{ delay:1.1, duration:0.4, ease:'linear' }}/>
              <motion.path d="M 225 145 C 250 175 285 190 298 205" fill="none" stroke="rgba(59,130,246,0.25)" strokeWidth="1.5"
                initial={{ pathLength:0 }} animate={{ pathLength:1 }} transition={{ delay:0.9, duration:0.45, ease:'linear' }}/>

              {/* packets */}
              <circle r="2.5" fill="#3B82F6" opacity="0.85"><animateMotion dur="1.8s" repeatCount="indefinite" begin="0.8s"><mpath href="#s-c-a"/></animateMotion></circle>
              <circle r="2" fill="#3B82F6" opacity="0.6"><animateMotion dur="2.2s" repeatCount="indefinite" begin="1.2s"><mpath href="#s-a-p"/></animateMotion></circle>
              <circle r="3" fill="#3B82F6" opacity="1" style={{ filter:'drop-shadow(0 0 4px #3B82F6)' }}><animateMotion dur="1.4s" repeatCount="indefinite" begin="1.6s"><mpath href="#s-a-r"/></animateMotion></circle>
              <circle r="2" fill="#3B82F6" opacity="0.6"><animateMotion dur="2.0s" repeatCount="indefinite" begin="1.4s"><mpath href="#s-a-cf"/></animateMotion></circle>

              {/* Client */}
              <motion.g initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1, duration:0.3 }}>
                <rect x="158" y="18" width="84" height="36" rx="2" fill="#0A0A0A" stroke="rgba(59,130,246,0.35)" strokeWidth="1"/>
                <text x="200" y="32" textAnchor="middle" fill="#71717A" fontSize="6.5" fontFamily="JetBrains Mono, monospace" letterSpacing="1.2">CLIENT</text>
                <text x="200" y="46" textAnchor="middle" fill="#FFFFFF" fontSize="9.5" fontFamily="JetBrains Mono, monospace">Frontend</text>
              </motion.g>

              {/* API Gateway — glowing */}
              <motion.g initial={{ opacity:0, scale:0.85 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.4, duration:0.3 }}>
                <motion.rect x="150" y="100" width="100" height="50" rx="3" fill="none" stroke="rgba(59,130,246,0.15)"
                  animate={{ opacity:[0.8,0,0.8], strokeWidth:[1,3,1] }} transition={{ duration:2.2, repeat:Infinity, ease:'easeInOut' }}/>
                <rect x="158" y="108" width="84" height="44" rx="2" fill="#0A0A0A" stroke="#3B82F6" strokeWidth="1.8"
                  style={{ filter:'drop-shadow(0 0 8px rgba(59,130,246,0.5))' }}/>
                <text x="200" y="124" textAnchor="middle" fill="#71717A" fontSize="6.5" fontFamily="JetBrains Mono, monospace" letterSpacing="1.2">GATEWAY</text>
                <text x="200" y="141" textAnchor="middle" fill="#3B82F6" fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="bold">API</text>
              </motion.g>

              {/* Postgres */}
              <motion.g initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.8, duration:0.3 }}>
                <rect x="58" y="205" width="88" height="40" rx="2" fill="#0A0A0A" stroke="rgba(59,130,246,0.35)" strokeWidth="1"/>
                <text x="102" y="220" textAnchor="middle" fill="#71717A" fontSize="6.5" fontFamily="JetBrains Mono, monospace" letterSpacing="1.2">DATABASE</text>
                <text x="102" y="235" textAnchor="middle" fill="#FFFFFF" fontSize="9.5" fontFamily="JetBrains Mono, monospace">Postgres</text>
              </motion.g>

              {/* Redis — AI inserting, marching ants */}
              <motion.g initial={{ opacity:0, scale:0.88 }} animate={{ opacity:1, scale:1 }} transition={{ delay:1.2, duration:0.35 }}>
                <motion.rect x="158" y="200" width="84" height="50" rx="2" fill="#0A0A0A"
                  stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="5 3"
                  animate={{ strokeDashoffset:[0,-16] }} transition={{ duration:0.65, repeat:Infinity, ease:'linear' }}/>
                <text x="200" y="220" textAnchor="middle" fill="#3B82F6" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold"
                  style={{ filter:'drop-shadow(0 0 5px rgba(59,130,246,0.7))' }}>Redis</text>
                <text x="200" y="233" textAnchor="middle" fill="#71717A" fontSize="6.5" fontFamily="JetBrains Mono, monospace">CACHE</text>
                <motion.text x="200" y="244" textAnchor="middle" fill="#3B82F6" fontSize="7" fontFamily="JetBrains Mono, monospace"
                  animate={{ opacity:[1,0.2,1] }} transition={{ duration:1.0, repeat:Infinity, ease:'easeInOut' }}>▋ inserting...</motion.text>
              </motion.g>

              {/* Cloudflare CDN */}
              <motion.g initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:1.0, duration:0.3 }}>
                <rect x="254" y="205" width="88" height="40" rx="2" fill="#0A0A0A" stroke="rgba(59,130,246,0.35)" strokeWidth="1"/>
                <text x="298" y="220" textAnchor="middle" fill="#71717A" fontSize="6.5" fontFamily="JetBrains Mono, monospace" letterSpacing="1.2">CDN</text>
                <text x="298" y="235" textAnchor="middle" fill="#FFFFFF" fontSize="9.5" fontFamily="JetBrains Mono, monospace">CloudFront</text>
              </motion.g>

              {/* status bar */}
              <motion.g initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:1.5, duration:0.4 }}>
                <rect x="10" y="295" width="380" height="22" rx="2" fill="rgba(59,130,246,0.04)" stroke="rgba(59,130,246,0.12)" strokeWidth="1"/>
                <circle cx="22" cy="306" r="3.5" fill="#3B82F6" opacity="0.9"/>
                <motion.text x="32" y="310" fill="#3B82F6" fontSize="8" fontFamily="JetBrains Mono, monospace"
                  animate={{ opacity:[1,0.4,1] }} transition={{ duration:1.4, repeat:Infinity }}>AI generating architecture</motion.text>
                <text x="280" y="310" fill="#71717A" fontSize="8" fontFamily="JetBrains Mono, monospace">4 nodes · 4 edges</text>
              </motion.g>
            </svg>
          </motion.div>
        </div>
      </section>

      {/* WEKRAFT-STYLE CARDS - NODE GRAPH THEME */}
      <section className="px-4 md:px-8 xl:px-12 2xl:px-16 relative z-10 flex flex-col items-center overflow-hidden" 
        style={{ paddingTop: 'clamp(80px, 10vw, 140px)', paddingBottom: 'clamp(80px, 10vw, 140px)' }}>
        
        {/* Subtle grid background */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '70px 70px' }} />

        {/* Section Heading like Screenshot 4 */}
        <div className="w-full max-w-6xl mb-16 relative z-10 flex flex-col items-start px-4">
          <div className="inline-flex items-center justify-center px-4 py-1.5 border border-blue-500/30 rounded-full mb-6 bg-blue-500/10">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></div>
            <span className="text-zinc-300 text-xs font-medium tracking-wide">Purpose-built for engineering teams</span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-2">Build with clarity.</h2>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-zinc-500 mb-6">Ship with confidence.</h2>
          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl leading-relaxed">
            InfraZero combines intelligent physics, real-time collaboration, and deep 
            telemetry into one unified developer platform.
          </p>
        </div>

        {/* The Elevated Card Grid */}
        <div className="w-full max-w-6xl relative z-10 flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="w-full relative rounded-[40px] p-6 md:p-10 border shadow-[0_30px_100px_rgba(0,0,0,0.6)]"
            style={{ 
              backgroundColor: 'rgba(10, 10, 14, 0.6)',
              backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              borderColor: 'rgba(255, 255, 255, 0.05)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1)'
            }}
          >
            {/* Inner Grid */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* CARD 1: Physics Engine */}
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} 
            whileHover={{ y: -8, boxShadow: '0 30px 60px -15px rgba(59,130,246,0.2)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="rounded-3xl border flex flex-col overflow-hidden bg-[#0A0A0E] transition-all"
            style={{ borderColor: 'rgba(255,255,255,0.06)', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)' }}>
            <div className="p-8 pb-4 flex items-center gap-3 border-b border-white/5 bg-white/5">
              <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-500">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="font-semibold text-zinc-300 tracking-wider text-xs uppercase">Physics Engine</div>
            </div>
            <div className="p-8 pt-6 flex-1 flex flex-col">
              <h3 className="text-xl font-bold text-white mb-3">Deterministic WASM Physics</h3>
              <p className="text-zinc-500 text-sm leading-relaxed mb-8 flex-1">
                Your graph compiles to a Rust struct, executing Monte Carlo simulations at 60fps in WebAssembly. Verify stability before deployment.
              </p>
              {/* Transplanted Physics Visual */}
              <div className="border border-white/10 rounded-xl bg-black/50 p-4 font-mono text-xs relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0"></div>
                <div className="flex justify-between text-zinc-500 mb-3 border-b border-white/5 pb-2"><span>REQUESTS/SEC</span><span className="text-blue-400 font-bold">98,432</span></div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3"><span className="w-8 flex-shrink-0 text-zinc-600">p50</span><div className="h-1 flex-1 bg-white/5 rounded"><div className="h-full bg-blue-500 rounded" style={{width:'85%'}}></div></div><span className="w-8 text-right text-zinc-400">12ms</span></div>
                  <div className="flex items-center gap-3"><span className="w-8 flex-shrink-0 text-zinc-600">p99</span><div className="h-1 flex-1 bg-white/5 rounded"><div className="h-full bg-blue-500 flex opacity-60 rounded" style={{width:'45%'}}></div></div><span className="w-8 text-right text-zinc-400">91ms</span></div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* CARD 2: Collaboration */}
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} 
            whileHover={{ y: -8, boxShadow: '0 30px 60px -15px rgba(0,217,163,0.2)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className="rounded-3xl border flex flex-col overflow-hidden bg-[#0A0A0E] transition-all"
            style={{ borderColor: 'rgba(255,255,255,0.06)', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)' }}>
            <div className="p-8 pb-4 flex items-center gap-3 border-b border-white/5 bg-white/5">
              <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-500">
                <Network className="w-4 h-4" />
              </div>
              <div className="font-semibold text-zinc-300 tracking-wider text-xs uppercase">Collaboration</div>
            </div>
            <div className="p-8 pt-6 flex-1 flex flex-col bg-gradient-to-b from-transparent to-[#052e16]/10">
              <h3 className="text-xl font-bold text-white mb-3">Peer-to-Peer Synchronization</h3>
              <p className="text-zinc-500 text-sm leading-relaxed mb-8 flex-1">
                Built on Yjs CRDTs with WebRTC transport. No server relay. Share a URL and watch edits merge in real-time with zero conflicts.
              </p>
              {/* Transplanted Multiplayer Visual */}
              <div className="h-[120px] rounded-xl bg-[#050505] border border-white/10 relative overflow-hidden shadow-inner flex items-center justify-center">
                 <motion.div className="absolute z-20 shadow-[0_0_10px_rgba(59,130,246,0.6)] border border-white/20 flex flex-col items-center" 
                   animate={{ x: [-40, 40, -20, -40], y: [-20, 20, 30, -20] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
                   <div style={{ backgroundColor: '#3B82F6', width: '10px', height: '10px', borderRadius: '50%' }}></div>
                   <div className="text-[#3B82F6] font-mono text-[10px] mt-1 tracking-wide font-medium bg-black/80 px-1.5 py-0.5 rounded border border-blue-500/30">User A</div>
                 </motion.div>
                 
                 <motion.div className="absolute z-20 shadow-[0_0_10px_rgba(0,217,163,0.6)] border border-white/20 flex flex-col items-center" 
                   animate={{ x: [40, -40, 20, 40], y: [20, -20, -30, 20] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}>
                   <div style={{ backgroundColor: '#00D9A3', width: '10px', height: '10px', borderRadius: '50%' }}></div>
                   <div className="text-[#00D9A3] font-mono text-[10px] mt-1 tracking-wide font-medium bg-black/80 px-1.5 py-0.5 rounded border border-[#00D9A3]/30">User B</div>
                 </motion.div>
              </div>
            </div>
          </motion.div>

          {/* CARD 3: Telemetry */}
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} 
            whileHover={{ y: -8, boxShadow: '0 30px 60px -15px rgba(168,85,247,0.2)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
            className="rounded-3xl border flex flex-col overflow-hidden md:col-span-2 bg-[#0A0A0E] transition-all"
            style={{ borderColor: 'rgba(255,255,255,0.06)', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)' }}>
            <div className="p-8 pb-4 flex items-center gap-3 border-b border-white/5 bg-white/5">
              <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-500">
                <Terminal className="w-4 h-4" />
              </div>
              <div className="font-semibold text-zinc-300 tracking-wider text-xs uppercase">Telemetry & Reporting</div>
            </div>
            <div className="p-8 pt-6 flex-1 grid md:grid-cols-2 gap-8 items-center bg-gradient-to-br from-transparent to-[#1e1b4b]/20">
              <div>
                <h3 className="text-xl font-bold text-white mb-3">Real-Time Observability</h3>
                <p className="text-zinc-500 text-sm leading-relaxed mb-6">
                  Terminal output mimics production observability tools. Watch cascading failures unfold in real-time. Export post-mortem PDFs with root cause analysis automatically.
                </p>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs font-mono text-zinc-400">Deployed</div>
                  <div className="px-3 py-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-xs font-mono text-blue-400 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div> Tracking Events
                  </div>
                </div>
              </div>
              
              {/* Transplanted Terminal */}
              <div className="relative shadow-xl">
                 <TerminalOutput style={{
                  border: '1px solid rgba(255,255,255,0.05)',
                  height: '240px',
                  padding: '16px',
                  fontSize: '11px',
                  borderRadius: '16px',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                  backgroundColor: '#050505'
                 }} />
              </div>
            </div>
          </motion.div>

            </div>
          </motion.div>
        </div>
      </section>

      {/* SECTION 4 — METRICS STRIP */}
      <section className="px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#000000', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} 
          transition={{ duration: 0.5, ease: 'linear' }} className="mx-auto" style={{ maxWidth: '1840px' }}>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {[
              { number: '< 50ms', label: 'CRDT Sync\nLatency' },
              { number: '$0', label: 'Backend\nExecution Cost' },
              { number: '100%', label: 'Client-Side\nWASM Execution' },
              { number: 'SHA-256', label: 'Stable Hash\nVerification' }
            ].map((metric, i) => (
              <div key={i} className="text-center border-r py-16 px-8" style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
                <div className="mb-4" style={{ color: '#3B82F6', fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 'clamp(36px, 4vw, 68px)' }}>
                  {metric.number}
                </div>
                <div className="uppercase tracking-widest whitespace-pre-line" 
                  style={{ color: '#A1A1AA', fontFamily: 'JetBrains Mono, monospace', 
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
        style={{ backgroundColor: '#000000', paddingTop: 'clamp(80px, 9vw, 160px)', paddingBottom: 'clamp(80px, 9vw, 160px)' }}>
        <div className="mx-auto" style={{ maxWidth: '1700px' }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} 
            transition={{ duration: 0.5, ease: 'linear' }} className="border p-12"
            style={{ backgroundColor: '#0A0A0A', borderColor: '#3B82F6', borderWidth: '1px' }}>
            
            <div className="inline-block uppercase tracking-widest mb-8" 
              style={{ backgroundColor: '#3B82F6', color: '#000000', fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 600, padding: 'clamp(8px, 0.8vw, 12px) clamp(16px, 1.5vw, 24px)', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
              Educational Presets
            </div>
            
            <h3 className="font-bold mb-6" style={{ color: '#FFFFFF', fontSize: 'clamp(40px, 4.5vw, 80px)', lineHeight: 1.1 }}>
              The Library of Doom
            </h3>
            
            <p className="mb-12" style={{ color: '#A1A1AA', fontSize: 'clamp(16px, 1.35vw, 24px)', lineHeight: 1.6 }}>
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
                  style={{ backgroundColor: '#000000', borderColor: 'rgba(59,130,246,0.2)' }}>
                  <div className="uppercase tracking-widest mb-3" 
                    style={{ color: '#3B82F6', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
                    Scenario {preset.number}
                  </div>
                  <h4 className="font-bold mb-3" style={{ color: '#FFFFFF', fontSize: 'clamp(20px, 1.8vw, 32px)' }}>
                    {preset.title}
                  </h4>
                  <p style={{ color: '#A1A1AA', fontFamily: 'JetBrains Mono, monospace', 
                    fontSize: 'clamp(12px, 0.95vw, 16px)', lineHeight: 1.6 }}>
                    {preset.description}
                  </p>
                </div>
              ))}
            </div>

            <button className="border transition-all uppercase tracking-wider mt-8"
              style={{ borderColor: 'rgba(59,130,246,0.4)', color: '#3B82F6', backgroundColor: 'transparent',
                fontFamily: 'JetBrains Mono, monospace', padding: 'clamp(14px, 1.3vw, 20px) clamp(32px, 2.8vw, 48px)', fontSize: 'clamp(12px, 1vw, 15px)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#3B82F6'; e.currentTarget.style.color = '#000000'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#3B82F6'; }}>
              Browse All Scenarios →
            </button>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t px-8 xl:px-12 2xl:px-16 relative z-10" 
        style={{ backgroundColor: '#000000', borderColor: 'rgba(59,130,246,0.1)', paddingTop: 'clamp(60px, 7vw, 100px)', paddingBottom: 'clamp(60px, 7vw, 100px)' }}>
        <div className="mx-auto" style={{ maxWidth: '1840px' }}>
          <div className="grid md:grid-cols-4 gap-12">
            <div>
              <div className="mb-4" style={{ color: '#3B82F6', fontSize: 'clamp(24px, 2vw, 32px)' }}>InfraZero</div>
              <p style={{ color: '#A1A1AA', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(12px, 1vw, 15px)' }}>
                Control plane for distributed systems.
              </p>
            </div>
            
            {['Platform', 'Resources', 'Connect'].map((section) => (
              <div key={section}>
                <div className="uppercase mb-4 tracking-widest" 
                  style={{ color: '#A1A1AA', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(10px, 0.85vw, 13px)' }}>
                  {section}
                </div>
                <div className="space-y-2">
                  {['Features', 'Documentation', 'Examples'].map((link) => (
                    <div key={link}>
                      <a href="#" className="transition-colors" style={{ color: '#A1A1AA', fontSize: 'clamp(13px, 1vw, 16px)' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#3B82F6'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#A1A1AA'}>
                        {link}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-16 pt-8 border-t" style={{ borderColor: 'rgba(59,130,246,0.1)', 
            color: '#A1A1AA', fontFamily: 'JetBrains Mono, monospace', fontSize: 'clamp(11px, 0.9vw, 14px)' }}>
            © 2026 InfraZero. Infrastructure-grade distributed systems platform.
          </div>
        </div>
      </footer>
    </div>
  );
}
