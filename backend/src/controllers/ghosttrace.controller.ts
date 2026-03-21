import { Request, Response } from 'express';
import { runGhostTrace } from '../services/ghosttrace.service';
import { logger } from '../utils/logger';
import { dbPool } from '../config/database';
import { AuthenticatedRequest } from '../types/request';

export const runGhostTraceAnalysis = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nodes, edges, trafficPattern, projectId } = req.body;

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

    let ghosttraceId: string | null = null;
    if (typeof projectId === 'string' && projectId.trim().length > 0) {
      const userId = (req as AuthenticatedRequest).authUser.id;
      const insert = await dbPool.query(
        `
          INSERT INTO public.ghosttrace_analyses (
            project_id,
            user_id,
            graph_hash,
            overall_risk,
            predicted_anomaly_class,
            edge_risks,
            node_risks,
            synthetic_spans,
            topology_embedding,
            analysis_narrative
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING id
        `,
        [
          projectId,
          userId,
          result.graphHash,
          result.overallRisk,
          result.predictedAnomalyClass,
          JSON.stringify(result.edgeRisks || []),
          JSON.stringify(result.nodeRisks || []),
          JSON.stringify(result.syntheticSpans || []),
          JSON.stringify(result.topologyEmbedding || []),
          result.analysisNarrative || null,
        ],
      );
      ghosttraceId = insert.rows[0]?.id ?? null;
    }

    logger.info(`[GhostTrace] Complete. Predicted anomaly: ${result.predictedAnomalyClass}`);
    res.status(200).json({
      ...result,
      ...(ghosttraceId ? { ghosttraceId } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GhostTrace analysis error.';
    logger.error(`[GhostTrace Error] ${message}`);
    res.status(500).json({ error: message });
  }
};

export const getGhostTraceHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).authUser.id;
    const { rows } = await dbPool.query(
      `
        SELECT *
        FROM public.ghosttrace_analyses
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `,
      [userId],
    );

    res.status(200).json(rows || []);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch GhostTrace history.';
    logger.error(`[GhostTrace History Error] ${message}`);
    res.status(500).json({ error: message });
  }
};
