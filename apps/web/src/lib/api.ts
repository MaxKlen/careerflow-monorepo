export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ApiOptions = RequestInit & { cookies?: string };

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (options.cookies) headers.set('cookie', options.cookies);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function apiError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
