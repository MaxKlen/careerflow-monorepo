import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const SESSION_KEY = '@careerflow/api-session-cookie';

type ApiOptions = RequestInit & { skipSession?: boolean };
export type ApiUser = { id: string; email: string; displayName: string | null };
export type ApiWorkspace = {
  id: string;
  name: string;
  kind: string;
  createdAt: string;
};
export type ApiApplication = {
  id: string;
  workspaceId: string;
  opportunityId: string | null;
  stage: string;
  createdAt: string;
  updatedAt: string;
};
export type ApiProfileVersion = {
  id: string;
  label: string;
  headline: string | null;
  summary: string | null;
  targetRoles: unknown;
};

function requireApiUrl(): string {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL is not configured');
  return API_URL;
}
function sessionValue(headers: Headers): string | null {
  const raw = headers.get('set-cookie');
  if (!raw) return null;
  const cookie = raw.split(';', 1)[0];
  return cookie.includes('=') ? cookie : null;
}
async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const cookie = options.skipSession
    ? null
    : await AsyncStorage.getItem(SESSION_KEY);
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type'))
    headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(`${requireApiUrl()}${path}`, {
    ...options,
    headers,
  });
  const nextCookie = sessionValue(response.headers);
  if (nextCookie) await AsyncStorage.setItem(SESSION_KEY, nextCookie);
  const body = await response.text();
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = body;
  }
  if (!response.ok) {
    const error =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `http_${response.status}`;
    throw new Error(error);
  }
  return parsed as T;
}
export function apiConfigured(): boolean {
  return Boolean(API_URL);
}
export async function signIn(
  email: string,
  password: string,
): Promise<ApiUser> {
  const result = await request<{ user: ApiUser }>('/auth/signin', {
    method: 'POST',
    skipSession: true,
    body: JSON.stringify({ email, password }),
  });
  return result.user;
}
export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<ApiUser> {
  const result = await request<{ user: ApiUser }>('/auth/signup', {
    method: 'POST',
    skipSession: true,
    body: JSON.stringify({ email, password, displayName }),
  });
  return result.user;
}
export async function signOut(): Promise<void> {
  try {
    await request('/auth/signout', { method: 'POST' });
  } finally {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}
export async function currentUser(): Promise<ApiUser | null> {
  try {
    return (await request<{ user: ApiUser }>('/auth/me')).user;
  } catch {
    return null;
  }
}
export async function workspaces(): Promise<ApiWorkspace[]> {
  return (await request<{ workspaces: ApiWorkspace[] }>('/workspaces'))
    .workspaces;
}
export async function settings(): Promise<{ user: ApiUser }> {
  return request('/settings');
}
export async function updateSettings(input: {
  displayName?: string;
}): Promise<void> {
  await request('/settings', { method: 'PATCH', body: JSON.stringify(input) });
}
export async function profileVersions(
  workspaceId: string,
): Promise<ApiProfileVersion[]> {
  return (
    await request<{ versions: ApiProfileVersion[] }>(
      `/profiles/${encodeURIComponent(workspaceId)}`,
    )
  ).versions;
}
export async function createProfileVersion(
  workspaceId: string,
  input: {
    label: string;
    headline: string;
    summary: string;
    targetRoles: string[];
  },
): Promise<ApiProfileVersion> {
  return (
    await request<{ version: ApiProfileVersion }>(
      `/profiles/${encodeURIComponent(workspaceId)}`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  ).version;
}
export async function applications(
  workspaceId: string,
): Promise<ApiApplication[]> {
  return (
    await request<{ applications: ApiApplication[] }>(
      `/applications/by-workspace/${encodeURIComponent(workspaceId)}`,
    )
  ).applications;
}
export async function createApplication(
  workspaceId: string,
): Promise<ApiApplication> {
  return (
    await request<{ application: ApiApplication }>(
      `/applications/by-workspace/${encodeURIComponent(workspaceId)}`,
      { method: 'POST', body: JSON.stringify({}) },
    )
  ).application;
}
export async function updateApplicationStage(
  applicationId: string,
  stage: string,
): Promise<ApiApplication> {
  return (
    await request<{ application: ApiApplication }>(
      `/applications/${encodeURIComponent(applicationId)}/stage`,
      { method: 'PATCH', body: JSON.stringify({ stage }) },
    )
  ).application;
}
