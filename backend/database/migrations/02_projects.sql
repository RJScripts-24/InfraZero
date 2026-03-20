-- backend/database/migrations/02_projects.sql

-- 1. Ensure UUID generator is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  
  -- The core of the InfraZero architecture state.
  -- This JSONB column holds the complete GraphTopology (nodes and edges), 
  -- as well as the Stable Hash and Universe Seed required for the WASM engine's 
  -- deterministic simulation replay.
  graph_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_projects_graph_data ON public.projects USING GIN (graph_data);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);