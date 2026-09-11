import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import {
  createProject,
  deleteProject,
  generateInviteLink,
  getProjectDetails,
  getSimulationReport,
  listProjectSimulations,
  listProjects,
  resolveInvite,
  revokeInviteLink,
  updateProject,
  importFromRepo,} from '../controllers/projects.controller';

const router = Router();

/**
 * Invite resolution is mounted BEFORE requireAuth: the share token is itself the
 * credential, and a collaborator opening an invite link has no session with the
 * project owner's account.
 */
router.get('/invite/:token', resolveInvite);

router.use(requireAuth);

router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', getProjectDetails);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);
router.post('/:id/invite', generateInviteLink);
router.delete('/:id/invite', revokeInviteLink);
router.post('/import-repo', importFromRepo);
router.get('/:id/simulations', listProjectSimulations);
router.get('/:id/reports/:reportId', getSimulationReport);

export default router;
