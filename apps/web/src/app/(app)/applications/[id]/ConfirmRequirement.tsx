'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function ConfirmRequirement({ applicationId, requirementId, workspaceId }: { applicationId: string; requirementId: string; workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { items } = await apiFetch<{ items: any[] }>(`/evidence/${workspaceId}`);
      setEvidence(items);
    })().catch(() => setErr('Could not load evidence'));
  }, [open, workspaceId]);

  async function confirm() {
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/applications/${applicationId}/requirements/${requirementId}/confirm`, { method: 'POST', body: JSON.stringify({ evidenceId: chosen }) });
      router.refresh();
      setOpen(false);
    } catch { setErr('Could not link'); } finally { setBusy(false); }
  }

  return (
    <div style={{ marginBlockStart: 8 }}>
      {!open ? (
        <button className="btn" onClick={() => setOpen(true)} style={{ fontSize: 12, padding: '4px 10px' }}>Link evidence…</button>
      ) : (
        <div>
          <select value={chosen} onChange={e => setChosen(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
            <option value="">Select evidence…</option>
            {evidence.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <button className="btn btn-mint" onClick={confirm} disabled={!chosen || busy} style={{ marginInlineStart: 8, fontSize: 12, padding: '4px 10px' }}>{busy ? '…' : 'Confirm'}</button>
          <button className="btn" onClick={() => setOpen(false)} style={{ marginInlineStart: 4, fontSize: 12, padding: '4px 10px' }}>Cancel</button>
          {err && <p className="err" style={{ fontSize: 12 }}>{err}</p>}
        </div>
      )}
    </div>
  );
}
