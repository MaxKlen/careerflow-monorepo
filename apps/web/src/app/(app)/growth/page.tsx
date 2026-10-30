'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function GrowthPage() {
  const [wsId, setWsId] = useState<string | null>(null);
  const [data, setData] = useState<{ goals: any[]; entries: any[] }>({ goals: [], entries: [] });
  const [goalTitle, setGoalTitle] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [entryKind, setEntryKind] = useState<'achievement'|'reflection'|'conversation'|'learning'>('achievement');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const ws = await apiFetch<{ workspaces: any[] }>('/workspaces');
    const id = ws.workspaces[0]?.id;
    if (!id) return;
    setWsId(id);
    const g = await apiFetch<{ goals: any[]; entries: any[] }>(`/growth/${id}`);
    setData(g);
  }
  useEffect(() => { load().catch(() => setErr('Load failed')); }, []);

  async function addGoal() {
    if (!wsId || !goalTitle.trim()) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/growth/${wsId}/goals`, { method: 'POST', body: JSON.stringify({ title: goalTitle }) });
      setGoalTitle('');
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Add failed'); }
    finally { setBusy(false); }
  }

  async function addEntry() {
    if (!wsId || !entryTitle.trim() || !entryContent.trim()) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/growth/${wsId}/entries`, {
        method: 'POST',
        body: JSON.stringify({ kind: entryKind, title: entryTitle, content: entryContent }),
      });
      setEntryTitle(''); setEntryContent('');
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Add failed'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>Post-hire growth</h2>
        <p className="muted">Goals, achievements, and reflections you choose to keep. Nothing here is shared with any employer.</p>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Goals</h3>
        {data.goals.length === 0 ? <p className="muted">No goals yet.</p> : (
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {data.goals.map(g => <li key={g.id}>{g.title} <span className="muted">({g.status})</span></li>)}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, marginBlockStart: 12 }}>
          <input value={goalTitle} onChange={e => setGoalTitle(e.target.value)} placeholder="New goal"
            style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          <button className="btn btn-mint" onClick={addGoal} disabled={busy || !goalTitle.trim()}>Add goal</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Add entry</h3>
        <div className="form-field"><label>Kind</label>
          <select value={entryKind} onChange={e => setEntryKind(e.target.value as any)} style={{ padding: 6, borderRadius: 6 }}>
            <option value="achievement">Achievement</option>
            <option value="reflection">Reflection</option>
            <option value="conversation">Development conversation</option>
            <option value="learning">Learning</option>
          </select>
        </div>
        <div className="form-field"><label>Title</label>
          <input value={entryTitle} onChange={e => setEntryTitle(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        </div>
        <div className="form-field"><label>Content</label>
          <textarea rows={3} value={entryContent} onChange={e => setEntryContent(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn btn-mint" onClick={addEntry} disabled={busy || !entryTitle.trim() || !entryContent.trim()}>Add entry</button>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Recent entries</h3>
        {data.entries.length === 0 ? <p className="muted">No entries yet.</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.entries.map(e => (
              <div key={e.id} style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}>
                <div className="muted" style={{ fontSize: 11 }}>{e.kind} · {new Date(e.occurredAt).toLocaleDateString()}</div>
                <strong>{e.title}</strong>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontSize: 14 }}>{e.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
