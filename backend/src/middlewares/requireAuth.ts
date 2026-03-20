// backend/src/middlewares/requireAuth.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { verifyAppToken } from '../services/authToken.service';
import { AuthenticatedRequest } from '../types/request';

/**
 * Authentication Middleware
 * Protects routes by requiring a valid app token in the Authorization header.
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

        // 2. Verify app-issued session tokens for guest and provider shortcut auth flows.
        const appUser = verifyAppToken(token);
        if (!appUser) {
            logger.warn('[Auth Blocked] Invalid token attempt.');
            res.status(401).json({
                success: false,
                error: 'Unauthorized: Invalid or expired token.'
            });
            return;
        }

        (req as AuthenticatedRequest).authUser = appUser;

        // 3. Token is valid, proceed to the next middleware/controller
        next();

    } catch (error) {
        logger.error(`[Auth Middleware Error] ${error instanceof Error ? error.message : String(error)}`);

        // Forward to the global errorHandler middleware for consistent error responses
        next(error);
    }
};
