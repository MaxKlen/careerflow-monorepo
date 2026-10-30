import { cookies } from 'next/headers';
import { API_URL } from '@/lib/api';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'not_found' }, { status: 404 });
  const cookieHeader = (await cookies()).toString();
  const upstream = await fetch(`${API_URL}/settings/export/${encodeURIComponent(id)}`, {
    headers: { cookie: cookieHeader }, cache: 'no-store',
  });
  const headers = new Headers();
  for (const key of ['content-type', 'content-disposition']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers });
}
