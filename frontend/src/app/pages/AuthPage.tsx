import { motion } from 'motion/react';
import { Github, UserCircle, Zap } from 'lucide-react';
import { useNavigate } from 'react-router';
import { authFetch, saveSession } from '../../lib/auth';

export default function AuthPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ 
      backgroundColor: '#000000',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Background Atmosphere (Matching Landing Page) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img src="/night-hero.png" alt="Starry Background" className="absolute inset-0 object-cover w-full h-full opacity-100 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
        {/* Centered blue glow behind card */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Grid Lines Overlay */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        backgroundImage: 'repeating-linear-gradient(to right, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px), repeating-linear-gradient(to bottom, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px)',
        backgroundSize: '80px 80px'
      }} />

      {/* Authentication Form (Centered Glassmorphism Card) */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-[480px] px-6 relative z-10"
      >
        <div className="relative group">
          {/* Main Form Card */}
          <div className="relative z-10 p-8 md:p-12 rounded-[32px] border border-white/10 bg-zinc-900/40 backdrop-blur-3xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Subtle Inner Glow */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            {/* Logo/Branding Header */}
            <div className="flex flex-col items-center mb-10 text-center">
              <div className="flex items-center gap-3 mb-6 cursor-pointer" onClick={() => navigate('/')}>
                <span className="font-bold tracking-tight text-white text-2xl">
                  InfraZero
                </span>
                <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)]" />
              </div>
              <h1 className="mb-3 text-white font-bold tracking-tight text-4xl md:text-5xl" style={{ 
                lineHeight: 1.1,
                letterSpacing: '-0.04em'
              }}>
                Welcome back.
              </h1>
              <p className="text-zinc-400 text-base">
                Secure access to your distributed systems lab.
              </p>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-4 mb-10">
              <motion.button
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="iz-btn-blue w-full relative overflow-hidden flex items-center justify-center font-bold text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)]"
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  gap: '12px',
                  fontSize: '16px'
                }}
                onClick={() => {
                  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
                  const redirectUri = `${window.location.origin}/auth/github/callback`;
                  window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`;
                }}
              >
                {/* SVG Border Animation Effect */}
                <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'1.5px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'1.5px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'1.5px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
                <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'1.5px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
                
                <Github size={20} />
                Continue with GitHub
              </motion.button>

              <motion.button
                whileHover={{ y: -2, scale: 1.01, backgroundColor: 'rgba(255,255,255,0.05)' }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-center border border-white/10 bg-transparent text-white font-semibold transition-all"
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  gap: '12px',
                  fontSize: '16px'
                }}
                onClick={() => {
                  // @ts-ignore
                  google.accounts.id.initialize({
                    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
                    callback: async (response: any) => {
                      try {
                        const res = await authFetch('/api/auth/google', {
                          method: 'POST',
                          body: JSON.stringify({ token: response.credential }),
                        });
                        if (!res.ok) {
                          throw new Error(`Google login failed: ${res.status}`);
                        }
                        const data = await res.json();
                        if (data.token) {
                          saveSession(data.token, data.user);
                          navigate('/dashboard');
                        }
                      } catch (err) {
                        console.error('Google login failed', err);
                      }
                    },
                  });
                  // @ts-ignore
                  google.accounts.id.prompt();
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

              <div className="py-4 flex items-center gap-4">
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-zinc-600 text-[10px] font-bold tracking-widest uppercase">OR</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>

              <motion.button
                whileHover={{ cursor: 'pointer', color: '#FFFFFF', backgroundColor: 'rgba(59,130,246,0.1)' }}
                className="w-full flex items-center justify-center gap-3 text-zinc-400 font-medium transition-colors p-4 rounded-2xl border border-transparent hover:border-blue-500/30"
                onClick={async () => {
                  const tempSessionId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                  saveSession(`iz1.${tempSessionId}`, {
                    id: tempSessionId,
                    name: 'Guest User',
                    tier: 'temporary',
                    isGuest: true,
                  });
                  navigate('/dashboard');
                }}
                style={{ fontSize: '15px' }}
              >
                <UserCircle size={20} />
                Explore as Guest
              </motion.button>
            </div>

            {/* Security Note */}
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex gap-4">
              <Zap className="w-5 h-5 text-blue-500 shrink-0" fill="currentColor" />
              <div>
                <div className="text-blue-400 font-bold text-[11px] tracking-wider uppercase mb-1">Local-First Privacy</div>
                <div className="text-zinc-500 text-[13px] leading-relaxed">
                  Authentication is only for cloud sync. Architecture data is stored locally in your browser.
                </div>
              </div>
            </div>
          </div>

          {/* Footer Text */}
          <div className="mt-8 text-center text-zinc-500 text-xs font-medium">
            By continuing, you agree to our <a href="#" className="text-blue-500 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-500 hover:underline">Privacy Policy</a>.
          </div>
        </div>

        {/* Floating tech metrics (Centered decorative) */}
        <div className="mt-12 flex justify-center gap-8">
          <div className="font-mono text-[9px] text-zinc-600 tracking-[0.2em] uppercase flex gap-6">
            <div>LAB_VER: 1.0.4</div>
            <div>STATUS: <span className="text-blue-500 animate-pulse">OPTIMIZED</span></div>
            <div>UPTIME: 99.9%</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}