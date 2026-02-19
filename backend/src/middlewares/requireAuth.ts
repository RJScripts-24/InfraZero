// backend/src/middlewares/requireAuth.ts
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Initialize the Supabase client to verify tokens
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Authentication Middleware
 * Protects routes by requiring a valid Supabase JWT in the Authorization header.
 */
export const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // 1. Extract the token from the header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized: Missing or invalid Authorization header.'
            });
            return;
        }

        const token = authHeader.split(' ')[1];

        // 2. Ask Supabase to verify the token and return the user
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            logger.warn(`[Auth Blocked] Invalid token attempt. Reason: ${error?.message}`);
            res.status(401).json({
                success: false,
                error: 'Unauthorized: Invalid or expired token.'
            });
            return;
        }

        // 3. Attach the authenticated user to the request object 
        // so your controllers (like ai.controller.ts) know exactly who is making the request.
        // (Using 'as any' here for quick integration, though extending Express.Request in types is best practice)
        (req as any).user = user;

        // 4. Token is valid, proceed to the next middleware/controller
        next();

    } catch (error) {
        logger.error(`[Auth Middleware Error] ${error instanceof Error ? error.message : String(error)}`);

        res.status(500).json({
            success: false,
            error: 'Internal server error during authentication.'
        });
    }
};