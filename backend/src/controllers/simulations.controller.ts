import { Request, Response } from 'express';
import { integrationStore } from '../services/integrationStore.service';
import { AuthenticatedRequest } from '../types/request';

const getPathParam = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
};

export const getSimulationLogs = (req: Request, res: Response): void => {
  const userId = (req as AuthenticatedRequest).authUser.id;
  const logs = integrationStore.getSimulationLogs(userId, getPathParam(req, 'id'));
  if (!logs) {
    res.status(404).json({ error: 'Simulation not found.' });
    return;
  }
  res.status(200).json(logs);
};
