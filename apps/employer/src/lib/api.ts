const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
