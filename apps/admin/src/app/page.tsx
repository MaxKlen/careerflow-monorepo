'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
type Dashboard = { totals: Record<string, number>; definitions: Record<string, string>; generatedAt: string };
export default function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void apiFetch<Dashboard>('/admin/dashboard').then(setData).catch(e => setError(e instanceof Error ? e.message : 'Request failed')); }, []);
  if (error) return <div style={{ background: '#7f1d1d', padding: 20, borderRadius: 8 }}><h2>Not signed in</h2><p>{error}</p><a href="/login" style={{ color: 'white' }}>Sign in or complete first-admin setup</a></div>;
  if (!data) return <p>Loading live counts…</p>;
  return <div><h1>Operations dashboard</h1><p style={{ color: '#94a3b8', fontSize: 14 }}>Counts are read from live tables; definitions are shown beneath each number.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBlockStart: 20 }}>{Object.entries(data.totals).map(([key, value]) => <div key={key} style={{ background: '#1e3a5f', padding: 16, borderRadius: 8 }}><div style={{ fontSize: 32, fontWeight: 700 }}>{value}</div><div>{key}</div><div style={{ color: '#94a3b8', fontSize: 11, marginBlockStart: 6 }}>{data.definitions[key]}</div></div>)}</div>
    <p style={{ color: '#64748b', fontSize: 12, marginBlockStart: 20 }}>Generated {new Date(data.generatedAt).toLocaleString()}</p>
  </div>;
}
