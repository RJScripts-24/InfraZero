import { authFetch } from './auth';

export interface ProjectListItem {
  id: string;
  title: string;
  status: 'Draft' | 'Graded' | 'Failure';
  statusColor: string;
  lastEdited: string;
  isCollaborative: boolean;
  grade: string | null;
}

export interface ProjectDetail {
  id: string;
  title: string;
  nodes: any[];
  edges: any[];
  status: 'Draft' | 'Graded' | 'Failure';
  grade: string | null;
  isCollaborative: boolean;
  shareToken: string | null;
  updatedAt: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  provider: string;
  createdAt: string;
  projectCount: number;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Single place where a non-2xx becomes a thrown error carrying the server's own
 * message, so callers can surface something useful instead of "Failed to fetch".
 */
const request = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const response = await authFetch(url, options);

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && (body.error || body.message)) ||
      `Request failed (${response.status})`;
    throw new ApiError(String(message), response.status);
  }

  return body as T;
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const listProjects = (): Promise<ProjectListItem[]> => request('/api/projects');

export const getProject = (id: string): Promise<ProjectDetail> => request(`/api/projects/${id}`);

export const createProject = (title: string): Promise<ProjectDetail> =>
  request('/api/projects', { method: 'POST', body: JSON.stringify({ title }) });

export const renameProject = (id: string, title: string): Promise<{ success: boolean; project: ProjectDetail }> =>
  request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ title }) });

export const saveProjectGraph = (
  id: string,
  nodes: any[],
  edges: any[],
): Promise<{ success: boolean; project: ProjectDetail }> =>
  request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ nodes, edges }) });

export const deleteProject = (id: string): Promise<void> =>
  request(`/api/projects/${id}`, { method: 'DELETE' });

export const createInviteLink = (id: string): Promise<{ inviteLink: string; shareToken: string }> =>
  request(`/api/projects/${id}/invite`, { method: 'POST' });

export const revokeInviteLink = (id: string): Promise<{ success: boolean }> =>
  request(`/api/projects/${id}/invite`, { method: 'DELETE' });

export interface ResolvedInvite {
  id: string;
  title: string;
  nodes: any[];
  edges: any[];
  roomId: string;
}

/** Public: the invite token is the credential, so this needs no session. */
export const resolveInvite = (token: string): Promise<ResolvedInvite> =>
  request(`/api/projects/invite/${encodeURIComponent(token)}`);

export const getLatestReport = (projectId: string): Promise<any> =>
  request(`/api/projects/${projectId}/reports/latest`);

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export const getCurrentUser = (): Promise<CurrentUser> => request('/api/auth/me');

export const updateProfileName = (name: string): Promise<CurrentUser> =>
  request('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) });

export const deleteAccount = (confirmUserId: string): Promise<{ success: boolean }> =>
  request('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ confirmUserId }) });
