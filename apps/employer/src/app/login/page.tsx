'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function EmployerLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await apiFetch('/employer/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/applications');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign in failed');
    } finally { setBusy(false); }
  }

  return (
    <section style={{ maxWidth: 440, margin: '40px auto', background: '#1e3a5f', padding: 24, borderRadius: 8 }}>
      <h1 style={{ marginBlockStart: 0 }}>Employer sign in</h1>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>New here? You need an invitation link from a candidate to create an account. Check the email you received.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></label>
        <label>Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></label>
        {err && <p role="alert" style={{ color: '#fca5a5' }}>{err}</p>}
        <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section>
  );
}
const inputStyle = { display: 'block', boxSizing: 'border-box' as const, width: '100%', padding: 10, marginBlockStart: 4, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' };
const buttonStyle = { background: '#3ddc97', color: '#0b1f3a', border: 0, padding: 10, borderRadius: 6, fontWeight: 700, cursor: 'pointer' };
