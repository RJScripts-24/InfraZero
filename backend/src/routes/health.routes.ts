// backend/src/routes/health.routes.ts
import { Router } from 'express';
import { checkHealth } from '../controllers/health.controller';

const router = Router();

/**
 * Health Check Route
 * GET /api/health
 * * Used by AWS Load Balancers, Docker, and CI/CD pipelines 
 * to verify the backend is running and responsive.
 */
router.get('/', checkHealth);

export default router;