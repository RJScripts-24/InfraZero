import { motion } from 'motion/react';
import { Github, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function AuthPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex" style={{ 
      backgroundColor: '#020908',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Vertical Grid Lines Overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(to right, rgba(0,255,170,0.06) 0px, rgba(0,255,170,0.06) 1px, transparent 1px, transparent 80px)',
        backgroundSize: '80px 100%'
      }} />

      {/* Left Panel - Branding & Technical Context */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'linear' }}
        className="hidden lg:flex lg:w-[55%] relative flex-col justify-between"
        style={{ 
          backgroundColor: '#040F0E',
          padding: 'clamp(48px, 4vw, 80px)'
        }}
      >
        {/* Logo */}
        <div className="flex items-center" style={{ gap: 'clamp(8px, 0.7vw, 12px)' }}>
          <span style={{ 
            color: '#E6F1EF',
            fontSize: 'clamp(24px, 1.8vw, 36px)',
            fontWeight: 500
          }}>
            InfraZero
          </span>
          <div style={{ 
            width: 'clamp(6px, 0.5vw, 8px)',
            height: 'clamp(6px, 0.5vw, 8px)',
            backgroundColor: '#00FFA3',
            borderRadius: '50%'
          }} />
        </div>

        {/* Main Visual - Abstract System Blueprint */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="relative" style={{ 
            width: '100%',
            maxWidth: '600px',
            height: 'clamp(400px, 35vw, 500px)'
          }}>
            <svg className="w-full h-full" viewBox="0 0 600 500" preserveAspectRatio="xMidYMid meet">
              {/* Edges */}
              <line x1="150" y1="100" x2="300" y2="180" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
              <line x1="450" y1="100" x2="300" y2="180" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
              <line x1="300" y1="180" x2="200" y2="320" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
              <line x1="300" y1="180" x2="400" y2="320" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
              <line x1="200" y1="320" x2="300" y2="400" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />
              <line x1="400" y1="320" x2="300" y2="400" stroke="rgba(0,255,170,0.3)" strokeWidth="2" />

              {/* Animated pulse along edges */}
              <motion.circle
                r="4"
                fill="#00FFA3"
                animate={{
                  offsetDistance: ['0%', '100%'],
                  opacity: [0.8, 0.3, 0.8]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'linear'
                }}
              >
                <animateMotion dur="4s" repeatCount="indefinite">
                  <mpath href="#path1" />
                </animateMotion>
              </motion.circle>
              <path id="path1" d="M 150 100 L 300 180 L 200 320 L 300 400" fill="none" />

              <motion.circle
                r="4"
                fill="#00FFA3"
                animate={{
                  opacity: [0.8, 0.3, 0.8]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'linear',
                  delay: 2
                }}
              >
                <animateMotion dur="4s" repeatCount="indefinite">
                  <mpath href="#path2" />
                </animateMotion>
              </motion.circle>
              <path id="path2" d="M 450 100 L 300 180 L 400 320 L 300 400" fill="none" />

              {/* Nodes */}
              <g>
                <rect x="110" y="70" width="80" height="60" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                <text x="150" y="105" textAnchor="middle" fill="#E6F1EF" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  Frontend
                </text>
              </g>

              <g>
                <rect x="410" y="70" width="80" height="60" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                <text x="450" y="105" textAnchor="middle" fill="#E6F1EF" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  Auth
                </text>
              </g>

              <g>
                <rect x="260" y="150" width="80" height="60" fill="#040F0E" stroke="#00FFA3" strokeWidth="2" />
                <text x="300" y="185" textAnchor="middle" fill="#00FFA3" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  API
                </text>
              </g>

              <g>
                <rect x="160" y="290" width="80" height="60" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                <text x="200" y="325" textAnchor="middle" fill="#E6F1EF" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  Database
                </text>
              </g>

              <g>
                <rect x="360" y="290" width="80" height="60" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                <text x="400" y="325" textAnchor="middle" fill="#E6F1EF" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  Cache
                </text>
              </g>

              <g>
                <rect x="260" y="370" width="80" height="60" fill="#040F0E" stroke="rgba(0,255,170,0.4)" strokeWidth="1" />
                <text x="300" y="405" textAnchor="middle" fill="#E6F1EF" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  Queue
                </text>
              </g>
            </svg>

            {/* Floating Log Snippets */}
            <motion.div
              className="absolute"
              style={{
                top: '15%',
                right: '10%',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 'clamp(9px, 0.7vw, 11px)',
                color: '#8FA9A3',
                opacity: 0.6
              }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              [SYNC] CRDT state merged
            </motion.div>

            <motion.div
              className="absolute"
              style={{
                bottom: '20%',
                left: '5%',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 'clamp(9px, 0.7vw, 11px)',
                color: '#8FA9A3',
                opacity: 0.6
              }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear', delay: 1.5 }}
            >
              [HASH] Stable SHA-256 verified
            </motion.div>
          </div>

          {/* Supporting Tagline */}
          <div className="mt-12 text-center" style={{ maxWidth: '500px' }}>
            <h2 className="mb-4" style={{ 
              color: '#E6F1EF',
              fontSize: 'clamp(28px, 2.2vw, 42px)',
              fontWeight: 600,
              lineHeight: 1.2
            }}>
              Your Architecture. Deterministic.
            </h2>
            <p style={{ 
              color: '#8FA9A3',
              fontSize: 'clamp(14px, 1.1vw, 18px)',
              lineHeight: 1.6
            }}>
              Sign in to save simulations, run chaos tests, and generate reproducible post-mortem reports.
            </p>
          </div>
        </div>

        {/* Bottom tech indicators */}
        <div style={{ 
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'clamp(9px, 0.7vw, 11px)',
          color: '#8FA9A3',
          letterSpacing: '0.05em'
        }}>
          <div>LOCAL-FIRST MODE</div>
          <div>AUTH: OAUTH 2.0</div>
          <div>ENCRYPTION: TLS 1.3</div>
        </div>
      </motion.div>

      {/* Divider */}
      <div style={{ 
        width: '1px',
        backgroundColor: 'rgba(0,255,170,0.15)'
      }} />

      {/* Right Panel - Authentication Form */}
      <motion.div 
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'linear', delay: 0.2 }}
        className="flex-1 flex items-center justify-center relative"
        style={{ 
          backgroundColor: '#020908',
          padding: 'clamp(24px, 3vw, 48px)'
        }}
      >
        <div style={{ width: '100%', maxWidth: '420px' }}>
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'linear', delay: 0.3 }}
            className="mb-8"
          >
            <h1 className="mb-3" style={{ 
              color: '#E6F1EF',
              fontSize: 'clamp(32px, 2.5vw, 48px)',
              fontWeight: 600,
              lineHeight: 1.1
            }}>
              Welcome to InfraZero.
            </h1>
            <p style={{ 
              color: '#8FA9A3',
              fontSize: 'clamp(14px, 1.1vw, 18px)',
              lineHeight: 1.5
            }}>
              Secure access to your distributed systems lab.
            </p>
          </motion.div>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-8">
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'linear', delay: 0.4 }}
              className="w-full flex items-center justify-center border transition-all"
              style={{
                backgroundColor: '#040F0E',
                borderColor: 'rgba(0,255,170,0.3)',
                padding: 'clamp(14px, 1.2vw, 18px)',
                borderRadius: '2px',
                gap: 'clamp(10px, 0.8vw, 14px)',
                color: '#E6F1EF',
                fontSize: 'clamp(14px, 1vw, 16px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#00FFA3';
                e.currentTarget.style.backgroundColor = '#071512';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)';
                e.currentTarget.style.backgroundColor = '#040F0E';
              }}
              onClick={() => {
                // Handle GitHub OAuth
                console.log('GitHub OAuth');
              }}
            >
              <Github style={{ width: 'clamp(18px, 1.4vw, 22px)', height: 'clamp(18px, 1.4vw, 22px)' }} />
              Continue with GitHub
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'linear', delay: 0.48 }}
              className="w-full flex items-center justify-center border transition-all"
              style={{
                backgroundColor: '#040F0E',
                borderColor: 'rgba(0,255,170,0.3)',
                padding: 'clamp(14px, 1.2vw, 18px)',
                borderRadius: '2px',
                gap: 'clamp(10px, 0.8vw, 14px)',
                color: '#E6F1EF',
                fontSize: 'clamp(14px, 1vw, 16px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#00FFA3';
                e.currentTarget.style.backgroundColor = '#071512';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,170,0.3)';
                e.currentTarget.style.backgroundColor = '#040F0E';
              }}
              onClick={() => {
                // Handle Google OAuth
                console.log('Google OAuth');
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

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'linear', delay: 0.56 }}
              className="w-full flex items-center justify-center border transition-all"
              style={{
                backgroundColor: 'transparent',
                borderColor: 'rgba(0,255,170,0.2)',
                padding: 'clamp(14px, 1.2vw, 18px)',
                borderRadius: '2px',
                gap: 'clamp(10px, 0.8vw, 14px)',
                color: '#8FA9A3',
                fontSize: 'clamp(14px, 1vw, 16px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,170,0.4)';
                e.currentTarget.style.color = '#E6F1EF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,255,170,0.2)';
                e.currentTarget.style.color = '#8FA9A3';
              }}
              onClick={() => {
                // Navigate to dashboard as guest
                navigate('/dashboard');
              }}
            >
              <UserCircle style={{ width: 'clamp(18px, 1.4vw, 22px)', height: 'clamp(18px, 1.4vw, 22px)' }} />
              Continue as Guest
            </motion.button>
          </div>

          {/* Security & Research Context */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'linear', delay: 0.56 }}
            className="border mb-6"
            style={{
              backgroundColor: '#040F0E',
              borderColor: 'rgba(0,255,170,0.2)',
              padding: 'clamp(16px, 1.4vw, 24px)',
              borderRadius: '2px'
            }}
          >
            <h3 className="mb-2" style={{
              color: '#00FFA3',
              fontSize: 'clamp(12px, 0.9vw, 14px)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              Security & Research Integrity
            </h3>
            <p style={{
              color: '#8FA9A3',
              fontSize: 'clamp(12px, 0.9vw, 14px)',
              lineHeight: 1.6
            }}>
              InfraZero runs simulations client-side. Your architecture data remains isolated. OAuth is used only for identity and project metadata.
            </p>
          </motion.div>

          {/* Footer Text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: 'linear', delay: 0.64 }}
            className="text-center"
            style={{
              color: '#8FA9A3',
              fontSize: 'clamp(11px, 0.85vw, 13px)'
            }}
          >
            By joining, you agree to our{' '}
            <a 
              href="#"
              className="transition-colors"
              style={{ color: '#00FFA3' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#00D98C'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#00FFA3'}
            >
              Research Terms
            </a>
            .
          </motion.div>
        </div>

        {/* Bottom-right tech indicator (mobile hidden) */}
        <div className="hidden lg:block absolute bottom-8 right-8" style={{ 
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'clamp(9px, 0.7vw, 11px)',
          color: '#8FA9A3',
          letterSpacing: '0.05em',
          textAlign: 'right'
        }}>
          <div>LOCAL-FIRST MODE</div>
          <div>AUTH: OAUTH 2.0</div>
          <div>ENCRYPTION: TLS 1.3</div>
        </div>
      </motion.div>
    </div>
  );
}