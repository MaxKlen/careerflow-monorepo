'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const KINDS = [['bug', 'Bug'], ['suggestion', 'Suggestion'], ['question', 'Question'], ['concern', 'Concern']] as const;

export default function FeedbackClient({ items }: { items: any[] }) {
  const router = useRouter();
  const [kind, setKind] = useState('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [contactOk, setContactOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    try {
      await apiFetch('/feedback', { method: 'POST', body: JSON.stringify({ kind, subject, body, contactOk }) });
      setMsg('Thank you — feedback submitted.'); setSubject(''); setBody(''); setContactOk(false);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Submit failed'); } finally { setBusy(false); }
  }

  return <>
    <div className="card">
      <form onSubmit={submit}>
        <div className="form-field"><label>Kind</label><select value={kind} onChange={e => setKind(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="form-field"><label>Subject</label><input required minLength={3} maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} /></div>
        <div className="form-field"><label>Details</label><textarea required minLength={10} maxLength={10000} rows={5} value={body} onChange={e => setBody(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBlockEnd: 12 }}><input type="checkbox" checked={contactOk} onChange={e => setContactOk(e.target.checked)} /> Support may contact me about this feedback</label>
        {msg && <p role="status" style={{ color: 'green', fontSize: 13 }}>{msg}</p>}
        {err && <p className="err">{err}</p>}
        <button className="btn btn-mint" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
      </form>
    </div>
    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Your previous feedback</h3>
      {items.length === 0 ? <p className="muted">No submissions yet.</p> : <ul style={{ margin: 0, paddingInlineStart: 20 }}>{items.map(x => <li key={x.id}>{new Date(x.createdAt).toLocaleString()} — <strong>{x.kind}</strong>: {x.subject} <span className="muted">({x.status})</span></li>)}</ul>}
    </div>
  </>;
}
