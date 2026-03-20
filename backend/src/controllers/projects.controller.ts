import { NextFunction, Request, Response } from 'express';
import { CustomEdge, CustomNode } from '../types/graph';
import { integrationStore } from '../services/integrationStore.service';
import { AuthenticatedRequest } from '../types/request';

const parseTitle = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const title = value.trim();
  return title.length > 0 ? title : null;
};

const isNodeArray = (value: unknown): value is CustomNode[] => Array.isArray(value);
const isEdgeArray = (value: unknown): value is CustomEdge[] => Array.isArray(value);

export const listProjects = (req: Request, res: Response): void => {
  const data = integrationStore.listProjects(getAuthUserId(req));
  res.status(200).json(data);
};

const getPathParam = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
};

const getAuthUserId = (req: Request): string => (req as AuthenticatedRequest).authUser.id;

export const getProjectDetails = (req: Request, res: Response): void => {
  const project = integrationStore.getProject(getAuthUserId(req), getPathParam(req, 'id'));
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  res.status(200).json(project);
};

export const createProject = (req: Request, res: Response): void => {
  const title = parseTitle(req.body?.title);
  if (!title) {
    res.status(400).json({ error: 'title is required.' });
    return;
  }

  const created = integrationStore.createProject(getAuthUserId(req), title);
  res.status(201).json(created);
};

export const updateProject = (req: Request, res: Response): void => {
  const { title, nodes, edges } = req.body ?? {};
  const parsedTitle = title === undefined ? undefined : parseTitle(title);
  if (title !== undefined && !parsedTitle) {
    res.status(400).json({ error: 'title must be a non-empty string.' });
    return;
  }
  const normalizedTitle = parsedTitle ?? undefined;

  if (nodes !== undefined && !isNodeArray(nodes)) {
    res.status(400).json({ error: 'nodes must be an array.' });
    return;
  }

  if (edges !== undefined && !isEdgeArray(edges)) {
    res.status(400).json({ error: 'edges must be an array.' });
    return;
  }

  if (nodes && edges) {
    const graphValidation = integrationStore.validateGraphSize(nodes, edges);
    if (graphValidation) {
      res.status(413).json({ error: graphValidation });
      return;
    }
  }

  const updated = integrationStore.updateProject(getAuthUserId(req), getPathParam(req, 'id'), {
    title: normalizedTitle,
    nodes,
    edges,
  });

  if (!updated) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  res.status(200).json({ success: true });
};

export const deleteProject = (req: Request, res: Response): void => {
  const deleted = integrationStore.deleteProject(getAuthUserId(req), getPathParam(req, 'id'));
  if (!deleted) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  res.status(204).send();
};

export const generateInviteLink = (req: Request, res: Response): void => {
  const inviteLink = integrationStore.createInviteLink(getAuthUserId(req), getPathParam(req, 'id'));
  if (!inviteLink) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  res.status(200).json({ inviteLink });
};

export const runSimulation = (req: Request, res: Response, _next: NextFunction): void => {
  const result = integrationStore.runSimulation(getAuthUserId(req), getPathParam(req, 'id'));
  if (!result) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  res.status(202).json(result);
};

export const getSimulationReport = (req: Request, res: Response): void => {
  const report = integrationStore.getReport(
    getAuthUserId(req),
    getPathParam(req, 'id'),
    getPathParam(req, 'reportId')
  );
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  res.status(200).json(report);
};
