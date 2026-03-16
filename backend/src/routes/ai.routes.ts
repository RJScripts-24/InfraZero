// backend/src/routes/ai.routes.ts
import { Router } from 'express';
import { generateArchitecture } from '../controllers/ai.controller';
import { requireAuth } from '../middlewares/requireAuth';
import { aiRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

/**
 * AI Architecture Generation Route
 * POST /api/ai/generate
 * * Middlewares Applied:
 * 1. requireAuth: Ensures the user is logged in and passes a valid Supabase JWT.
 * 2. aiRateLimiter: Prevents spamming the Groq Llama 3 API.
 * 3. generateArchitecture: The controller that parses the prompt and calls the AI service.
 */
router.post('/generate', requireAuth, aiRateLimiter, generateArchitecture);

export default router;