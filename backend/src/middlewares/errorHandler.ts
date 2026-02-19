// backend/src/middlewares/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { env } from '../config/env';

/**
 * Global Error Handling Middleware for Express.
 * Catches all unhandled errors thrown in routes/controllers and formats 
 * them into a consistent JSON response for the frontend to consume.
 */
export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // Log the detailed error on the server
    logger.error(`[Error] ${req.method} ${req.url} - ${err.message}`);

    if (err.stack) {
        logger.error(err.stack);
    }

    // Determine the HTTP status code (default to 500 Internal Server Error)
    const statusCode = err.status || err.statusCode || 500;

    // Format the error message
    // If in production, hide internal server error details from the client
    const isProduction = env.NODE_ENV === 'production';
    const message = (isProduction && statusCode === 500)
        ? 'An unexpected internal server error occurred.'
        : err.message || 'Internal Server Error';

    // Send the standardized JSON response
    res.status(statusCode).json({
        success: false,
        error: message,
        // Only include stack traces in development mode for easier debugging
        ...(isProduction ? {} : { stack: err.stack }),
    });
};