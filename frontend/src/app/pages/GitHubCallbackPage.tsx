import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { authFetch, saveSession } from '../../lib/auth';

export default function GitHubCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    // GitHub reports a denied consent screen this way rather than omitting the code.
    const oauthError = params.get('error_description') || params.get('error');
    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!code) {
      navigate('/auth');
      return;
    }

    authFetch('/api/auth/github', {
      method: 'POST',
      body: JSON.stringify({ code, redirectUri: `${window.location.origin}/auth/github/callback` }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || `GitHub sign-in failed (${response.status})`);
        }
        return body;
      })
      .then((data) => {
        if (!data?.token) {
          throw new Error('GitHub sign-in did not return a session.');
        }
        saveSession(data.token, data.user);
        navigate('/dashboard');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'GitHub sign-in failed.'));
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-3xl border border-red-500/25 bg-zinc-900/60 text-center">
          <h1 className="text-white text-xl font-bold mb-3">GitHub sign-in failed</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-8">{error}</p>
          <button
            onClick={() => navigate('/auth')}
            className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 transition-all"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono text-sm">
      Authenticating with GitHub...
    </div>
  );
}
