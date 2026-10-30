'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Application {
  applicationId: string;
  stage: string;
  opportunityTitle: string | null;
  opportunityCompany: string | null;
}

export default function ApplicationsList() {
  const [apps, setApps] = useState<Application[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ applications: Application[] }>('/employer/applications');
        setApps(res.applications);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load applications');
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: '#fca5a5' }}>{err}</p>;
  if (!apps.length) return <p style={{ color: '#94a3b8' }}>No invitations yet. When a candidate invites you, the application will appear here.</p>;

  return (
    <div>
      <h1>Applications you're invited to review</h1>
      <div style={{ display: 'grid', gap: 10, marginBlockStart: 16 }}>
        {apps.map(a => (
          <div key={a.applicationId} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6 }}>
            <strong>{a.opportunityTitle ?? 'Untitled role'}</strong>
            <div style={{ color: '#94a3b8', fontSize: 13 }}>{a.opportunityCompany ?? 'Unknown company'} · Stage: {a.stage}</div>
            <Link href={`/applications/${a.applicationId}`} style={{ color: '#3ddc97', fontSize: 13 }}>View application</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
