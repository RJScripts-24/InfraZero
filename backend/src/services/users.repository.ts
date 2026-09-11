// backend/src/services/users.repository.ts
import { dbPool } from '../config/database';
import { AuthProvider } from '../types/auth';

export interface PersistedUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  provider: string | null;
  createdAt: string;
}

interface UpsertUserInput {
  id: string;
  provider: AuthProvider;
  providerUserId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

const mapUser = (row: Record<string, unknown>): PersistedUser => ({
  id: String(row.id),
  email: (row.email as string) ?? null,
  name: (row.name as string) ?? null,
  avatarUrl: (row.avatar_url as string) ?? null,
  provider: (row.provider as string) ?? null,
  createdAt: new Date(row.created_at as string).toISOString(),
});

/**
 * Creates the user on first login and refreshes their profile on every
 * subsequent one.
 *
 * `id` is derived deterministically from (provider, providerUserId) upstream, so
 * the same provider account always lands on the same row. COALESCE keeps a
 * previously-known email/avatar when the provider omits it from a later login
 * rather than blanking the column.
 */
export const upsertUser = async (input: UpsertUserInput): Promise<PersistedUser> => {
  const { rows } = await dbPool.query(
    `
      INSERT INTO public.users (id, email, name, avatar_url, provider, provider_user_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        email      = COALESCE(EXCLUDED.email, public.users.email),
        name       = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        provider   = EXCLUDED.provider,
        provider_user_id = EXCLUDED.provider_user_id,
        updated_at = NOW()
      RETURNING *
    `,
    [
      input.id,
      input.email ?? null,
      input.name ?? null,
      input.avatarUrl ?? null,
      input.provider,
      input.providerUserId,
    ],
  );

  return mapUser(rows[0]);
};

export const getUserById = async (userId: string): Promise<PersistedUser | null> => {
  const { rows } = await dbPool.query('SELECT * FROM public.users WHERE id = $1', [userId]);
  return rows[0] ? mapUser(rows[0]) : null;
};

export const updateUserName = async (userId: string, name: string): Promise<PersistedUser | null> => {
  const { rows } = await dbPool.query(
    'UPDATE public.users SET name = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
    [userId, name],
  );
  return rows[0] ? mapUser(rows[0]) : null;
};

/**
 * Deletes the account. Projects, simulations and GhostTrace analyses all carry
 * ON DELETE CASCADE back to users, so this removes every trace of them.
 */
export const deleteUser = async (userId: string): Promise<boolean> => {
  const { rowCount } = await dbPool.query('DELETE FROM public.users WHERE id = $1', [userId]);
  return (rowCount ?? 0) > 0;
};

export const countUserProjects = async (userId: string): Promise<number> => {
  const { rows } = await dbPool.query(
    'SELECT COUNT(*)::int AS count FROM public.projects WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.count ?? 0;
};
