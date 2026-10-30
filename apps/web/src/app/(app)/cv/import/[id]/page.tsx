'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Section { key: string; heading: string; rawText: string; lines: string[]; }

export default function CvReviewPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const wsId = search.get('ws') ?? '';
  const [sections, setSections] = useState<(Section & { include: boolean; editedText: string })[]>([]);
  const [label, setLabel] = useState('Imported CV');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { session } = await apiFetch<{ session: any }>(`/cv/${wsId}/session/${params.id}`);
      const parsed: Section[] = session.sections ?? [];
      setSections(parsed.map(s => ({ ...s, include: s.key !== 'references', editedText: s.rawText })));
    })().catch(() => setErr('Could not load session'));
  }, [params.id, wsId]);

  async function onConfirm() {
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch<{ profileVersionId: string }>(`/cv/${wsId}/session/${params.id}/confirm`, {
        method: 'POST', body: JSON.stringify({ profileLabel: label, sections: sections.map(s => ({ key: s.key, include: s.include, editedText: s.editedText })) }),
      });
      router.push(`/profile/${res.profileVersionId}`);
    } catch { setErr('Could not confirm'); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>Review extracted sections</h2>
        <p className="muted">Nothing enters your profile until you confirm. Uncheck a section to skip it. Edit any text.</p>
        <div className="form-field"><label>Profile version label</label><input value={label} onChange={e => setLabel(e.target.value)} /></div>
      </div>
      {sections.map((s, i) => (
        <div key={s.key + i} className="card">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
            <input type="checkbox" checked={s.include} onChange={e => { const copy = [...sections]; copy[i] = { ...s, include: e.target.checked }; setSections(copy); }} />
            {s.heading || s.key}
          </label>
          <textarea rows={Math.min(12, Math.max(3, s.editedText.split('\n').length))} value={s.editedText}
            onChange={e => { const copy = [...sections]; copy[i] = { ...s, editedText: e.target.value }; setSections(copy); }}
            style={{ width: '100%', marginBlockStart: 8, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
        </div>
      ))}
      {err && <p className="err">{err}</p>}
      <button className="btn btn-mint" onClick={onConfirm} disabled={busy}>{busy ? 'Saving…' : 'Create profile version'}</button>
    </div>
  );
}
