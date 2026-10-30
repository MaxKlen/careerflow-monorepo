'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
export default function AdminNav() {
  const router = useRouter();
  async function signout() {
    try { await apiFetch('/admin/auth/signout', { method: 'POST', body: JSON.stringify({}) }); } finally { router.push('/login'); router.refresh(); }
  }
  return <nav style={{ padding: '12px 24px', borderBottom: '1px solid #1e3a5f', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
    <strong>CareerFlow Admin</strong><Link href="/">Dashboard</Link><Link href="/users">User lookup</Link><Link href="/flags">Feature flags</Link><Link href="/audit">Audit log</Link><Link href="/feedback">Feedback</Link><Link href="/login" style={{ marginInlineStart: 'auto' }}>Sign in</Link><button onClick={() => void signout()} style={{ background: 'transparent', border: '1px solid #475569', color: 'white', padding: '5px 10px', borderRadius: 6 }}>Sign out</button>
  </nav>;
}
