'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
type Item = { id: string; kind: string; subject: string; body: string; status: string; contactOk: boolean; contextScreen: string | null; createdAt: string; userEmail: string | null; adminNotes: string | null };
export default function FeedbackAdmin() {
  const [items, setItems] = useState<Item[]>([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  async function load() { try { setItems((await apiFetch<{ items: Item[] }>('/admin/feedback')).items); } catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); } }
  useEffect(() => { void load(); }, []);
  async function setStatus(id: string, status: string, adminNotes?: string) {
    setBusy(id);
    try { await apiFetch(`/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status, adminNotes }) }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Update failed'); } finally { setBusy(''); }
  }
  return <div>
    <h1>Feedback</h1>
    <p style={{ color: '#94a3b8', fontSize: 14 }}>Candidate-submitted issues. Update status when triaged. Owner role can delete.</p>
    {err && <p role="alert" style={{ color: '#fca5a5' }}>{err}</p>}
    <div style={{ display: 'grid', gap: 10, marginBlockStart: 16 }}>
      {items.length === 0 ? <p style={{ color: '#94a3b8' }}>No feedback yet.</p> : items.map(it => <div key={it.id} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div>
            <strong>{it.subject}</strong>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>{it.kind} · {new Date(it.createdAt).toLocaleString()} · {it.userEmail ?? 'deleted user'} {it.contactOk ? '· may contact' : ''} {it.contextScreen ? `· ${it.contextScreen}` : ''}</div>
          </div>
          <select value={it.status} disabled={busy === it.id} onChange={e => void setStatus(it.id, e.target.value, it.adminNotes ?? undefined)} style={{ background: '#0b1f3a', color: 'white', border: '1px solid #475569', padding: '4px 8px', borderRadius: 4 }}>
            {['open','acknowledged','resolved','closed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{it.body}</p>
      </div>)}
    </div>
  </div>;
}
