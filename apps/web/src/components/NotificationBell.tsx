'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { workspaces } = await apiFetch<{ workspaces: { id: string }[] }>('/workspaces');
        const workspaceId = workspaces[0]?.id;
        if (!workspaceId) { if (!cancelled) setCount(0); return; }
        const result = await apiFetch<{ unreadCount: number }>(`/notifications/${workspaceId}?unread=1`);
        if (!cancelled) setCount(result.unreadCount);
      } catch { /* The bell is non-critical when the API is unavailable. */ }
    }
    void load();
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  return <Link href="/notifications" style={{ position: 'relative', marginInlineEnd: 8 }} aria-label={`Notifications${count ? `, ${count} unread` : ''}`}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
    {count > 0 && <span style={{ marginInlineStart: 5, background: 'var(--coral)', color: 'white', fontSize: 10, padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>{count > 99 ? '99+' : count}</span>}
  </Link>;
}
