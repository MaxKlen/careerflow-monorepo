'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
export default function AdminLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [displayName, setDisplayName] = useState(''); const [bootstrapToken, setBootstrapToken] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await apiFetch(`/admin/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password, ...(mode === 'signup' ? { displayName: displayName || undefined, bootstrapToken: bootstrapToken || undefined } : {}) }) }); router.push('/'); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <section style={{ maxWidth: 440, margin: '40px auto', background: '#1e3a5f', padding: 24, borderRadius: 8 }}>
    <h1 style={{ marginBlockStart: 0 }}>{mode === 'signin' ? 'Admin sign in' : 'First-admin setup'}</h1>
    {mode === 'signup' && <p style={{ color: '#cbd5e1', fontSize: 13 }}>Available only until the first admin account is created. Use a unique, strong password.</p>}
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      {mode === 'signup' && <label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} style={inputStyle} /></label>}
      <label>Email<input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></label>
      <label>Password<input type="password" required minLength={mode === 'signup' ? 12 : 1} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></label>
      {mode === 'signup' && <label>Bootstrap token (required in production)<input type="password" value={bootstrapToken} onChange={e => setBootstrapToken(e.target.value)} maxLength={200} autoComplete="off" style={inputStyle} /></label>}
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      <button type="submit" disabled={busy} style={{ background: '#3ddc97', color: '#0b1f3a', border: 0, padding: 10, borderRadius: 6, fontWeight: 700 }}>{busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create first admin'}</button>
    </form>
    <p style={{ fontSize: 12, textAlign: 'center', color: '#cbd5e1' }}><button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} style={{ background: 'transparent', border: 0, color: '#3ddc97', cursor: 'pointer' }}>{mode === 'signin' ? 'First-time setup' : 'Back to sign in'}</button></p>
  </section>;
}
const inputStyle = { display: 'block', boxSizing: 'border-box' as const, width: '100%', padding: 10, marginBlockStart: 4, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' };
