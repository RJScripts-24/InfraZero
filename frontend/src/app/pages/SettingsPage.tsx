import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ArrowLeft, Zap, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('Guest User');
  const [email, setEmail] = useState('guest@infrazero.dev');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [vimMode, setVimMode] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearedMessage, setShowClearedMessage] = useState(false);

  const handleSaveProfile = () => {
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 3000);
  };

  const handleClearStorage = () => {
    setShowClearConfirm(true);
  };

  const confirmClearStorage = () => {
    setShowClearConfirm(false);
    setShowClearedMessage(true);
    setTimeout(() => setShowClearedMessage(false), 3000);
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#000000', fontFamily: 'Inter, sans-serif' }}>
      
      {/* ── Background Atmosphere (Matching Brand) ── */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img src="/night-hero.png" alt="Starry Background" className="absolute inset-0 object-cover w-full h-full opacity-60 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-black/80" />
      </div>

      {/* Grid Lines Overlay */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        backgroundImage: 'repeating-linear-gradient(to right, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px), repeating-linear-gradient(to bottom, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px)',
        backgroundSize: '80px 80px'
      }} />

      {/* Content */}
      <div className="relative z-10" style={{ maxWidth: '820px', margin: '0 auto', padding: '80px 40px' }}>
        
        {/* Back Button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="group flex items-center gap-2 mb-10 transition-colors text-zinc-500 hover:text-blue-400"
          style={{ fontSize: '14px' }}
        >
          <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
          Back to Dashboard
        </button>

        {/* Header */}
        <motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
  className="mb-12"
>
  <h1 className="text-white font-bold tracking-tight mb-3" style={{ fontSize: '44px', letterSpacing: '-0.03em' }}>
    Settings
  </h1>
  <p className="text-zinc-400 text-lg">
    Manage your profile, simulation preferences, and deterministic local storage.
  </p>
</motion.div>

        {/* Section 1 - Profile (Glassmorphism) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="mb-8 p-8 rounded-[24px] border border-white/10 bg-zinc-900/40 backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden relative"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
          
          <div className="mb-8 font-mono text-[11px] font-bold tracking-[0.2em] uppercase text-blue-500 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
            Profile Configuration
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Name Field */}
            <div className="space-y-2">
              <label className="text-zinc-500 text-xs font-bold uppercase tracking-wider ml-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Guest User"
                className="w-full px-5 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white font-medium focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-zinc-700"
              />
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <label className="text-zinc-500 text-xs font-bold uppercase tracking-wider ml-1">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-5 py-3.5 bg-black/20 border border-white/5 rounded-xl text-zinc-500 font-medium cursor-not-allowed italic"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-blue-500/50 flex items-center gap-1.5">
                   <Lock size={10} />
                   LOCKED
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-zinc-600 text-[11px] font-mono tracking-wide flex items-center gap-2 pl-1">
            <Zap size={12} className="text-blue-500/50" />
            Authenticated via OAuth session. Syncing with local-first cache.
          </div>

          {/* Action Row */}
          <div className="mt-10 flex items-center justify-between pt-8 border-t border-white/5">
             <div className="min-h-[20px]">
                {showSaveConfirm && (
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-blue-400 font-mono text-[11px] font-bold uppercase flex items-center gap-2"
                  >
                    <Check size={14} />
                    Changes committed locally
                  </motion.div>
                )}
             </div>
             
             <motion.button
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSaveProfile}
              className="iz-btn-blue relative overflow-hidden py-3 px-8 rounded-xl text-white font-bold text-sm transition-all shadow-[0_15px_30px_-10px_rgba(59,130,246,0.3)]"
            >
              {/* SVG Border Animation */}
              <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to left, rgba(30,58,138,0), #000000)', animation:'izAnimateTop 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, right:0, height:'100%', width:'2px', background:'linear-gradient(to top, rgba(30,58,138,0), #000000)', animation:'izAnimateRight 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', bottom:0, left:0, width:'100%', height:'2px', background:'linear-gradient(to right, rgba(30,58,138,0), #000000)', animation:'izAnimateBottom 2s linear infinite', pointerEvents:'none', zIndex:2 }} />
              <span style={{ position:'absolute', top:0, left:0, height:'100%', width:'2px', background:'linear-gradient(to bottom, rgba(30,58,138,0), #000000)', animation:'izAnimateLeft 2s linear -1s infinite', pointerEvents:'none', zIndex:2 }} />
              
              Save Configuration
            </motion.button>
          </div>
        </motion.div>

        {/* Section 2 - Preferences */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            className="p-8 rounded-[24px] border border-white/10 bg-zinc-900/40 backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4)]"
          >
            <div className="mb-6 text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2">
               Theme Mode
            </div>
            <div className="flex gap-3 bg-black/40 p-1.5 rounded-2xl border border-white/5">
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${theme === 'dark' ? 'bg-blue-500 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${theme === 'light' ? 'bg-blue-500 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Light
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            className="p-8 rounded-[24px] border border-white/10 bg-zinc-900/40 backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4)]"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em]">Editor Control</div>
                <h4 className="text-white font-bold">Vim Keybindings</h4>
                <p className="text-zinc-500 text-xs leading-relaxed">Enable vim-style input for architects.</p>
              </div>
              <button
                onClick={() => setVimMode(!vimMode)}
                className={`relative w-12 h-6 rounded-full transition-all border ${vimMode ? 'bg-blue-500 border-blue-400' : 'bg-zinc-800 border-white/10'}`}
              >
                <motion.div
                  animate={{ x: vimMode ? 26 : 2 }}
                  className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-md"
                />
              </button>
            </div>
          </motion.div>
        </div>

        {/* Section 3 - Data Stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          className="mb-8 p-8 rounded-[24px] border border-white/10 bg-zinc-900/40 backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4)]"
        >
          <div className="mb-6 font-mono text-[11px] font-bold tracking-[0.2em] uppercase text-zinc-500">Node Storage Status</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 font-mono">
            {[
              { label: 'Usage', value: '18.4MB' },
              { label: 'Projects', value: '07' },
              { label: 'Latency', value: '1.2ms' },
              { label: 'Consistency', value: 'Strong' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-[10px] text-zinc-600 uppercase mb-1">{label}</div>
                <div className="text-blue-500 font-bold text-sm tracking-widest">{value}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Section 4 - Danger Zone */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
          className="p-8 rounded-[24px] border border-red-500/20 bg-red-500/5 backdrop-blur-3xl shadow-[0_30px_60px_-20px_rgba(239,68,68,0.15)]"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-red-500 font-bold text-lg flex items-center gap-2">
                Danger Zone
              </h3>
              <p className="text-zinc-500 text-sm max-w-sm">Permanently wipe all locally-stored architectures and simulation metrics.</p>
            </div>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleClearStorage}
              className="py-3 px-8 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-sm hover:bg-red-500/20 transition-all"
            >
              Clear Node Storage
            </motion.button>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="mt-16 text-center space-y-2 opacity-30 select-none">
           <div className="font-mono text-[10px] text-zinc-500 tracking-[0.4em] uppercase font-bold">InfraZero System Lab</div>
           <div className="font-mono text-[9px] text-zinc-600 tracking-[0.2em] uppercase">V0.9.4-BETA // DETERMINISTIC_ARCH_v1</div>
        </div>
      </div>

      {/* Confirmation Modal (Premium Glassmorphism) */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setShowClearConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md p-10 rounded-[32px] border border-red-500/30 bg-zinc-900 shadow-[0_50px_100px_-20px_rgba(239,68,68,0.3)] text-center overflow-hidden"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-red-500/50" />
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500">
                <Trash2 size={32} />
              </div>
              <h2 className="text-white text-2xl font-bold mb-4 tracking-tight">System Data Wipe</h2>
              <p className="text-zinc-400 mb-10 leading-relaxed text-sm">
                This will purge all locally cached architectures. This action cannot be undone by deterministic rollbacks.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmClearStorage}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-500/30 transition-all"
                >
                  Confirm Force Clear
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="w-full py-3 text-zinc-500 font-medium hover:text-white transition-colors"
                >
                  Cancel Operation
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Check Toast */}
       <AnimatePresence>
        {showClearedMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-2xl bg-white text-black font-bold shadow-2xl flex items-center gap-3"
          >
             <Check size={18} />
             Node Storage Purged
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const Check = ({ size, className }: { size?: number, className?: string }) => (
  <svg 
    width={size || 24} 
    height={size || 24} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="3" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
