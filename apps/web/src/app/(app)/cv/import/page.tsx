'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, API_URL } from '@/lib/api';

const UPLOAD_BASE = API_URL;

export default function CvImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const wsRes = await apiFetch<{ workspaces: any[] }>('/workspaces');
      const wsId = wsRes.workspaces[0].id;
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${UPLOAD_BASE}/cv/${wsId}/import`, { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      router.push(`/cv/import/${data.sessionId}?ws=${wsId}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Import failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2 style={{ marginBlockStart: 0 }}>Import your CV</h2>
      <p className="muted">Supported: .txt, .md (max 10 MB). PDF is supported. The file is stored in your workspace; you review every section before anything enters your profile.</p>
      <form onSubmit={onSubmit}>
        <div className="form-field"><input type="file" accept=".txt,.md,text/plain,text/markdown,.pdf,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
        {err && <p className="err">{err}</p>}
        <button type="submit" className="btn btn-mint" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload & parse'}</button>
      </form>
    </div>
  );
}
