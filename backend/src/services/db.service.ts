// backend/src/services/db.service.ts
import { dbPool } from '../config/database';
import { logger } from '../utils/logger';

export interface UserData {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

/**
 * Upserts a user into the Postgres database.
 * Called by the authentication webhook when a user signs up or updates their profile.
 */
export const syncUserToDatabase = async (userData: UserData): Promise<void> => {
  try {
    await dbPool.query(
      `
        INSERT INTO users (id, email, name, avatar_url, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          avatar_url = EXCLUDED.avatar_url,
          updated_at = NOW()
      `,
      [userData.id, userData.email ?? null, userData.name ?? null, userData.avatar_url ?? null]
    );
  } catch (error) {
    logger.error(`[DB Service] Failed to sync user ${userData.id}: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Re-throw so the webhook controller can catch it and return a 500
  }
};

/**
 * Deletes a user and cascades the deletion to their projects.
 * Called by the authentication webhook when a user deletes their account.
 */
export const deleteUserFromDatabase = async (userId: string): Promise<void> => {
  try {
    await dbPool.query('DELETE FROM users WHERE id = $1', [userId]);
  } catch (error) {
    logger.error(`[DB Service] Failed to delete user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};