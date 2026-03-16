-- backend/database/migrations/02_projects.sql

-- 1. Create the public projects table
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

-- 2. Performance Indexing for JSONB
-- Because graph_data contains the entire topology payload, a GIN index allows 
-- for blazing-fast queries if you ever need to search for specific node types 
-- or architectures across a massive dataset.
CREATE INDEX IF NOT EXISTS idx_projects_graph_data ON public.projects USING GIN (graph_data);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);

-- 3. Enable Row Level Security (RLS)
-- Locks down the table so queries from the frontend can only access authorized rows.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 4. Define RLS Policies
-- Crucial for populating the Dashboard page so users only see their own architectures.
CREATE POLICY "Users can view own projects" 
  ON public.projects 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Allows the frontend to save a newly generated AI architecture
CREATE POLICY "Users can create own projects" 
  ON public.projects 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Allows the frontend to auto-save changes made on the React Flow canvas
CREATE POLICY "Users can update own projects" 
  ON public.projects 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Allows users to manage their Dashboard by deleting old projects
CREATE POLICY "Users can delete own projects" 
  ON public.projects 
  FOR DELETE 
  USING (auth.uid() = user_id);