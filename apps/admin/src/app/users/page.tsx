'use client';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
type Candidate = { id: string; email: string; displayName: string | null; timezone: string; createdAt: string };
export default function UsersPage() {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Candidate[] | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function search(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await apiFetch<{ users: Candidate[] }>(`/admin/users?q=${encodeURIComponent(query)}`); setResults(result.users); } catch (e) { setError(e instanceof Error ? e.message : 'Lookup failed'); } finally { setBusy(false); } }
  return <div><h1>User lookup</h1><p style={{ color: '#94a3b8' }}>Searches by email. Results contain account metadata only; each lookup is audit-logged.</p>
    <form onSubmit={search} style={{ display: 'flex', gap: 8, marginBlockStart: 16 }}><input aria-label="Email search" value={query} onChange={e => setQuery(e.target.value)} minLength={3} maxLength={254} placeholder="Email contains…" style={{ flex: 1, padding: 10, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' }} /><button disabled={busy} style={{ background: '#3ddc97', color: '#0b1f3a', border: 0, padding: '10px 16px', borderRadius: 6 }}>{busy ? 'Searching…' : 'Search'}</button></form>
    {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}{results && !results.length && <p>No matches.</p>}
    {!!results?.length && <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', marginBlockStart: 16, borderCollapse: 'collapse' }}><thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #1e3a5f' }}><th>Email</th><th>Name</th><th>Timezone</th><th>Created</th></tr></thead><tbody>{results.map(user => <tr key={user.id} style={{ borderBottom: '1px solid #1e3a5f' }}><td>{user.email}</td><td>{user.displayName ?? '—'}</td><td>{user.timezone}</td><td>{new Date(user.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
  </div>;
}
