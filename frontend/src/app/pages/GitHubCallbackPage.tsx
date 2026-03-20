import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { authFetch, saveSession } from '../../lib/auth';

export default function GitHubCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) { navigate('/auth'); return; }

    authFetch('/api/auth/github', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`GitHub login failed: ${r.status}`);
        }
        return r.json();
      })
      .then(data => {
        if (data.token) {
          saveSession(data.token, data.user);
          navigate('/dashboard');
        } else {
          navigate('/auth');
        }
      })
      .catch(() => navigate('/auth'));
  }, []);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono text-sm">
      Authenticating with GitHub...
    </div>
  );
}
