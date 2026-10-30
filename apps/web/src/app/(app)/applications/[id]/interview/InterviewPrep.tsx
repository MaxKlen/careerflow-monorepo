'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function InterviewPrep({ applicationId, initial }: { applicationId: string; initial: any }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initial.prep?.selectedQuestionIds ?? []);
  const [evidenceIds, setEvidenceIds] = useState<string[]>(initial.prep?.evidenceIds ?? []);
  const [notes, setNotes] = useState(initial.prep?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reflect, setReflect] = useState({ learned: '', followUp: '' });
  const [reflecting, setReflecting] = useState(false);
  const [reflectionOk, setReflectionOk] = useState(false);

  async function save() {
    setSaving(true); setErr(null);
    try {
      await apiFetch(`/interview/${applicationId}`, {
        method: 'PUT',
        body: JSON.stringify({ selectedQuestionIds: selected, evidenceIds, notes }),
      });
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function submitReflection() {
    if (!reflect.learned.trim()) return;
    setReflecting(true); setErr(null);
    try {
      await apiFetch(`/interview/${applicationId}/reflection`, {
        method: 'POST',
        body: JSON.stringify(reflect),
      });
      setReflectionOk(true);
      setReflect({ learned: '', followUp: '' });
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setReflecting(false); }
  }

  const byCategory: Record<string, any[]> = {};
  for (const q of initial.questions) {
    (byCategory[q.category] ||= []).push(q);
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>Interview prep</h2>
        <p className="muted" style={{ marginBlockEnd: 0 }}>
          Practice does not predict hiring outcomes. It helps you structure your own examples.
        </p>
      </div>

      {Object.entries(byCategory).map(([category, qs]) => (
        <div key={category} className="card">
          <h3 style={{ marginBlockStart: 0, textTransform: 'capitalize' }}>{category.replace('_', ' ')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {qs.map(q => (
              <label key={q.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 8, background: selected.includes(q.id) ? '#f0fdf4' : '#f8fafc', borderRadius: 6 }}>
                <input type="checkbox" checked={selected.includes(q.id)}
                  onChange={e => setSelected(s => e.target.checked ? [...s, q.id] : s.filter(x => x !== q.id))} />
                <span style={{ fontSize: 14 }}>{q.text}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Evidence to use</h3>
        {initial.availableEvidence.length === 0 ? <p className="muted">No evidence items yet — add some in the Evidence Library.</p> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {initial.availableEvidence.map((e: any) => (
              <label key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, background: '#f8fafc', borderRadius: 6 }}>
                <input type="checkbox" checked={evidenceIds.includes(e.id)}
                  onChange={ev => setEvidenceIds(s => ev.target.checked ? [...s, e.id] : s.filter(x => x !== e.id))} />
                <span>{e.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Preparation notes</h3>
        <textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="What do you want to remember, ask, or emphasize?"
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
        {err && <p className="err">{err}</p>}
        <button className="btn btn-mint" onClick={save} disabled={saving} style={{ marginBlockStart: 8 }}>
          {saving ? 'Saving…' : 'Save prep'}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>After the interview</h3>
        <div className="form-field"><label>What did you learn?</label>
          <textarea rows={3} value={reflect.learned} onChange={e => setReflect(r => ({ ...r, learned: e.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
        </div>
        <div className="form-field"><label>Follow-up action (optional)</label>
          <input value={reflect.followUp} onChange={e => setReflect(r => ({ ...r, followUp: e.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
        </div>
        {reflectionOk && <p className="muted" style={{ color: 'green' }}>Recorded.</p>}
        <button className="btn" onClick={submitReflection} disabled={reflecting || !reflect.learned.trim()}>
          {reflecting ? 'Saving…' : 'Record reflection'}
        </button>
      </div>
    </div>
  );
}
