import { Request, Response } from 'express';
import { runGhostTrace } from '../services/ghosttrace.service';
import { logger } from '../utils/logger';

export const runGhostTraceAnalysis = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nodes, edges, trafficPattern } = req.body;

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      res.status(400).json({ error: 'nodes array is required and must not be empty.' });
      return;
    }

    if (!edges || !Array.isArray(edges)) {
      res.status(400).json({ error: 'edges array is required.' });
      return;
    }

    logger.info(`[GhostTrace] Running analysis with ${nodes.length} nodes, ${edges.length} edges`);
    const result = await runGhostTrace({ nodes, edges, trafficPattern });
    logger.info(`[GhostTrace] Complete. Predicted anomaly: ${result.predictedAnomalyClass}`);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GhostTrace analysis error.';
    logger.error(`[GhostTrace Error] ${message}`);
    res.status(500).json({ error: message });
  }
};
