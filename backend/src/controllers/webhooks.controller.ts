// backend/src/controllers/webhooks.controller.ts
import { Request, Response, NextFunction } from 'express';
import { syncUserToDatabase, deleteUserFromDatabase } from '../services/db.service';
import { logger } from '../utils/logger';

/**
 * Controller for handling Authentication Webhooks (from Clerk or Supabase).
 * Route: POST /api/webhooks/auth
 * * Note: This route must be protected by the `signatureVerifier` middleware 
 * in your routes file to ensure the request is genuinely from your Auth provider.
 */
export const handleAuthWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // The exact payload structure depends on if you use Clerk or Supabase Auth.
        // This handles a standard webhook event envelope.
        const eventType = req.body.type; // e.g., 'user.created', 'user.updated', 'user.deleted'
        const eventData = req.body.data;

        if (!eventType || !eventData) {
            res.status(400).json({ success: false, error: 'Malformed webhook payload.' });
            return;
        }

        logger.info(`[Auth Webhook] Processing event: ${eventType} for user: ${eventData.id}`);

        switch (eventType) {
            case 'user.created':
            case 'user.updated':
                // Extract OAuth details (Google/GitHub) from the payload
                const userData = {
                    id: eventData.id,
                    // Handle both Clerk and Supabase payload styles
                    email: eventData.email_addresses?.[0]?.email_address || eventData.email,
                    name: `${eventData.first_name || ''} ${eventData.last_name || ''}`.trim() || eventData.name || eventData.full_name,
                    avatar_url: eventData.image_url || eventData.avatar_url,
                };

                // Upsert the user into your Supabase database via the db service
                await syncUserToDatabase(userData);
                logger.info(`[Auth Webhook] Successfully synced user: ${userData.id}`);
                break;

            case 'user.deleted':
                // Remove the user and cascade delete their architecture projects
                await deleteUserFromDatabase(eventData.id);
                logger.info(`[Auth Webhook] Successfully deleted user: ${eventData.id}`);
                break;

            default:
                logger.warn(`[Auth Webhook] Unhandled event type ignored: ${eventType}`);
                break;
        }

        // Always return a 200 OK quickly. If you don't, the auth provider (Clerk/Supabase) 
        // will think the webhook failed and keep retrying it automatically.
        res.status(200).json({ success: true, message: 'Webhook processed successfully.' });

    } catch (error) {
        logger.error(`[Auth Webhook Error] ${error instanceof Error ? error.message : String(error)}`);

        // Passing this to the errorHandler middleware will return a 500 status.
        // The Auth provider will catch this 500 and queue a retry later.
        next(error);
    }
};