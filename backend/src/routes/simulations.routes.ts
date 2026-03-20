import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { getSimulationLogs } from '../controllers/simulations.controller';
import { runSimulation } from '../controllers/simulations.controller';

const router = Router();

router.use(requireAuth);

router.post('/run', runSimulation);
router.get('/:id/logs', getSimulationLogs);

export default router;
