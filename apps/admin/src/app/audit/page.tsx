'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
type Entry = { id: string; actorAdminUserId: string | null; action: string; targetType: string | null; metadata: Record<string, unknown>; createdAt: string };
export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]); const [error, setError] = useState('');
  useEffect(() => { void apiFetch<{ entries: Entry[] }>('/admin/audit-log').then(result => setEntries(result.entries)).catch(e => setError(e instanceof Error ? e.message : 'Could not load audit log')); }, []);
  return <div><h1>Audit log</h1><p style={{ color: '#94a3b8' }}>Recent admin sign-ins, dashboard views, lookups, and feature-flag changes.</p>{error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ textAlign: 'left' }}><th>When</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} style={{ borderTop: '1px solid #1e3a5f' }}><td>{new Date(entry.createdAt).toLocaleString()}</td><td>{entry.action}</td><td>{entry.targetType ?? '—'}</td><td><code>{JSON.stringify(entry.metadata)}</code></td></tr>)}</tbody></table></div>
  </div>;
}
