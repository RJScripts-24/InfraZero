import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import {
  deleteAccount,
  getCurrentUser,
  githubLogin,
  googleLogin,
  updateProfile,
} from '../controllers/auth.controller';

const router = Router();

// Public: these are how a session is obtained in the first place.
router.post('/google', googleLogin);
router.post('/github', githubLogin);

// Authenticated account management.
router.get('/me', requireAuth, getCurrentUser);
router.patch('/me', requireAuth, updateProfile);
router.delete('/account', requireAuth, deleteAccount);

export default router;
