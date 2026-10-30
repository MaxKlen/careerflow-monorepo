'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const LABELS: Record<string, string> = {
  application_deadline: 'Application deadlines', follow_up_due: 'Follow-up reminders', interview_scheduled: 'Interview reminders', goal_reminder: 'Goal reminders', weekly_digest: 'Weekly check-in',
};
type Pref = { enabled: boolean; quietHoursStart: string | null; quietHoursEnd: string | null };
export default function NotificationPrefs({ workspaceId, initial }: { workspaceId: string; initial: Record<string, Pref> }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    setBusy(true); setMessage('');
    try {
      await apiFetch(`/notifications/${workspaceId}/preferences`, { method: 'PUT', body: JSON.stringify({ prefs: Object.entries(prefs).map(([kind, pref]) => ({ kind, ...pref })) }) });
      setMessage('Preferences saved.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save preferences.'); }
    finally { setBusy(false); }
  }
  return <div className="card"><h3 style={{ marginBlockStart: 0 }}>Preferences</h3><p className="muted">Quiet hours use your account timezone.</p>
    <div style={{ display: 'grid', gap: 10 }}>{Object.entries(LABELS).map(([kind, label]) => {
      const pref = prefs[kind] ?? { enabled: true, quietHoursStart: null, quietHoursEnd: null };
      return <div key={kind} style={{ padding: 8, background: '#f8fafc', borderRadius: 6 }}><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={pref.enabled} onChange={e => setPrefs({ ...prefs, [kind]: { ...pref, enabled: e.target.checked } })} /><span>{label}</span></label>
        {pref.enabled && <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBlockStart: 6, fontSize: 12 }}><span className="muted">Quiet hours:</span><input aria-label={`${label} quiet-hours start`} type="time" value={pref.quietHoursStart ?? ''} onChange={e => setPrefs({ ...prefs, [kind]: { ...pref, quietHoursStart: e.target.value || null } })} /><span>to</span><input aria-label={`${label} quiet-hours end`} type="time" value={pref.quietHoursEnd ?? ''} onChange={e => setPrefs({ ...prefs, [kind]: { ...pref, quietHoursEnd: e.target.value || null } })} /></div>}
      </div>;
    })}</div>
    <button className="btn btn-mint" onClick={() => void save()} disabled={busy} style={{ marginBlockStart: 12 }}>{busy ? 'Saving…' : 'Save preferences'}</button>{message && <p role="status" className="muted">{message}</p>}
  </div>;
}
