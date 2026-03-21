import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { runGhostTraceAnalysis } from '../controllers/ghosttrace.controller';

const router = Router();

router.use(requireAuth);

router.post('/analyze', runGhostTraceAnalysis);

export default router;
