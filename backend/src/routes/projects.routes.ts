import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import {
  createProject,
  deleteProject,
  generateInviteLink,
  getProjectDetails,
  getLibraryOfDoom,
  getSimulationReport,
  listProjects,
  runSimulation,
  updateProject,
} from '../controllers/projects.controller';

const router = Router();

router.use(requireAuth);

router.get('/', listProjects);
router.get('/library-of-doom', getLibraryOfDoom);
router.post('/', createProject);
router.get('/:id', getProjectDetails);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);
router.post('/:id/invite', generateInviteLink);
router.post('/:id/simulate', runSimulation);
router.get('/:id/reports/:reportId', getSimulationReport);

export default router;
