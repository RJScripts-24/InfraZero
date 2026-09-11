import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GitBranch, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { authFetch } from '../../lib/auth';

/**
 * Build the architecture from a repository's own deployment manifests.
 *
 * Every other route into this product grades a drawing, and a drawing has two
 * problems: somebody has to make it, and it starts going stale the moment they
 * do. A repository already contains a precise, current description of the
 * architecture. Reading it directly removes the transcription step, and
 * recovers something a diagram almost never records -- `spec.replicas`, which is
 * what separates "this gateway is a single point of failure" from "this gateway
 * is a three-instance tier".
 */

interface ImportRepoPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (nodes: any[], edges: any[]) => void;
}

interface ImportSummary {
  source: string;
  kind: string;
  components: number;
  links: number;
  replicasRecovered: number;
}

export function ImportRepoPopup({ isOpen, onClose, onImport }: ImportRepoPopupProps) {
  const [repository, setRepository] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ nodes: any[]; edges: any[]; summary: ImportSummary } | null>(null);

  const reset = () => {
    setRepository('');
    setError(null);
    setResult(null);
    setIsImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleImport = async () => {
    const trimmed = repository.trim();
    if (!trimmed) return;

    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const response = await authFetch('/api/projects/import-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository: trimmed }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error || 'Could not read that repository.');
        return;
      }
      setResult(payload);
    } catch {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setIsImporting(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    onImport(result.nodes, result.edges);
    handleClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl rounded-[28px] border border-white/10 bg-zinc-900/95 backdrop-blur-2xl p-8"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-white text-xl font-bold tracking-tight mb-1">Import from repository</h2>
                <p className="text-zinc-500 text-sm leading-relaxed max-w-md">
                  Reads the architecture from your Kubernetes manifests or compose file, including how
                  many instances each component runs.
                </p>
              </div>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="text-zinc-500 hover:text-white transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            <label className="block text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">
              GitHub repository
            </label>
            <div className="flex gap-3">
              <div className="flex-1 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3.5">
                <GitBranch size={16} className="text-zinc-600 shrink-0" />
                <input
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') handleImport(); }}
                  placeholder="owner/repo"
                  disabled={isImporting}
                  className="flex-1 bg-transparent text-white text-sm placeholder:text-zinc-700 outline-none"
                />
              </div>
              <button
                onClick={handleImport}
                disabled={isImporting || !repository.trim()}
                className="px-6 rounded-2xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : 'Read'}
              </button>
            </div>

            {error && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-4">
                <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-zinc-400 text-[13px] leading-relaxed">{error}</p>
              </div>
            )}

            {result && (
              <div className="mt-5">
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 mb-4">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1 text-emerald-400">
                      Read from {result.summary.kind === 'kubernetes' ? 'Kubernetes manifests' : 'docker-compose'}
                    </div>
                    <p className="text-zinc-400 text-[13px] leading-relaxed">
                      {result.summary.components} components, {result.summary.links} links.{' '}
                      {result.summary.replicasRecovered > 0
                        ? `${result.summary.replicasRecovered} instance counts came from the manifests, so redundancy is analysed from what you actually deploy.`
                        : 'No instance counts were declared, so every component is analysed as a single instance — the conservative reading.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleApply}
                  className="w-full py-4 rounded-2xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all"
                >
                  Replace canvas with this architecture
                </button>
                <p className="text-zinc-600 text-[11px] text-center mt-3">
                  This replaces what is currently on the canvas.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
