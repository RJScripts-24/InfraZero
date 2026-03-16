// backend/src/config/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Shared Supabase client singleton.
 * Uses the Service Role Key which bypasses Row Level Security (RLS).
 * This is strictly for backend administrative tasks (webhook user sync, 
 * token verification, etc.) — never expose this key to the frontend.
 */
export const supabase: SupabaseClient = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
);
