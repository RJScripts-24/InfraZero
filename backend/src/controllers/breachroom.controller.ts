import { Request, Response } from 'express';
import { runBreachRoomAnalysis } from '../services/breachroom.service';
import { logger } from '../utils/logger';
import { dbPool } from '../config/database';
import { AuthenticatedRequest } from '../types/request';

export const runBreachRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nodes, edges, ghostTraceResult, incidentSource, manualEvents, pdPayload, ddPayload, ghosttraceId } = req.body;

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      res.status(400).json({ error: 'nodes array is required and must not be empty.' });
      return;
    }

    if (!edges || !Array.isArray(edges)) {
      res.status(400).json({ error: 'edges array is required.' });
      return;
    }

    if (!ghostTraceResult || typeof ghostTraceResult !== 'object') {
      res.status(400).json({ error: 'ghostTraceResult object is required.' });
      return;
    }

    if (!incidentSource || typeof incidentSource !== 'string') {
      res.status(400).json({ error: 'incidentSource is required.' });
      return;
    }
    if (!['manual', 'pagerduty', 'datadog'].includes(incidentSource)) {
      res.status(400).json({ error: 'incidentSource must be one of: manual, pagerduty, datadog.' });
      return;
    }

    logger.info(`[BreachRoom] Running analysis for ${incidentSource} incidents`);
    const result = await runBreachRoomAnalysis({
      nodes,
      edges,
      ghostTraceResult,
      incidentSource: incidentSource as 'manual' | 'pagerduty' | 'datadog',
      manualEvents,
      pdPayload,
      ddPayload,
    });

    let breachroomId: string | null = null;
    if (typeof ghosttraceId === 'string' && ghosttraceId.trim().length > 0) {
      const userId = (req as AuthenticatedRequest).authUser.id;
      const { rows } = await dbPool.query(
        `
          INSERT INTO public.breachroom_analyses (
            ghosttrace_id,
            user_id,
            incident_title,
            incident_source,
            incident_start_time,
            incident_end_time,
            incident_events,
            recall_score,
            precision_score,
            f1_score,
            revision_suggestions,
            analysis_narrative
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id
        `,
        [
          ghosttraceId,
          userId,
          result.incidentTimeline.title,
          result.incidentTimeline.source,
          result.incidentTimeline.startTime,
          result.incidentTimeline.endTime,
          JSON.stringify(result.incidentTimeline.events || []),
          result.recallScore.recall,
          result.recallScore.precision,
          result.recallScore.f1Score,
          JSON.stringify(result.revisionSuggestions || []),
          result.analysisNarrative || null,
        ],
      );
      breachroomId = rows[0]?.id ?? null;
    }

    logger.info(`[BreachRoom] Complete. Timeline=${result.incidentTimeline.incidentId}`);
    res.status(200).json({
      ...result,
      ...(breachroomId ? { breachroomId } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'BreachRoom analysis error.';
    logger.error(`[BreachRoom Error] ${message}`);
    res.status(500).json({ error: message });
  }
};

export const getBreachRoomHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).authUser.id;
    const { rows } = await dbPool.query(
      `
        SELECT *
        FROM public.breachroom_analyses
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `,
      [userId],
    );

    res.status(200).json(rows || []);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch BreachRoom history.';
    logger.error(`[BreachRoom History Error] ${message}`);
    res.status(500).json({ error: message });
  }
};
