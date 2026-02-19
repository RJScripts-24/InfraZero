// backend/src/middlewares/signatureVerifier.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Middleware to verify the cryptographic signature of incoming webhooks.
 * Ensures that the webhook (e.g., from Supabase or Clerk) is genuinely 
 * from your authentication provider and not a forged request from an attacker.
 * * NOTE: For this to work correctly, your Express route MUST parse the request 
 * body as raw JSON (e.g., using express.raw({ type: 'application/json' })) 
 * before this middleware runs.
 */
export const verifyWebhookSignature = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        // 1. Extract the signature from the headers. 
        // Supabase usually sends 'x-supabase-signature', Clerk uses 'svix-signature'.
        const signatureHeader = req.headers['x-supabase-signature'] || req.headers['webhook-signature'];

        if (!signatureHeader || typeof signatureHeader !== 'string') {
            logger.warn(`[Webhook Blocked] Missing signature header from IP: ${req.ip}`);
            res.status(401).json({ success: false, error: 'Unauthorized: Missing webhook signature.' });
            return;
        }

        // 2. Get the raw payload
        // If you used express.raw(), req.body is a Buffer. If express.json() was used 
        // and you appended rawBody, use that. Here we assume req.body is stringified or raw.
        const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

        // 3. Compute the expected HMAC signature using your secret
        const expectedSignature = crypto
            .createHmac('sha256', env.WEBHOOK_SECRET)
            .update(payload)
            .digest('hex');

        // 4. Compare the signatures securely to prevent timing attacks
        const isMatch = crypto.timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(signatureHeader)
        );

        if (!isMatch) {
            logger.warn(`[Webhook Blocked] Invalid signature from IP: ${req.ip}`);
            res.status(401).json({ success: false, error: 'Unauthorized: Invalid webhook signature.' });
            return;
        }

        // Signature is valid, proceed to the controller
        next();
    } catch (error) {
        logger.error(`[Signature Verifier Error] ${error instanceof Error ? error.message : String(error)}`);
        res.status(500).json({ success: false, error: 'Internal server error during signature verification.' });
    }
};