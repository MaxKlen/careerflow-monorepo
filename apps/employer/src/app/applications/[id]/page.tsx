'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Projection {
  application: {
    id: string; stage: string; submissionRecordedAt: string | null;
    nextAction: string | null; dueDate: string | null;
    opportunityTitle: string | null; opportunityCompany: string | null;
    opportunityLocation: string | null; opportunityArrangement: string | null;
  };
  documents: { id: string; kind: string; title: string; createdAt: string; versions: { content: string; provenance: any[]; createdAt: string }[] }[];
  requirements: { id: string; text: string; position: number; linkedEvidence: { state: string; linkedAt: string; confirmedAt: string | null }[] }[];
}

export default function ProjectionView() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Projection | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<Projection>(`/employer/applications/${params.id}`);
        setData(res);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Application not accessible');
      } finally { setLoading(false); }
    })();
  }, [params.id]);

  if (loading) return <p>Loading…</p>;
  if (err) return <div style={{ background: '#7f1d1d', padding: 20, borderRadius: 8 }}><h2>Not accessible</h2><p>{err}</p></div>;
  if (!data) return null;

  return (
    <div>
      <h1>{data.application.opportunityTitle ?? 'Untitled role'}</h1>
      <p style={{ color: '#94a3b8' }}>{data.application.opportunityCompany} · Stage: {data.application.stage}
        {data.application.opportunityLocation ? ` · ${data.application.opportunityLocation}` : ''}
        {data.application.opportunityArrangement ? ` · ${data.application.opportunityArrangement}` : ''}</p>

      <h2>Documents</h2>
      {data.documents.length === 0 ? <p style={{ color: '#94a3b8' }}>No documents attached to this application.</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.documents.map(d => (
            <div key={d.id} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6 }}>
              <strong>{d.title}</strong> <span style={{ color: '#94a3b8', fontSize: 12 }}>({d.kind})</span>
              {d.versions.slice(0, 1).map((v, i) => (
                <pre key={i} style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#0b1f3a', padding: 10, borderRadius: 4, marginBlockStart: 8, fontSize: 13 }}>{v.content}</pre>
              ))}
            </div>
          ))}
        </div>
      )}

      <h2>Requirements the candidate linked evidence to</h2>
      {data.requirements.filter(r => r.linkedEvidence.length).length === 0 ? <p style={{ color: '#94a3b8' }}>No requirement-to-evidence links confirmed by the candidate.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.requirements.filter(r => r.linkedEvidence.length).map(r => (
            <div key={r.id} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6 }}>
              <div>{r.text}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBlockStart: 4 }}>Evidence linked {new Date(r.linkedEvidence[0]!.linkedAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
