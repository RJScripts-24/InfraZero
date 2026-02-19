// backend/src/controllers/health.controller.ts
import { Request, Response } from 'express';

/**
 * Controller for handling health check requests.
 * Route: GET /api/health
 * * Used by AWS Load Balancers, Docker, and CI/CD pipelines 
 * to verify the backend is running and responsive.
 */
export const checkHealth = (req: Request, res: Response): void => {
    // We use 200 OK to tell the load balancer everything is fine
    res.status(200).json({
        success: true,
        message: 'InfraZero Backend is running optimally.',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(), // Helps debug if the server is constantly restarting
        memoryUsage: process.memoryUsage().rss / 1024 / 1024 + ' MB', // Optional: Good for monitoring WASM/Node memory leaks
    });
};