// backend/src/middlewares/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import { AI_RATE_LIMITS } from '../config/constants';
import { logger } from '../utils/logger';

/**
 * Rate limiter middleware for the AI architecture generation endpoint.
 * Protects against abuse and exhaustion of Groq API credits.
 * * Note: You will need to install the package by running:
 * npm install express-rate-limit
 */
export const aiRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: AI_RATE_LIMITS.MAX_REQUESTS_PER_HOUR, // Limit each IP to the max requests defined in constants
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
        logger.warn(`[Rate Limit Exceeded] IP: ${req.ip} exceeded AI generation limits.`);

        res.status(429).json({
            success: false,
            error: `Too many architecture generation requests from this IP. Please try again after an hour. Maximum allowed is ${AI_RATE_LIMITS.MAX_REQUESTS_PER_HOUR} per hour.`,
        });
    },
});