'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Invitation {
  id: string;
  employerEmail: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function InviteEmployer({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch<{ invitations: Invitation[] }>(`/applications/${applicationId}/invitations`);
      setInvitations(res.invitations);
    } catch {}
  }
  useEffect(() => { void load(); }, [applicationId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg(''); setDevUrl(null);
    try {
      const res = await apiFetch<{ invitationUrl?: string }>(`/applications/${applicationId}/invitations`, {
        method: 'POST', body: JSON.stringify({ employerEmail: email }),
      });
      setMsg('Invitation created.'); setEmail('');
      if (res.invitationUrl) setDevUrl(res.invitationUrl);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Invite failed'); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    try {
      await apiFetch(`/applications/${applicationId}/invitations/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Revoke failed'); }
  }

  return (
    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Invite employer to review this application</h3>
      <p className="muted" style={{ fontSize: 13 }}>The employer will see only this application's attached documents and the requirements where you have confirmed evidence. They will not see your profile, other applications, your evidence library, or your email address.</p>
      <form onSubmit={invite} style={{ display: 'flex', gap: 8, marginBlockEnd: 12 }}>
        <input type="email" required placeholder="employer@company.com" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        <button className="btn btn-mint" type="submit" disabled={busy || !email.trim()}>{busy ? 'Inviting…' : 'Invite'}</button>
      </form>
      {msg && <p role="status" style={{ color: 'green', fontSize: 13 }}>{msg}</p>}
      {devUrl && <p style={{ fontSize: 13, background: '#fef3c7', padding: 8, borderRadius: 6, wordBreak: 'break-all' }}><strong>Dev only</strong> (email disabled): copy this link and share it manually — <code>{devUrl}</code></p>}
      {err && <p className="err">{err}</p>}
      {invitations.length > 0 && (
        <div style={{ marginBlockStart: 12 }}>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Invitations for this application:</p>
          <ul style={{ paddingInlineStart: 20, fontSize: 13, margin: '4px 0 0' }}>
            {invitations.map(i => (
              <li key={i.id}>
                {i.employerEmail} — {i.revokedAt ? 'revoked' : i.usedAt ? 'accepted' : 'pending'}
                {!i.revokedAt && !i.usedAt && <> (<button onClick={() => revoke(i.id)} style={{ background: 'none', border: 0, color: 'var(--coral)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>revoke</button>)</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
