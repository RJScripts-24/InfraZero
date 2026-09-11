// backend/src/services/simulations.repository.ts
import { dbPool } from '../config/database';

export interface SimulationLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface StoredSimulation {
  id: string;
  projectId: string;
  createdAt: string;
  report: Record<string, unknown>;
  logs: SimulationLog[];
}

interface SaveSimulationInput {
  projectId: string;
  userId: string;
  graphHash: string;
  universeSeed: string;
  grade: string;
  gradeScore: number | null;
  status: string;
  totalRequests: number;
  failedRequests: number;
  peakLatencyMs: number;
  report: Record<string, unknown>;
  logs: SimulationLog[];
}

const mapSimulation = (row: Record<string, unknown>): StoredSimulation => ({
  id: String(row.id),
  projectId: String(row.project_id),
  createdAt: new Date(row.created_at as string).toISOString(),
  report: (row.report as Record<string, unknown>) ?? {},
  logs: Array.isArray(row.logs) ? (row.logs as SimulationLog[]) : [],
});

export const saveSimulation = async (input: SaveSimulationInput): Promise<string> => {
  const { rows } = await dbPool.query(
    `INSERT INTO public.simulations (
       project_id, user_id, graph_hash, universe_seed, grade, grade_score, status,
       total_requests, failed_requests, peak_latency_ms, report, logs
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
     RETURNING id`,
    [
      input.projectId,
      input.userId,
      input.graphHash,
      input.universeSeed,
      input.grade,
      input.gradeScore,
      input.status,
      Math.round(input.totalRequests),
      Math.round(input.failedRequests),
      input.peakLatencyMs,
      JSON.stringify(input.report),
      JSON.stringify(input.logs),
    ],
  );
  return String(rows[0].id);
};

export const getSimulation = async (
  userId: string,
  simulationId: string,
): Promise<StoredSimulation | null> => {
  const { rows } = await dbPool.query(
    'SELECT * FROM public.simulations WHERE id = $1 AND user_id = $2',
    [simulationId, userId],
  );
  return rows[0] ? mapSimulation(rows[0]) : null;
};

export const getLatestSimulationForProject = async (
  userId: string,
  projectId: string,
): Promise<StoredSimulation | null> => {
  const { rows } = await dbPool.query(
    `SELECT * FROM public.simulations
      WHERE project_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [projectId, userId],
  );
  return rows[0] ? mapSimulation(rows[0]) : null;
};

export const listSimulationsForProject = async (
  userId: string,
  projectId: string,
  limit = 20,
): Promise<Array<Pick<StoredSimulation, 'id' | 'createdAt'> & { grade: string; status: string }>> => {
  const { rows } = await dbPool.query(
    `SELECT id, created_at, grade, status
       FROM public.simulations
      WHERE project_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [projectId, userId, limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    createdAt: new Date(row.created_at as string).toISOString(),
    grade: String(row.grade),
    status: String(row.status),
  }));
};
