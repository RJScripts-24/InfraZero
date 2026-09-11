-- backend/database/migrations/05_simulations.sql
--
-- Simulation runs and their reports. Previously held in an in-memory Map, so a
-- report could not be reopened after a restart and could not be exported later.

CREATE TABLE IF NOT EXISTS public.simulations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  graph_hash TEXT NOT NULL,
  universe_seed TEXT NOT NULL,
  grade TEXT NOT NULL,
  grade_score INTEGER,
  status TEXT NOT NULL,

  total_requests BIGINT NOT NULL DEFAULT 0,
  failed_requests BIGINT NOT NULL DEFAULT 0,
  peak_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,

  -- Full report payload: latency series, root cause, recommendations, the
  -- GhostTrace block, and the graph the run was made against. Stored whole so a
  -- report renders and exports identically months later, even if the project
  -- graph has since been edited.
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulations_project ON public.simulations (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulations_user ON public.simulations (user_id);
