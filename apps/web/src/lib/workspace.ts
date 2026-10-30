import { apiFetch } from './api';

export interface Workspace { id: string; name: string; kind: 'personal' | 'sample'; createdAt: string; }

export async function getFirstWorkspace(cookieHeader = ''): Promise<Workspace | null> {
  const { workspaces } = await apiFetch<{ workspaces: Workspace[] }>('/workspaces', { cookies: cookieHeader });
  return workspaces[0] ?? null;
}

export async function ensureFirstWorkspace(cookieHeader = '', name = 'Personal'): Promise<Workspace> {
  const existing = await getFirstWorkspace(cookieHeader);
  if (existing) return existing;
  const { workspace } = await apiFetch<{ workspace: Workspace }>('/workspaces', { method: 'POST', body: JSON.stringify({ name, kind: 'personal' }), cookies: cookieHeader });
  return workspace;
}
