'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

type ResetRequestResult = { ok: boolean; devResetUrl?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setDevUrl(null);
    try {
      const result = await apiFetch<ResetRequestResult>('/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage('If an account matches that email, reset instructions will be sent. In local development without email, a test link may appear below.');
      if (result.devResetUrl) setDevUrl(result.devResetUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="app-main">
        <div className="card" style={{ maxWidth: 440, marginInline: 'auto', marginBlockStart: 40 }}>
          <h1 style={{ marginBlockStart: 0 }}>Reset your password</h1>
          <p className="muted">Enter the email you used to sign up. If it matches an account, we&apos;ll show the next step.</p>
          <form onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="reset-email">Email</label>
              <input id="reset-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </div>
            {message && <p role="status" className="muted" style={{ fontSize: 13 }}>{message}</p>}
            {devUrl && (
              <p role="status" style={{ fontSize: 13, background: '#fef3c7', padding: 8, borderRadius: 6 }}>
                <strong>Development only:</strong>{' '}
                <a href={devUrl.replace(/^https?:\/\/[^/]+/, '')}>Open reset link</a>
              </p>
            )}
            {error && <p className="err">{error}</p>}
            <button type="submit" className="btn btn-mint" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset instructions'}
            </button>
          </form>
          <p className="muted" style={{ marginBlockStart: 16 }}>
            <Link href="/signin">Back to sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
