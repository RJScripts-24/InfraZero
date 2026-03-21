-- backend/database/migrations/04_breachroom.sql

CREATE TABLE IF NOT EXISTS public.breachroom_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ghosttrace_id UUID REFERENCES public.ghosttrace_analyses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  incident_title TEXT NOT NULL,
  incident_source TEXT NOT NULL,
  incident_start_time BIGINT NOT NULL,
  incident_end_time BIGINT NOT NULL,
  incident_events JSONB NOT NULL DEFAULT '[]',
  recall_score FLOAT,
  precision_score FLOAT,
  f1_score FLOAT,
  revision_suggestions JSONB NOT NULL DEFAULT '[]',
  analysis_narrative TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breachroom_ghosttrace ON public.breachroom_analyses(ghosttrace_id);
CREATE INDEX IF NOT EXISTS idx_breachroom_user ON public.breachroom_analyses(user_id);
