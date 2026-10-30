'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

function ResetForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [valid, setValid] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setValid(false);
      return () => { active = false; };
    }
    void apiFetch<{ valid: boolean }>(`/password-reset/verify?token=${encodeURIComponent(token)}`)
      .then((result) => { if (active) setValid(result.valid); })
      .catch(() => { if (active) setValid(false); });
    return () => { active = false; };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/password-reset/reset', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setMessage('Password reset. You can now sign in with your new password.');
      setTimeout(() => router.replace('/signin'), 1500);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  if (valid === null) return <p>Checking link…</p>;
  if (!valid) {
    return (
      <>
        <h1 style={{ marginBlockStart: 0 }}>Link is invalid or expired</h1>
        <p className="muted">Reset links expire after one hour and can be used once. Request a new one.</p>
        <Link href="/forgot" className="btn">Request a new link</Link>
      </>
    );
  }

  return (
    <>
      <h1 style={{ marginBlockStart: 0 }}>Set a new password</h1>
      <form onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="new-password">New password (minimum 10 characters)</label>
          <input id="new-password" type="password" required minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </div>
        <div className="form-field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" required minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
        </div>
        {message && <p role="status" style={{ color: 'green', fontSize: 13 }}>{message}</p>}
        {error && <p className="err">{error}</p>}
        <button type="submit" className="btn btn-mint" disabled={busy}>
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </>
  );
}

export default function ResetVerifyPage() {
  return (
    <main className="app-shell">
      <div className="app-main">
        <div className="card" style={{ maxWidth: 440, marginInline: 'auto', marginBlockStart: 40 }}>
          <Suspense fallback={<p>Checking link…</p>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
