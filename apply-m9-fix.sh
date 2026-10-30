#!/usr/bin/env bash
set -euo pipefail
[ -d apps/web ] || { echo "Run from careerflow-monorepo/ root."; exit 1; }
[ -f apps/web/src/app/page.tsx ] || { echo "missing apps/web/src/app/page.tsx"; exit 1; }

mkdir -p .m9-fix-backups
[ -f .m9-fix-backups/page.tsx.original ] || cp apps/web/src/app/page.tsx .m9-fix-backups/page.tsx.original

echo "== Audit: other unconditional redirects from public routes =="
grep -rn "redirect('/" apps/web/src/app/ 2>/dev/null | grep -v "(app)" || echo "  (none — no other public route redirects)"

cat > apps/web/src/app/page.tsx <<'EOF'
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
EOF

echo ""
echo "== Typecheck (web only) =="
pnpm --filter @careerflow/web typecheck
