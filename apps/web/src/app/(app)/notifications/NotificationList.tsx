'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type Item = { id: string; kind: string; title: string; body: string; createdAt: string; readAt: string | null };
export default function NotificationList({ workspaceId, initial }: { workspaceId: string; initial: { notifications: Item[]; unreadCount: number } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function markRead(id: string) { await apiFetch(`/notifications/${workspaceId}/${id}/read`, { method: 'POST', body: JSON.stringify({}) }); router.refresh(); }
  async function markAll() { setBusy(true); try { await apiFetch(`/notifications/${workspaceId}/read-all`, { method: 'POST', body: JSON.stringify({}) }); router.refresh(); } finally { setBusy(false); } }
  if (initial.notifications.length === 0) return <div className="card"><p className="muted">No notifications yet.</p></div>;
  return <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: 12 }}><span className="muted">{initial.unreadCount} unread</span>{initial.unreadCount > 0 && <button className="btn" onClick={markAll} disabled={busy}>Mark all read</button>}</div>
    <div style={{ display: 'grid', gap: 8 }}>{initial.notifications.map(item => <div key={item.id} style={{ padding: 12, borderRadius: 8, background: item.readAt ? '#f8fafc' : '#f0fdf4', borderInlineStart: item.readAt ? '3px solid transparent' : '3px solid var(--mint)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}><div><strong>{item.title}</strong><p style={{ margin: '4px 0 0', fontSize: 14 }}>{item.body}</p><p className="muted" style={{ margin: '4px 0 0', fontSize: 11 }}>{item.kind} · {new Date(item.createdAt).toLocaleString()}</p></div>{!item.readAt && <button className="btn" onClick={() => void markRead(item.id)} style={{ fontSize: 11, padding: '2px 8px' }}>Mark read</button>}</div>
    </div>)}</div>
  </div>;
}
