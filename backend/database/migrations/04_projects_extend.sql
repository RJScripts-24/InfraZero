-- backend/database/migrations/04_projects_extend.sql
--
-- Brings `users` and `projects` up to what the app actually needs:
--   * users gain the OAuth provider identity they are looked up by
--   * projects gain the dashboard's status/grade columns and a share token,
--     all of which previously lived only in an in-memory Map and were lost on
--     every backend restart.

-- --------------------------------------------------------------------------
-- users: OAuth identity
-- --------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS provider_user_id TEXT;

-- A provider account maps to exactly one row. `id` is derived deterministically
-- from (provider, provider_user_id) by authToken.service.stableUserId, so this
-- index is a consistency guard rather than the lookup path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity
  ON public.users (provider, provider_user_id)
  WHERE provider IS NOT NULL AND provider_user_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- projects: dashboard state + collaboration
-- --------------------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Draft';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN NOT NULL DEFAULT FALSE;

-- Opaque, unguessable token used in collaboration invite links. Nullable: a
-- project has no token until the owner actually shares it.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_share_token
  ON public.projects (share_token)
  WHERE share_token IS NOT NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS, so guard it to keep this file re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_status_check
      CHECK (status IN ('Draft', 'Graded', 'Failure'));
  END IF;
END $$;
