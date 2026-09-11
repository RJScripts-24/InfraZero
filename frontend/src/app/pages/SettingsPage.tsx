import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ArrowLeft, Trash2, Loader2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import * as api from '../../lib/api';
import { clearSession, isTemporaryGuest } from '../../lib/auth';

const Check = ({ size, className }: { size?: number; className?: string }) => (
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

export default function SettingsPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState<api.CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const guest = isTemporaryGuest();

  useEffect(() => {
    if (guest) {
      setIsLoading(false);
      return;
    }

    api
      .getCurrentUser()
      .then((data) => {
        setUser(data);
        setName(data.name);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load your account.'))
      .finally(() => setIsLoading(false));
  }, [guest]);

  const handleSaveProfile = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user?.name) return;

    setIsSaving(true);
    try {
      const updated = await api.updateProfileName(trimmed);
      setUser((prev) => (prev ? { ...prev, name: updated.name } : prev));
      setSavedAt(Date.now());
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Requires the user to type their exact display name before the button arms.
   * Account deletion cascades to every project and report, so a single
   * mis-click must not be enough to trigger it.
   */
  const deleteArmed = Boolean(user) && deleteConfirmText.trim() === user?.name;

  const handleDeleteAccount = async () => {
    if (!user || !deleteArmed) return;

    setIsDeleting(true);
    try {
      await api.deleteAccount(user.id);
      clearSession();
      toast.success('Your account and all its data have been deleted.');
      navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete your account.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#000000', fontFamily: 'Inter, sans-serif' }}>
      {/* ── Background Atmosphere ── */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img src="/night-hero.png" alt="" className="absolute inset-0 object-cover w-full h-full opacity-60 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-black/80" />
      </div>

      <div className="absolute inset-0 pointer-events-none z-0" style={{
        backgroundImage: 'repeating-linear-gradient(to right, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px), repeating-linear-gradient(to bottom, rgba(59,130,246,0.06) 0px, rgba(59,130,246,0.06) 1px, transparent 1px, transparent 80px)',
        backgroundSize: '80px 80px',
      }} />

      <div className="relative z-10" style={{ maxWidth: '820px', margin: '0 auto', padding: '80px 40px' }}>
        <button
          onClick={() => navigate('/dashboard')}
          className="group flex items-center gap-2 mb-10 transition-colors text-zinc-500 hover:text-blue-400"
          style={{ fontSize: '14px' }}
        >
          <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
          Back to Dashboard
        </button>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12"
        >
          <h1 className="text-white font-bold tracking-tight mb-3" style={{ fontSize: '44px', letterSpacing: '-0.03em' }}>
            Settings
          </h1>
          <p className="text-zinc-400 text-lg">Manage your account and your data.</p>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center gap-3 py-20 text-zinc-500">
            <Loader2 size={20} className="animate-spin text-blue-500" />
            <span className="text-sm font-medium">Loading your account...</span>
          </div>
        ) : guest ? (
          <div className="p-8 rounded-[24px] border border-white/10 bg-zinc-900/40 backdrop-blur-3xl text-center">
            <h3 className="text-white font-bold text-lg mb-2">You are exploring as a guest</h3>
            <p className="text-zinc-500 text-sm mb-6 max-w-md mx-auto">
              Guest sessions have no account attached, so there is nothing to manage here. Sign in to
              create an account.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="px-6 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 transition-all"
            >
              Sign in
            </button>
          </div>
        ) : loadError ? (
          <div className="p-8 rounded-[24px] border border-red-500/20 bg-red-500/5 text-center">
            <p className="text-red-400 font-bold mb-2">Could not load your account</p>
            <p className="text-zinc-500 text-sm">{loadError}</p>
          </div>
        ) : (
          <>
            {/* ── Profile ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              className="mb-8 p-8 rounded-[24px] border border-white/10 bg-zinc-900/40 backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden relative"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />

              <div className="mb-8 font-mono text-[11px] font-bold tracking-[0.2em] uppercase text-blue-500 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                Profile
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-zinc-500 text-xs font-bold uppercase tracking-wider ml-1">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-5 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white font-medium focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-zinc-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-zinc-500 text-xs font-bold uppercase tracking-wider ml-1">Email Address</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={user?.email || 'Not provided by your sign-in provider'}
                      disabled
                      className="w-full px-5 py-3.5 bg-black/20 border border-white/5 rounded-xl text-zinc-500 font-medium cursor-not-allowed"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-blue-500/50 flex items-center gap-1.5">
                      <Lock size={10} />
                      LOCKED
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-6 font-mono pt-6 border-t border-white/5">
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase mb-1">Signed in with</div>
                  <div className="text-blue-500 font-bold text-sm capitalize">{user?.provider || 'unknown'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase mb-1">Projects</div>
                  <div className="text-blue-500 font-bold text-sm">{user?.projectCount ?? 0}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase mb-1">Member since</div>
                  <div className="text-blue-500 font-bold text-sm">
                    {user ? new Date(user.createdAt).toLocaleDateString() : '-'}
                  </div>
                </div>
              </div>

              <div className="mt-10 flex items-center justify-between pt-8 border-t border-white/5">
                <div className="min-h-[20px]">
                  {savedAt > 0 && Date.now() - savedAt < 4000 && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-blue-400 font-mono text-[11px] font-bold uppercase flex items-center gap-2"
                    >
                      <Check size={14} />
                      Saved
                    </motion.div>
                  )}
                </div>

                <motion.button
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void handleSaveProfile()}
                  disabled={isSaving || !name.trim() || name.trim() === user?.name}
                  className="iz-btn-blue relative overflow-hidden py-3 px-8 rounded-xl text-white font-bold text-sm transition-all shadow-[0_15px_30px_-10px_rgba(59,130,246,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving && <Loader2 size={14} className="animate-spin" />}
                  Save Changes
                </motion.button>
              </div>
            </motion.div>

            {/* ── Danger Zone ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
              className="p-8 rounded-[24px] border border-red-500/20 bg-red-500/5 backdrop-blur-3xl shadow-[0_30px_60px_-20px_rgba(239,68,68,0.15)]"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <h3 className="text-red-500 font-bold text-lg flex items-center gap-2">
                    <ShieldAlert size={18} />
                    Delete Account
                  </h3>
                  <p className="text-zinc-500 text-sm max-w-sm">
                    Permanently deletes your account, all {user?.projectCount ?? 0} project
                    {user?.projectCount === 1 ? '' : 's'} and every simulation report. This cannot be undone.
                  </p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true); }}
                  className="py-3 px-8 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-sm hover:bg-red-500/20 transition-all whitespace-nowrap"
                >
                  Delete Account
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="relative w-full max-w-md p-10 rounded-[32px] border border-red-500/30 bg-zinc-900 shadow-[0_50px_100px_-20px_rgba(239,68,68,0.3)] overflow-hidden"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-red-500/50" />
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500">
                <Trash2 size={32} />
              </div>
              <h2 className="text-white text-2xl font-bold mb-4 tracking-tight text-center">Delete your account</h2>
              <p className="text-zinc-400 mb-6 leading-relaxed text-sm text-center">
                This removes your account, your projects and every report. It cannot be undone.
              </p>

              <label className="block text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2">
                Type <span className="text-white">{user?.name}</span> to confirm
              </label>
              <input
                autoFocus
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white font-medium focus:outline-none focus:border-red-500/60 transition-all mb-6"
              />

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => void handleDeleteAccount()}
                  disabled={!deleteArmed || isDeleting}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting && <Loader2 size={16} className="animate-spin" />}
                  Delete my account permanently
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-3 text-zinc-500 font-medium hover:text-white transition-colors"
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
