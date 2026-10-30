'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface ProvenanceClaim {
  text: string;
  sourceType: string;
  sourceId?: string;
  note?: string;
}

interface Version {
  id: string;
  content: string;
  provenance: ProvenanceClaim[];
  createdAt: string;
}

interface DocumentRecord {
  id: string;
  title: string;
  kind: string;
}

export default function DocumentEditor({ document, versions }: {
  document: DocumentRecord;
  versions: Version[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(versions[0]?.content ?? '');
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNewVersion() {
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/documents/${document.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          content: draft,
          provenance: [{ text: draft.slice(0, 200), sourceType: 'candidate_input' }],
        }),
      });
      setEditing(false);
      setCompareA(null);
      setCompareB(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function restoreAsDraft(version: Version) {
    setDraft(version.content);
    setError(null);
    setCompareA(null);
    setCompareB(null);
    setEditing(true);
  }

  const versionA = versions.find(version => version.id === compareA);
  const versionB = versions.find(version => version.id === compareB);
  const latest = versions[0];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h1 style={{ marginBlockStart: 0 }}>{document.title}</h1>
        <p className="muted" style={{ margin: 0 }}>{document.kind} · {versions.length} version{versions.length === 1 ? '' : 's'}</p>
      </div>

      {!editing && latest && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Latest · {new Date(latest.createdAt).toLocaleString()}</p>
            <button className="btn btn-mint" onClick={() => { setDraft(latest.content); setEditing(true); }}>Edit</button>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{latest.content}</pre>
          {Array.isArray(latest.provenance) && latest.provenance.length > 0 && (
            <details style={{ marginBlockStart: 12 }}>
              <summary className="muted">Provenance ({latest.provenance.length} claim{latest.provenance.length === 1 ? '' : 's'})</summary>
              <pre style={{ fontSize: 12, overflow: 'auto', marginBlockStart: 8 }}>{JSON.stringify(latest.provenance, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {editing && (
        <div className="card">
          <p className="muted" style={{ marginBlockEnd: 8, fontSize: 12 }}>Saving creates a new version. Previous versions are preserved.</p>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="muted">Document text</span>
            <textarea aria-label="Document text" rows={14} value={draft} onChange={event => setDraft(event.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
          </label>
          {error && <p className="err" role="alert">{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginBlockStart: 8 }}>
            <button className="btn btn-mint" onClick={saveNewVersion} disabled={saving || !draft.trim()}>{saving ? 'Saving…' : 'Save new version'}</button>
            <button className="btn" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {versions.length > 1 && (
        <div className="card">
          <h2 style={{ marginBlockStart: 0 }}>Version history</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {versions.map((version, index) => {
              const number = versions.length - index;
              const isLatest = index === 0;
              return (
                <div role="group" aria-label={`Version ${number}`} key={version.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 8, background: '#f1f5f9', borderRadius: 6 }}>
                  <span style={{ fontSize: 12 }}>v{number} · {new Date(version.createdAt).toLocaleString()}</span>
                  {!isLatest && latest && (
                    <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
                      <button className="btn" aria-label={`Compare v${number} to latest`} style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => { setCompareA(version.id); setCompareB(latest.id); }}>
                        Compare to latest
                      </button>
                      <button className="btn" aria-label={`Restore v${number} as draft`} style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => restoreAsDraft(version)}>
                        Restore as draft
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {versionA && versionB && (
        <div className="card" aria-label="Side-by-side version comparison">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginBlockStart: 0 }}>Compare versions</h2>
            <button className="btn" aria-label="Close comparison" onClick={() => { setCompareA(null); setCompareB(null); }} style={{ fontSize: 12, padding: '2px 8px' }}>Close</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <section aria-label="Older version">
              <p className="muted" style={{ fontSize: 12, marginBlockEnd: 4 }}>Older · {new Date(versionA.createdAt).toLocaleString()}</p>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', padding: 8, background: '#fef2f2', borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>{versionA.content}</pre>
            </section>
            <section aria-label="Latest version">
              <p className="muted" style={{ fontSize: 12, marginBlockEnd: 4 }}>Latest · {new Date(versionB.createdAt).toLocaleString()}</p>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', padding: 8, background: '#f0fdf4', borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>{versionB.content}</pre>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
