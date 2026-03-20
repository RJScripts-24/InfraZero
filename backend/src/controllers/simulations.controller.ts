import { Request, Response } from 'express';
import { integrationStore } from '../services/integrationStore.service';
import { AuthenticatedRequest } from '../types/request';
import { runSimulationWithEngine, buildDeterministicSeed } from '../services/simulationEngineBridge.service';
import { generateArchitectureReview } from '../services/groq.service';
import { logger } from '../utils/logger';

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

export const runSimulation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nodes, edges, seed: clientSeed, chaosEnabled, chaosEvents } = req.body;
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      res.status(400).json({ error: 'nodes array is required and must not be empty.' });
      return;
    }
    if (!edges || !Array.isArray(edges)) {
      res.status(400).json({ error: 'edges array is required.' });
      return;
    }
    const seed = typeof clientSeed === 'number' && clientSeed > 0
      ? clientSeed
      : buildDeterministicSeed('workspace', nodes, edges);
    logger.info(`[Simulation] Running with ${nodes.length} nodes, ${edges.length} edges, seed=${seed}`);
    const result = runSimulationWithEngine(nodes, edges, seed, { chaosEnabled, chaosEvents });
    let groqReview = '';
    try {
      groqReview = await generateArchitectureReview(result);
    } catch (reviewErr) {
      const reviewMessage = reviewErr instanceof Error ? reviewErr.message : String(reviewErr);
      logger.warn(`[Simulation] Groq review unavailable: ${reviewMessage}`);
    }
    logger.info(`[Simulation] Complete. Grade: ${result.grade}, Status: ${result.status}`);
    res.status(200).json({ ...result, groqReview });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Simulation engine error.';
    logger.error(`[Simulation Error] ${message}`);
    res.status(500).json({ error: message });
  }
};
