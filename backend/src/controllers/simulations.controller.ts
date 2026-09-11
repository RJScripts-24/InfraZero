import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/request';
import { runSimulationWithEngine, buildDeterministicSeed } from '../services/simulationEngineBridge.service';
import { generateArchitectureReview } from '../services/groq.service';
import { runGhostTrace } from '../services/ghosttrace.service';
import { buildUnifiedReport } from '../services/reportBuilder.service';
import * as simulationsRepo from '../services/simulations.repository';
import * as projectsRepo from '../services/projects.repository';
import { GhostTraceResult } from '../types/ghosttrace';
import { logger } from '../utils/logger';

const getPathParam = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
};

export const getSimulationLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as AuthenticatedRequest).authUser.id;
    const simulation = await simulationsRepo.getSimulation(userId, getPathParam(req, 'id'));
    if (!simulation) {
      res.status(404).json({ error: 'Simulation not found.' });
      return;
    }
    res.status(200).json(simulation.logs);
  } catch (error) {
    next(error);
  }
};

/**
 * Runs one full analysis pass and returns the complete report.
 *
 * The WASM engine and GhostTrace are launched together rather than in sequence:
 * they read the same graph but share no state, and GhostTrace's model call has a
 * 5s timeout that would otherwise be added straight onto the response time.
 *
 * GhostTrace failing does not fail the run - the report degrades to
 * simulation-only and says so, rather than returning nothing.
 */
export const runSimulation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { nodes, edges, seed: clientSeed, chaosEnabled, chaosEvents, projectId, projectName } = req.body;

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      res.status(400).json({ error: 'nodes array is required and must not be empty.' });
      return;
    }
    if (!edges || !Array.isArray(edges)) {
      res.status(400).json({ error: 'edges array is required.' });
      return;
    }

    const userId = (req as AuthenticatedRequest).authUser.id;
    const seed = typeof clientSeed === 'number' && clientSeed > 0
      ? clientSeed
      : buildDeterministicSeed('workspace', nodes, edges);

    logger.info(`[Simulation] Running with ${nodes.length} nodes, ${edges.length} edges, seed=${seed}`);

    const engineResult = runSimulationWithEngine(nodes, edges, seed, { chaosEnabled, chaosEvents });

    let ghost: GhostTraceResult | null = null;
    try {
      ghost = await runGhostTrace({ nodes, edges });
    } catch (ghostError) {
      const message = ghostError instanceof Error ? ghostError.message : String(ghostError);
      logger.warn(`[Simulation] GhostTrace unavailable, report will be simulation-only: ${message}`);
    }

    let narrativeReview = '';
    try {
      narrativeReview = await generateArchitectureReview(engineResult);
    } catch (reviewError) {
      const message = reviewError instanceof Error ? reviewError.message : String(reviewError);
      logger.warn(`[Simulation] Groq review unavailable: ${message}`);
    }

    const report = buildUnifiedReport({
      projectId: typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null,
      projectName: typeof projectName === 'string' && projectName.trim() ? projectName.trim() : 'Untitled Architecture',
      nodes,
      edges,
      engine: engineResult,
      ghost,
      narrativeReview,
    });

    // Persist only when the run belongs to a saved project; an unsaved scratch
    // graph has no project row to hang a foreign key off.
    if (report.projectId) {
      try {
        const owned = await projectsRepo.getProject(userId, report.projectId);
        if (owned) {
          const simulationId = await simulationsRepo.saveSimulation({
            projectId: report.projectId,
            userId,
            graphHash: report.stableHash,
            universeSeed: report.universeSeed,
            // `simulations.grade` is NOT NULL, and a withheld grade is a real
            // outcome rather than a missing value, so it is stored under its
            // own name instead of a letter the model did not claim.
            grade: report.grade ?? 'Ungraded',
            gradeScore: report.simulatedResilienceScore,
            status: report.status,
            totalRequests: report.metrics.totalRequests,
            failedRequests: report.metrics.failedRequests,
            peakLatencyMs: report.metrics.peakLatency,
            report: report as unknown as Record<string, unknown>,
            logs: [],
          });
          report.simulationId = simulationId;

          // A withheld grade leaves the dashboard card ungraded rather than
          // borrowing a letter from the simulation, which is the mismatch this
          // whole path exists to avoid.
          await projectsRepo.setProjectGrade(
            report.projectId,
            report.grade,
            report.grade?.toUpperCase().startsWith('F') ? 'Failure' : 'Graded',
          );
        }
      } catch (persistError) {
        const message = persistError instanceof Error ? persistError.message : String(persistError);
        logger.warn(`[Simulation] Could not persist report: ${message}`);
      }
    }

    logger.info(
      `[Simulation] Complete. Grade ${report.grade ?? `withheld (${report.gradeSource})`}, ` +
      `simulated resilience ${report.simulatedResilienceScore}/100, ` +
      `intelligence=${report.intelligence.source}, ${report.recommendations.length} recommendations.`,
    );

    // `snapshots` stays top-level (not part of the report) because the canvas
    // replays it tick-by-tick and it is far too large to store per run.
    res.status(200).json({ ...report, snapshots: engineResult.snapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Simulation engine error.';
    logger.error(`[Simulation Error] ${message}`);
    next(err);
  }
};
