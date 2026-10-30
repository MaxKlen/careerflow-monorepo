const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
