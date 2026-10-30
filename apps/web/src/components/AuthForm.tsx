'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, apiError } from '@/lib/api';

export default function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password, ...(mode === 'signup' ? { displayName: name } : {}) }),
      });
      router.push('/home');
      router.refresh();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 460, margin: '40px auto' }}>
      <p className="muted">CareerFlow</p>
      <h1>{mode === 'signup' ? 'Create your workspace' : 'Welcome back'}</h1>
      {mode === 'signup' && (
        <div className="form-field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div className="form-field">
        <label>Email</label>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="form-field">
        <label>Password {mode === 'signup' && '(10+ characters)'}</label>
        <input
          required
          minLength={mode === 'signup' ? 10 : 1}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
      </div>
      {error && <p className="err">{error}</p>}
      <button className="btn btn-mint" disabled={busy}>
        {busy ? 'Working…' : mode === 'signup' ? 'Sign up' : 'Sign in'}
      </button>
      <p className="muted">
        {mode === 'signup' ? (
          <>Already have an account? <a href="/signin">Sign in</a></>
        ) : (
          <>Need an account? <a href="/signup">Sign up</a></>
        )}
      </p>
      {mode === 'signin' && (
        <p className="muted" style={{ marginBlockStart: 8, fontSize: 13 }}>
          <a href="/forgot">Forgot password?</a>
        </p>
      )}
    </form>
  );
}
