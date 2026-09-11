// backend/src/services/projects.repository.ts
import crypto from 'crypto';
import { dbPool } from '../config/database';
import { GRAPH_CONSTRAINTS } from '../config/constants';
import { CustomEdge, CustomNode } from '../types/graph';

export type ProjectStatus = 'Draft' | 'Graded' | 'Failure';

export interface ProjectListItem {
  id: string;
  title: string;
  status: ProjectStatus;
  statusColor: string;
  lastEdited: string;
  isCollaborative: boolean;
  grade: string | null;
}

export interface ProjectDetail {
  id: string;
  title: string;
  nodes: CustomNode[];
  edges: CustomEdge[];
  status: ProjectStatus;
  grade: string | null;
  isCollaborative: boolean;
  shareToken: string | null;
  updatedAt: string;
}

interface GraphData {
  nodes: CustomNode[];
  edges: CustomEdge[];
}

const statusColor = (status: ProjectStatus): string => {
  switch (status) {
    case 'Graded':
      return '#10B981';
    case 'Failure':
      return '#EF4444';
    default:
      return '#6B7280';
  }
};

/** graph_data is a free-form JSONB column; tolerate anything that is not the expected shape. */
const readGraph = (value: unknown): GraphData => {
  const graph = (value ?? {}) as Partial<GraphData>;
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
  };
};

const mapListItem = (row: Record<string, unknown>): ProjectListItem => {
  const status = (row.status as ProjectStatus) ?? 'Draft';
  return {
    id: String(row.id),
    title: String(row.name ?? 'Untitled Project'),
    status,
    statusColor: statusColor(status),
    lastEdited: new Date(row.updated_at as string).toISOString(),
    isCollaborative: Boolean(row.is_collaborative),
    grade: (row.grade as string) ?? null,
  };
};

const mapDetail = (row: Record<string, unknown>): ProjectDetail => {
  const graph = readGraph(row.graph_data);
  return {
    id: String(row.id),
    title: String(row.name ?? 'Untitled Project'),
    nodes: graph.nodes,
    edges: graph.edges,
    status: (row.status as ProjectStatus) ?? 'Draft',
    grade: (row.grade as string) ?? null,
    isCollaborative: Boolean(row.is_collaborative),
    shareToken: (row.share_token as string) ?? null,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
};

export const listProjects = async (userId: string): Promise<ProjectListItem[]> => {
  const { rows } = await dbPool.query(
    `SELECT id, name, status, grade, is_collaborative, updated_at
       FROM public.projects
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(mapListItem);
};

export const getProject = async (userId: string, projectId: string): Promise<ProjectDetail | null> => {
  const { rows } = await dbPool.query(
    'SELECT * FROM public.projects WHERE id = $1 AND user_id = $2',
    [projectId, userId],
  );
  return rows[0] ? mapDetail(rows[0]) : null;
};

export const createProject = async (userId: string, title: string): Promise<ProjectDetail> => {
  const { rows } = await dbPool.query(
    `INSERT INTO public.projects (user_id, name, graph_data, status)
     VALUES ($1, $2, $3::jsonb, 'Draft')
     RETURNING *`,
    [userId, title, JSON.stringify({ nodes: [], edges: [] })],
  );
  return mapDetail(rows[0]);
};

/**
 * Partial update. Only the fields actually supplied are written, so saving a
 * graph does not clobber a rename issued from another tab and vice versa.
 *
 * Editing the graph resets status to Draft: a stored grade describes a specific
 * topology, and once that topology changes the old grade is meaningless.
 */
export const updateProject = async (
  userId: string,
  projectId: string,
  payload: { title?: string; nodes?: CustomNode[]; edges?: CustomEdge[] },
): Promise<ProjectDetail | null> => {
  const sets: string[] = [];
  const values: unknown[] = [projectId, userId];

  if (payload.title !== undefined) {
    values.push(payload.title);
    sets.push(`name = $${values.length}`);
  }

  const graphChanged = payload.nodes !== undefined || payload.edges !== undefined;
  if (graphChanged) {
    const current = await getProject(userId, projectId);
    if (!current) {
      return null;
    }
    const graph: GraphData = {
      nodes: payload.nodes ?? current.nodes,
      edges: payload.edges ?? current.edges,
    };
    values.push(JSON.stringify(graph));
    sets.push(`graph_data = $${values.length}::jsonb`);
    sets.push(`status = 'Draft'`);
    sets.push('grade = NULL');
  }

  if (sets.length === 0) {
    return getProject(userId, projectId);
  }

  sets.push('updated_at = NOW()');

  const { rows } = await dbPool.query(
    `UPDATE public.projects SET ${sets.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    values,
  );

  return rows[0] ? mapDetail(rows[0]) : null;
};

export const deleteProject = async (userId: string, projectId: string): Promise<boolean> => {
  const { rowCount } = await dbPool.query(
    'DELETE FROM public.projects WHERE id = $1 AND user_id = $2',
    [projectId, userId],
  );
  return (rowCount ?? 0) > 0;
};

/**
 * `grade` is nullable because a run can legitimately produce no letter: the
 * model withholds one outside its trained coverage or near chance. Storing null
 * keeps the dashboard honest instead of showing a letter from another grader.
 */
export const setProjectGrade = async (
  projectId: string,
  grade: string | null,
  status: ProjectStatus,
): Promise<void> => {
  await dbPool.query(
    'UPDATE public.projects SET grade = $2, status = $3, updated_at = NOW() WHERE id = $1',
    [projectId, grade, status],
  );
};

// ---------------------------------------------------------------------------
// Collaboration sharing
// ---------------------------------------------------------------------------

/**
 * Returns the project's share token, minting one on first call.
 *
 * The token is 32 bytes of CSPRNG output, not derived from the project id: it is
 * the only thing standing between a link holder and the document, so it must not
 * be guessable from anything the holder already knows.
 */
export const getOrCreateShareToken = async (
  userId: string,
  projectId: string,
): Promise<string | null> => {
  const existing = await getProject(userId, projectId);
  if (!existing) {
    return null;
  }
  if (existing.shareToken) {
    return existing.shareToken;
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const { rows } = await dbPool.query(
    `UPDATE public.projects
        SET share_token = $3, is_collaborative = TRUE, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING share_token`,
    [projectId, userId, token],
  );
  return rows[0]?.share_token ?? null;
};

export const revokeShareToken = async (userId: string, projectId: string): Promise<boolean> => {
  const { rowCount } = await dbPool.query(
    `UPDATE public.projects
        SET share_token = NULL, is_collaborative = FALSE, updated_at = NOW()
      WHERE id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  return (rowCount ?? 0) > 0;
};

/**
 * Resolves an invite token to the project behind it. Deliberately not scoped to
 * a user: holding the token IS the authorisation, which is what makes an invite
 * link work for a collaborator who does not own the project.
 */
export const getProjectByShareToken = async (token: string): Promise<ProjectDetail | null> => {
  const { rows } = await dbPool.query('SELECT * FROM public.projects WHERE share_token = $1', [token]);
  return rows[0] ? mapDetail(rows[0]) : null;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const validateGraphSize = (nodes: CustomNode[], edges: CustomEdge[]): string | null => {
  if (nodes.length > GRAPH_CONSTRAINTS.MAX_NODES_PER_GRAPH) {
    return `nodes exceeds max of ${GRAPH_CONSTRAINTS.MAX_NODES_PER_GRAPH}`;
  }
  if (edges.length > GRAPH_CONSTRAINTS.MAX_EDGES_PER_GRAPH) {
    return `edges exceeds max of ${GRAPH_CONSTRAINTS.MAX_EDGES_PER_GRAPH}`;
  }
  return null;
};
