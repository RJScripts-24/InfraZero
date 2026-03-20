import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { getSimulationLogs } from '../controllers/simulations.controller';

const router = Router();

router.use(requireAuth);

router.get('/:id/logs', getSimulationLogs);

export default router;
