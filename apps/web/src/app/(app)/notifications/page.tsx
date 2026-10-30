import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { ensureFirstWorkspace } from '@/lib/workspace';
import NotificationList from './NotificationList';
import NotificationPrefs from './NotificationPrefs';

export default async function NotificationsPage() {
  const cookieHeader = (await cookies()).toString();
  const workspace = await ensureFirstWorkspace(cookieHeader);
  const [list, prefRes] = await Promise.all([
    apiFetch<{ notifications: any[]; unreadCount: number }>(`/notifications/${workspace.id}`, { cookies: cookieHeader }),
    apiFetch<{ preferences: Record<string, any> }>(`/notifications/${workspace.id}/preferences`, { cookies: cookieHeader }),
  ]);
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card"><h2 style={{ marginBlockStart: 0 }}>Notifications</h2><p className="muted">In-app reminders only. No email or third-party delivery is enabled.</p></div>
    <NotificationList workspaceId={workspace.id} initial={list} />
    <NotificationPrefs workspaceId={workspace.id} initial={prefRes.preferences} />
  </div>;
}
