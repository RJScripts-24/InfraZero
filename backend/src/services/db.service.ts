// backend/src/services/db.service.ts
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export interface UserData {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

/**
 * Upserts a user into the Supabase database.
 * Called by the authentication webhook when a user signs up or updates their profile.
 */
export const syncUserToDatabase = async (userData: UserData): Promise<void> => {
  try {
    const { error } = await supabase
      .from('users')
      .upsert({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        avatar_url: userData.avatar_url,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id' // If the user ID already exists, update their record
      });

    if (error) {
      throw new Error(`Supabase Upsert Error: ${error.message}`);
    }
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
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      throw new Error(`Supabase Delete Error: ${error.message}`);
    }
  } catch (error) {
    logger.error(`[DB Service] Failed to delete user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};