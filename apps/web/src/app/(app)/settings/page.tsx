import { cookies } from 'next/headers';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const cookieHeader = (await cookies()).toString();
  const [data, exportsRes] = await Promise.all([
    apiFetch<any>('/settings', { cookies: cookieHeader }),
    apiFetch<{ exports: any[] }>('/settings/exports', { cookies: cookieHeader }).catch(() => ({ exports: [] })),
  ]);
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card"><h2 style={{ marginBlockStart: 0 }}>Settings</h2><p className="muted">Account, security, privacy, and data controls. <Link href="/help">Help</Link> · <Link href="/feedback">Report a problem</Link> · <Link href="/membership">Membership</Link></p></div>
    <SettingsClient initialUser={data.user} emailConfigured={data.emailConfigured} paymentProvider={data.paymentProvider} exports={exportsRes.exports} />
  </div>;
}
