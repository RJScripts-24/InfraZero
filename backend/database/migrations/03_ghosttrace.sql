-- backend/database/migrations/03_ghosttrace.sql

CREATE TABLE IF NOT EXISTS public.ghosttrace_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  graph_hash TEXT NOT NULL,
  overall_risk FLOAT NOT NULL,
  predicted_anomaly_class TEXT NOT NULL,
  edge_risks JSONB NOT NULL DEFAULT '[]',
  node_risks JSONB NOT NULL DEFAULT '[]',
  synthetic_spans JSONB NOT NULL DEFAULT '[]',
  topology_embedding JSONB NOT NULL DEFAULT '[]',
  analysis_narrative TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghosttrace_project ON public.ghosttrace_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_ghosttrace_user ON public.ghosttrace_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_ghosttrace_hash ON public.ghosttrace_analyses(graph_hash);
