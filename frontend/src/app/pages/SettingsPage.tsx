import { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, ArrowLeft } from 'lucide-react';
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
    <div className="min-h-screen" style={{ backgroundColor: '#020908', fontFamily: 'Inter, sans-serif' }}>
      {/* Vertical Grid Overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to right, rgba(0,255,170,0.06) 0px, rgba(0,255,170,0.06) 1px, transparent 1px, transparent 80px)',
          backgroundSize: '80px 100%',
        }}
      />

      {/* Content */}
      <div className="relative z-10" style={{ maxWidth: '820px', margin: '0 auto', padding: '80px 40px' }}>
        {/* Back Button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 mb-8 transition-colors"
          style={{ color: '#8FA9A3', fontSize: '14px' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#00FFA3')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8FA9A3')}
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'linear' }}
          className="mb-8"
        >
          <h1 style={{ color: '#E6F1EF', fontSize: '36px', fontWeight: 700, marginBottom: '8px' }}>
            Settings
          </h1>
          <p style={{ color: '#8FA9A3', fontSize: '15px', marginBottom: '24px' }}>
            Manage your profile, simulation preferences, and local storage.
          </p>
          <div style={{ height: '1px', backgroundColor: 'rgba(0,255,170,0.2)' }} />
        </motion.div>

        {/* Section 1 - Profile */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'linear', delay: 0.1 }}
          className="mb-8 border p-6"
          style={{
            backgroundColor: '#040F0E',
            borderColor: 'rgba(0,255,170,0.2)',
            borderRadius: '4px',
          }}
        >
          <div
            className="mb-6"
            style={{
              color: '#00FFA3',
              fontSize: '13px',
              fontFamily: 'JetBrains Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            PROFILE
          </div>

          {/* Name Field */}
          <div className="mb-6">
            <label
              className="block mb-2"
              style={{ color: '#8FA9A3', fontSize: '13px', fontWeight: 500 }}
            >
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-4 py-3 border transition-colors outline-none"
              style={{
                backgroundColor: '#020908',
                borderColor: 'rgba(0,255,170,0.25)',
                color: '#E6F1EF',
                borderRadius: '2px',
                fontSize: '14px',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#00FFA3')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,170,0.25)')}
            />
          </div>

          {/* Email Field */}
          <div className="mb-6">
            <label
              className="block mb-2"
              style={{ color: '#8FA9A3', fontSize: '13px', fontWeight: 500 }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border transition-colors outline-none"
              style={{
                backgroundColor: '#020908',
                borderColor: 'rgba(0,255,170,0.25)',
                color: '#E6F1EF',
                borderRadius: '2px',
                fontSize: '14px',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#00FFA3')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,170,0.25)')}
            />
            <div
              className="flex items-center gap-2 mt-2"
              style={{
                color: '#8FA9A3',
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <Lock size={12} style={{ color: 'rgba(0,255,170,0.5)' }} />
              Authenticated via OAuth (GitHub/Google)
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-4">
            {showSaveConfirm && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  color: '#00FFA3',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                [PROFILE] Changes saved locally
              </motion.div>
            )}
            <button
              onClick={handleSaveProfile}
              className="flex items-center gap-2 px-5 py-3 transition-all"
              style={{
                backgroundColor: '#00FFA3',
                color: '#020908',
                borderRadius: '2px',
                fontSize: '13px',
                fontWeight: 600,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#00D98C')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00FFA3')}
            >
              SAVE PROFILE
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  opacity: 0.8,
                }}
              >
                UPDATE
              </span>
            </button>
          </div>
        </motion.div>

        {/* Section 2 - Preferences */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'linear', delay: 0.2 }}
          className="mb-8 border p-6"
          style={{
            backgroundColor: '#040F0E',
            borderColor: 'rgba(0,255,170,0.2)',
            borderRadius: '4px',
          }}
        >
          <div
            className="mb-6"
            style={{
              color: '#00FFA3',
              fontSize: '13px',
              fontFamily: 'JetBrains Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            PREFERENCES
          </div>

          {/* Theme Toggle */}
          <div className="mb-6">
            <label
              className="block mb-3"
              style={{ color: '#8FA9A3', fontSize: '13px', fontWeight: 500 }}
            >
              Theme
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('dark')}
                className="px-6 py-2 border transition-all"
                style={{
                  backgroundColor: theme === 'dark' ? '#00FFA3' : 'transparent',
                  borderColor: theme === 'dark' ? '#00FFA3' : 'rgba(0,255,170,0.3)',
                  color: theme === 'dark' ? '#020908' : '#8FA9A3',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className="px-6 py-2 border transition-all"
                style={{
                  backgroundColor: theme === 'light' ? '#00FFA3' : 'transparent',
                  borderColor: theme === 'light' ? '#00FFA3' : 'rgba(0,255,170,0.3)',
                  color: theme === 'light' ? '#020908' : '#8FA9A3',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Light
              </button>
            </div>
          </div>

          {/* Vim Mode Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <label
                className="block mb-1"
                style={{ color: '#E6F1EF', fontSize: '14px', fontWeight: 500 }}
              >
                Enable Vim Mode
              </label>
              <p style={{ color: '#8FA9A3', fontSize: '13px' }}>
                Use vim-style keybindings in canvas and editor.
              </p>
              {vimMode && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2"
                  style={{
                    color: '#00FFA3',
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  [VIM MODE ACTIVE]
                </motion.div>
              )}
            </div>
            <button
              onClick={() => setVimMode(!vimMode)}
              className="relative border transition-all"
              style={{
                width: '48px',
                height: '24px',
                borderColor: 'rgba(0,255,170,0.3)',
                borderRadius: '12px',
                backgroundColor: '#020908',
              }}
            >
              <motion.div
                animate={{ x: vimMode ? 24 : 0 }}
                transition={{ duration: 0.2, ease: 'linear' }}
                style={{
                  position: 'absolute',
                  left: '2px',
                  top: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: vimMode ? '#00FFA3' : '#8FA9A3',
                }}
              />
            </button>
          </div>
        </motion.div>

        {/* Section 3 - Local Storage Status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'linear', delay: 0.3 }}
          className="mb-8 border p-6"
          style={{
            backgroundColor: '#040F0E',
            borderColor: 'rgba(0,255,170,0.2)',
            borderRadius: '4px',
          }}
        >
          <div
            className="mb-6"
            style={{
              color: '#00FFA3',
              fontSize: '13px',
              fontFamily: 'JetBrains Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            LOCAL DATA MANAGEMENT
          </div>

          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '13px',
              lineHeight: '2',
            }}
          >
            <div className="flex">
              <span style={{ color: '#8FA9A3', width: '200px' }}>IndexedDB Usage:</span>
              <span style={{ color: '#00FFA3' }}>18.4 MB</span>
            </div>
            <div className="flex">
              <span style={{ color: '#8FA9A3', width: '200px' }}>Projects Stored:</span>
              <span style={{ color: '#00FFA3' }}>7</span>
            </div>
            <div className="flex">
              <span style={{ color: '#8FA9A3', width: '200px' }}>Last Sync:</span>
              <span style={{ color: '#00FFA3' }}>2 mins ago</span>
            </div>
            <div className="flex">
              <span style={{ color: '#8FA9A3', width: '200px' }}>Local-First Mode:</span>
              <span style={{ color: '#00FFA3' }}>ACTIVE</span>
            </div>
          </div>
        </motion.div>

        {/* Section 4 - Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'linear', delay: 0.4 }}
          className="mb-8 border p-6"
          style={{
            backgroundColor: '#081F1D',
            borderColor: '#FF3B3B',
            borderRadius: '4px',
          }}
        >
          <div
            className="mb-3"
            style={{
              color: '#FF3B3B',
              fontSize: '13px',
              fontFamily: 'JetBrains Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            DANGER ZONE
          </div>
          <p style={{ color: '#8FA9A3', fontSize: '13px', marginBottom: '24px' }}>
            Destructive actions affecting local simulation data.
          </p>

          {/* Clear Local Storage */}
          <div>
            <p style={{ color: '#E6F1EF', fontSize: '14px', marginBottom: '16px' }}>
              Clear all IndexedDB data and remove local simulation history.
            </p>

            {showClearedMessage && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4"
                style={{
                  color: '#00FFA3',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                [LOCAL STORAGE CLEARED]
              </motion.div>
            )}

            <button
              onClick={handleClearStorage}
              className="border px-5 py-3 transition-all"
              style={{
                backgroundColor: 'transparent',
                borderColor: '#FF3B3B',
                color: '#FF3B3B',
                borderRadius: '2px',
                fontSize: '13px',
                fontWeight: 600,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FF3B3B';
                e.currentTarget.style.color = '#020908';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#FF3B3B';
              }}
            >
              CLEAR LOCAL STORAGE
            </button>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: 'linear', delay: 0.5 }}
          style={{
            color: '#8FA9A3',
            fontSize: '12px',
            fontFamily: 'JetBrains Mono, monospace',
            textAlign: 'center',
            paddingTop: '40px',
          }}
        >
          <div>InfraZero v0.9 Beta</div>
          <div>Client-Side Simulation Engine</div>
          <div>Local-First Architecture</div>
        </motion.div>
      </div>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(2, 9, 8, 0.95)' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: 'linear' }}
            className="border p-8"
            style={{
              backgroundColor: '#040F0E',
              borderColor: '#FF3B3B',
              borderRadius: '4px',
              maxWidth: '480px',
            }}
          >
            <h2
              style={{
                color: '#E6F1EF',
                fontSize: '24px',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              Confirm Data Wipe
            </h2>
            <p style={{ color: '#8FA9A3', fontSize: '15px', marginBottom: '32px' }}>
              This will permanently delete all locally stored architectures and simulation logs.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="border px-5 py-3 transition-all"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'rgba(0,255,170,0.3)',
                  color: '#00FFA3',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#071512')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Cancel
              </button>
              <button
                onClick={confirmClearStorage}
                className="border px-5 py-3 transition-all"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: '#FF3B3B',
                  color: '#FF3B3B',
                  borderRadius: '2px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FF3B3B';
                  e.currentTarget.style.color = '#020908';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#FF3B3B';
                }}
              >
                Confirm Wipe
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
