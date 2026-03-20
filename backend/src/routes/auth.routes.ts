import { Router } from 'express';
import { githubLogin, googleLogin, guestLogin } from '../controllers/auth.controller';

const router = Router();

router.post('/google', googleLogin);
router.post('/github', githubLogin);
router.post('/guest', guestLogin);

export default router;
