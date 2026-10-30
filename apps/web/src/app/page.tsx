import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default async function RootPage() {
  // Signed-in visitors go straight to the dashboard.
  // Unauthenticated visitors see the welcome screen (spec screen 1) — no unconditional redirect.
  const cookieHeader = (await cookies()).toString();
  const me = await apiFetch<{ user: { id: string; email: string } }>('/auth/me', {
    cookies: cookieHeader,
  }).catch(() => null);
  if (me?.user) redirect('/home');

  return (
    <main className="app-shell">
      <div className="app-main">
        <div className="card" style={{ marginBlockStart: 40 }}>
          <h1 style={{ marginBlockStart: 0 }}>CareerFlow</h1>
          <p className="muted">The future looks good on you. Big goals. Small wins. A partner for the long game.</p>
          <p>A candidate-controlled career partner. Your data, your direction, your decisions.</p>
          <div style={{ display: 'flex', gap: 12, marginBlockStart: 20 }}>
            <Link href="/signup"><button className="btn btn-mint">Create account</button></Link>
            <Link href="/signin"><button className="btn">Sign in</button></Link>
          </div>
        </div>
      </div>
    </main>
  );
}
