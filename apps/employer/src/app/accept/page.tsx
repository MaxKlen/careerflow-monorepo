'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Preview {
  employerEmail: string;
  expiresAt: string;
  opportunityTitle: string | null;
  opportunityCompany: string | null;
}

export default function AcceptInvitation() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hasEmployerSession, setHasEmployerSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const storedTokenKey = 'cf_m11_invitation_token';
    const fragmentToken = fragment.get('token') ?? '';
    // React Strict Mode replays effects in development; retain the fragment only in same-tab storage.
    if (fragmentToken) window.sessionStorage.setItem(storedTokenKey, fragmentToken);
    const invitationToken = fragmentToken || window.sessionStorage.getItem(storedTokenKey) || '';
    // Fragments are excluded from HTTP requests/referrers; remove from history promptly after hydration.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setToken(invitationToken);
    if (!invitationToken) { setPreviewError('No invitation token provided.'); return; }
    (async () => {
      try {
        const res = await apiFetch<{ invitation: Preview }>('/employer/invitations/preview', {
          method: 'POST', body: JSON.stringify({ token: invitationToken }),
        });
        setPreview(res.invitation);
        try { await apiFetch('/employer/me'); setHasEmployerSession(true); }
        catch { setHasEmployerSession(false); }
        finally { setSessionChecked(true); }
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : 'This invitation link is invalid or expired.');
      }
    })();
  }, []);

  async function acceptAndOpen() {
    const accept = await apiFetch<{ applicationId: string }>('/employer/invitations/accept', {
      method: 'POST', body: JSON.stringify({ token }),
    });
    window.sessionStorage.removeItem('cf_m11_invitation_token');
    router.push(`/applications/${accept.applicationId}`);
  }

  async function signup(e: FormEvent) {
    e.preventDefault();
    if (!preview || !token) return;
    setBusy(true); setErr('');
    try {
      await apiFetch('/employer/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email: preview.employerEmail, password, companyName, invitationToken: token }),
      });
      await acceptAndOpen();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Signup failed');
    } finally { setBusy(false); }
  }

  async function acceptExisting() {
    if (!token) return;
    setBusy(true); setErr('');
    try { await acceptAndOpen(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Invitation acceptance failed'); }
    finally { setBusy(false); }
  }

  async function switchEmployerAccount() {
    setBusy(true); setErr('');
    try { await apiFetch('/employer/auth/signout', { method: 'POST' }); setHasEmployerSession(false); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Sign out failed'); }
    finally { setBusy(false); }
  }

  if (previewError) return <div style={{ background: '#7f1d1d', padding: 20, borderRadius: 8 }}><h2>Invitation unavailable</h2><p>{previewError}</p></div>;
  if (!preview || !sessionChecked) return <p>Loading invitation…</p>;

  return (
    <section style={{ maxWidth: 480, margin: '40px auto', background: '#1e3a5f', padding: 24, borderRadius: 8 }}>
      <h1 style={{ marginBlockStart: 0 }}>Accept invitation</h1>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>
        You've been invited to review an application {preview.opportunityTitle ? `for ${preview.opportunityTitle}` : ''}
        {preview.opportunityCompany ? ` at ${preview.opportunityCompany}` : ''}.
        Expires {new Date(preview.expiresAt).toLocaleString()}.
      </p>
      {hasEmployerSession ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <p>You are signed in. Accept this invitation with the account matching <strong>{preview.employerEmail}</strong>.</p>
          {err && <p role="alert" style={{ color: '#fca5a5' }}>{err}</p>}
          <button type="button" onClick={acceptExisting} disabled={busy} style={buttonStyle}>{busy ? 'Accepting…' : 'Accept invitation'}</button>
          <button type="button" onClick={switchEmployerAccount} disabled={busy} style={{ ...buttonStyle, background: '#475569', color: 'white' }}>Signed in to a different account? Sign out</button>
        </div>
      ) : (
        <>
          <form onSubmit={signup} style={{ display: 'grid', gap: 12 }}>
            <label>Email<input type="email" value={preview.employerEmail} disabled style={inputStyle} /></label>
            <label>Company name<input value={companyName} onChange={e => setCompanyName(e.target.value)} required maxLength={200} style={inputStyle} /></label>
            <label>Password (min 10)<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={10} style={inputStyle} /></label>
            {err && <p role="alert" style={{ color: '#fca5a5' }}>{err}</p>}
            <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Creating account…' : 'Create employer account'}</button>
          </form>
          <p style={{ color: '#94a3b8', fontSize: 12, marginBlockStart: 12 }}>Already have an employer account? <a href="/login" style={{ color: '#3ddc97' }}>Sign in first</a>, then reopen this invitation link.</p>
        </>
      )}
    </section>
  );
}
const inputStyle = { display: 'block', boxSizing: 'border-box' as const, width: '100%', padding: 10, marginBlockStart: 4, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' };
const buttonStyle = { background: '#3ddc97', color: '#0b1f3a', border: 0, padding: 10, borderRadius: 6, fontWeight: 700, cursor: 'pointer' };
