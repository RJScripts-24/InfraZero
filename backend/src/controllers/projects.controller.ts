import { NextFunction, Request, Response } from 'express';
import { CustomEdge, CustomNode } from '../types/graph';
import { AuthenticatedRequest } from '../types/request';
import * as projects from '../services/projects.repository';
import * as simulations from '../services/simulations.repository';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  RepoImportError,
  importArchitectureFromRepo,
} from '../services/repoImport.service';

const parseTitle = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const title = value.trim();
  return title.length > 0 && title.length <= 120 ? title : null;
};

const isNodeArray = (value: unknown): value is CustomNode[] => Array.isArray(value);
const isEdgeArray = (value: unknown): value is CustomEdge[] => Array.isArray(value);

const getPathParam = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
};

const getAuthUserId = (req: Request): string => (req as AuthenticatedRequest).authUser.id;

export const listProjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.status(200).json(await projects.listProjects(getAuthUserId(req)));
  } catch (error) {
    next(error);
  }
};

export const getProjectDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const project = await projects.getProject(getAuthUserId(req), getPathParam(req, 'id'));
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.status(200).json(project);
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const title = parseTitle(req.body?.title ?? req.body?.name);
    if (!title) {
      res.status(400).json({ error: 'title is required (1-120 characters).' });
      return;
    }

    const created = await projects.createProject(getAuthUserId(req), title);
    logger.info(`[Projects] Created "${created.title}" (${created.id})`);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { title, name, nodes, edges } = req.body ?? {};
    const rawTitle = title ?? name;
    const parsedTitle = rawTitle === undefined ? undefined : parseTitle(rawTitle);
    if (rawTitle !== undefined && !parsedTitle) {
      res.status(400).json({ error: 'title must be a non-empty string of at most 120 characters.' });
      return;
    }

    if (nodes !== undefined && !isNodeArray(nodes)) {
      res.status(400).json({ error: 'nodes must be an array.' });
      return;
    }

    if (edges !== undefined && !isEdgeArray(edges)) {
      res.status(400).json({ error: 'edges must be an array.' });
      return;
    }

    if (nodes && edges) {
      const graphValidation = projects.validateGraphSize(nodes, edges);
      if (graphValidation) {
        res.status(413).json({ error: graphValidation });
        return;
      }
    }

    const updated = await projects.updateProject(getAuthUserId(req), getPathParam(req, 'id'), {
      title: parsedTitle ?? undefined,
      nodes,
      edges,
    });

    if (!updated) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    res.status(200).json({ success: true, project: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deleted = await projects.deleteProject(getAuthUserId(req), getPathParam(req, 'id'));
    if (!deleted) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

/**
 * Issues (or returns the existing) collaboration invite link.
 *
 * The link points at the app's own origin rather than a hard-coded domain, so an
 * invite generated on localhost is actually openable by the person receiving it.
 */
export const generateInviteLink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = getPathParam(req, 'id');
    const token = await projects.getOrCreateShareToken(getAuthUserId(req), projectId);
    if (!token) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const origin = env.CORS_ORIGIN.split(',')[0].trim().replace(/\/$/, '');
    res.status(200).json({
      inviteLink: `${origin}/workspace?invite=${token}`,
      shareToken: token,
    });
  } catch (error) {
    next(error);
  }
};

export const revokeInviteLink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const revoked = await projects.revokeShareToken(getAuthUserId(req), getPathParam(req, 'id'));
    if (!revoked) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * Resolves an invite token into the project it grants access to.
 *
 * Unauthenticated by design - the token is the credential. Only the fields a
 * collaborator needs are returned; the owner's identity is not disclosed.
 */
export const resolveInvite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = getPathParam(req, 'token');
    if (!token || token.length < 16) {
      res.status(400).json({ error: 'Invalid invite token.' });
      return;
    }

    const project = await projects.getProjectByShareToken(token);
    if (!project) {
      res.status(404).json({ error: 'This invite link is no longer valid.' });
      return;
    }

    res.status(200).json({
      id: project.id,
      title: project.title,
      nodes: project.nodes,
      edges: project.edges,
      // Everyone holding the token joins the same Yjs room.
      roomId: `infrazero-project-${project.id}`,
    });
  } catch (error) {
    next(error);
  }
};

export const listProjectSimulations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await simulations.listSimulationsForProject(
      getAuthUserId(req),
      getPathParam(req, 'id'),
    );
    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
};

export const getSimulationReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const reportId = getPathParam(req, 'reportId');

    const simulation = reportId === 'latest'
      ? await simulations.getLatestSimulationForProject(userId, getPathParam(req, 'id'))
      : await simulations.getSimulation(userId, reportId);

    if (!simulation || simulation.projectId !== getPathParam(req, 'id')) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    res.status(200).json({ ...simulation.report, simulationId: simulation.id, createdAt: simulation.createdAt });
  } catch (error) {
    next(error);
  }
};


/**
 * Build a project's architecture from a repository's own deployment manifests.
 *
 * This is the answer to the two problems every diagram has: somebody has to
 * draw it, and it starts going stale immediately. A repo already describes its
 * architecture precisely, and the manifests state `spec.replicas` -- so an
 * imported graph knows which components are single instances and which are
 * fleets, which a hand-drawn diagram almost never records.
 *
 * The import is returned rather than saved, so the user reviews it on the canvas
 * before it replaces anything they already have.
 */
export const importFromRepo = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const reference = String(req.body?.repository ?? '').trim();
    if (!reference) {
      res.status(400).json({ error: 'repository is required, e.g. "owner/repo".' });
      return;
    }

    const architecture = await importArchitectureFromRepo(reference);
    res.json({
      nodes: architecture.nodes,
      edges: architecture.edges,
      summary: {
        source: architecture.source,
        kind: architecture.kind,
        components: architecture.nodes.length,
        links: architecture.edges.length,
        replicasRecovered: architecture.replicasRecovered,
      },
    });
  } catch (error) {
    if (error instanceof RepoImportError) {
      // A repo with no manifests is the user pointing at the wrong place, not a
      // server fault, so it gets a 422 and the message explains where we looked.
      res.status(422).json({ error: error.message });
      return;
    }
    next(error);
  }
};
