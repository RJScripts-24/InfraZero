-- backend/database/migrations/01_users.sql

-- 1. Create the public users table
-- We map the 'id' directly to Supabase's internal auth.users table.
-- The ON DELETE CASCADE ensures that if a user deletes their account from 
-- the Auth portal, their public profile is automatically scrubbed to comply with data privacy.
CREATE TABLE IF NOT EXISTS public.users (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  
  PRIMARY KEY (id)
);

-- 2. Enable Row Level Security (RLS)
-- This is a critical security measure in Supabase. By default, enabling RLS 
-- blocks ALL frontend access to this table unless a specific policy allows it.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. Define RLS Policies
-- Allow users to read only their own profile data.
CREATE POLICY "Users can view own profile" 
  ON public.users 
  FOR SELECT 
  USING (auth.uid() = id);

-- Allow users to update their own profile data (e.g., changing their display name).
CREATE POLICY "Users can update own profile" 
  ON public.users 
  FOR UPDATE 
  USING (auth.uid() = id);

-- NOTE: You do not need an INSERT policy for the frontend. 
-- Why? Because in db.service.ts, we used the Supabase Service Role Key inside 
-- your webhook controller. The Service Role natively bypasses RLS, allowing your 
-- secure backend to insert the user automatically upon signup!