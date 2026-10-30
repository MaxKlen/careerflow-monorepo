'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface User { email: string; displayName: string | null; timezone: string; locale: string; createdAt: string; }
interface Export { id: string; status: string; requestedAt: string; readyAt: string | null; downloadedAt: string | null; expiresAt: string | null; }

export default function SettingsClient({ initialUser, emailConfigured, paymentProvider, exports }: { initialUser: User; emailConfigured: boolean; paymentProvider: string; exports: Export[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialUser.displayName ?? '');
  const [timezone, setTimezone] = useState(initialUser.timezone);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteAck, setDeleteAck] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    try {
      await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ displayName: displayName.trim() || null, timezone }) });
      setMsg('Profile saved.'); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setPwdMsg('');
    try {
      await apiFetch('/settings/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      setPwdMsg('Password changed.'); setCurrentPassword(''); setNewPassword('');
    } catch (e) { setPwdMsg(e instanceof Error ? e.message : 'Change failed'); } finally { setBusy(false); }
  }

  async function requestExport() {
    setBusy(true); setErr('');
    try {
      await apiFetch('/settings/export', { method: 'POST', body: JSON.stringify({}) });
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(false); }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault(); setDeleteErr('');
    if (!deleteAck) { setDeleteErr('You must acknowledge that deletion is irreversible.'); return; }
    if (deleteConfirm.toLowerCase() !== initialUser.email.toLowerCase()) { setDeleteErr('Typed email does not match your account email.'); return; }
    setDeleteBusy(true);
    try {
      await apiFetch('/settings/delete', { method: 'POST', body: JSON.stringify({ password: deletePassword, confirmEmail: deleteConfirm, acknowledgeIrreversible: true }) });
      window.location.href = '/';
    } catch (e) { setDeleteErr(e instanceof Error ? e.message : 'Delete failed'); } finally { setDeleteBusy(false); }
  }

  return <>
    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Account</h3>
      <form onSubmit={saveProfile}>
        <div className="form-field"><label>Email</label><input value={initialUser.email} disabled /></div>
        <div className="form-field"><label>Display name</label><input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} /></div>
        <div className="form-field"><label>Timezone</label><input value={timezone} onChange={e => setTimezone(e.target.value)} /></div>
        {msg && <p role="status" style={{ color: 'green', fontSize: 13 }}>{msg}</p>}
        {err && <p className="err">{err}</p>}
        <button className="btn btn-mint" type="submit" disabled={busy}>Save</button>
      </form>
    </div>

    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Password</h3>
      <form onSubmit={changePassword}>
        <div className="form-field"><label>Current password</label><input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></div>
        <div className="form-field"><label>New password (min 10)</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={10} /></div>
        {pwdMsg && <p role="status" style={{ fontSize: 13 }}>{pwdMsg}</p>}
        <button className="btn btn-mint" type="submit" disabled={busy}>Change password</button>
      </form>
    </div>

    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Privacy & data</h3>
      <p className="muted">Export your CareerFlow records as one JSON file; exports expire after 7 days. Raw uploaded CV files are excluded, but parsed CV text is included. Shared opportunity catalog entries are labeled in the export.</p>
      {emailConfigured && <p className="muted" style={{ fontSize: 12 }}>Email notifications are enabled in this deployment — you will receive an email when the export is ready.</p>}
      <button className="btn btn-mint" onClick={requestExport} disabled={busy}>Request data export</button>
      {exports.length > 0 && (
        <div style={{ marginBlockStart: 12 }}>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Recent exports:</p>
          <ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: 13 }}>
            {exports.map(x => <li key={x.id}>
              {new Date(x.requestedAt).toLocaleString()} — {x.status}
              {x.status === 'ready' && !(x.expiresAt && new Date(x.expiresAt).getTime() < Date.now()) && <> (<a href={`/settings/export/${x.id}`} download>download</a>)</>}
            </li>)}
          </ul>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginBlockStart: 12 }}>Payment provider in this deployment: <strong>{paymentProvider}</strong>. Manage subscriptions in <a href="/membership">Membership</a>.</p>
    </div>

    <div className="card" style={{ borderInlineStart: '4px solid var(--coral)' }}>
      <h3 style={{ marginBlockStart: 0 }}>Delete account</h3>
      <p className="muted">This deletes your account, workspaces, profile versions, evidence, applications, documents, CV imports and their uploaded files, notifications, MEH conversations, growth records, subscriptions, and generated exports. <strong>It cannot be undone.</strong> Feedback you previously submitted remains with its account and workspace links removed; identifying details you wrote in its text may remain. Shared opportunity catalog entries are not deleted and may remain visible to other users.</p>
      <form onSubmit={deleteAccount}>
        <div className="form-field"><label>Your password</label><input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} required /></div>
        <div className="form-field"><label>Type your email to confirm: <code>{initialUser.email}</code></label><input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} required /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBlockEnd: 12 }}>
          <input type="checkbox" checked={deleteAck} onChange={e => setDeleteAck(e.target.checked)} /> I understand this is irreversible.
        </label>
        {deleteErr && <p className="err">{deleteErr}</p>}
        <button className="btn" type="submit" disabled={deleteBusy} style={{ background: 'var(--coral)' }}>{deleteBusy ? 'Deleting…' : 'Delete account permanently'}</button>
      </form>
    </div>
  </>;
}
