import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { getGhostTraceHistory, runGhostTraceAnalysis } from '../controllers/ghosttrace.controller';

const router = Router();

router.use(requireAuth);

router.get('/history', getGhostTraceHistory);
router.post('/analyze', runGhostTraceAnalysis);

export default router;
