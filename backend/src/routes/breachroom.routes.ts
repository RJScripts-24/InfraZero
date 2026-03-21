import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { getBreachRoomHistory, runBreachRoom } from '../controllers/breachroom.controller';

const router = Router();

router.use(requireAuth);

router.get('/history', getBreachRoomHistory);
router.post('/analyze', runBreachRoom);

export default router;
