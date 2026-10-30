import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import MehWidget from '@/components/MehWidget';
import SignOut from '@/components/SignOut';
import NotificationBell from '@/components/NotificationBell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieHeader = (await cookies()).toString();
  let me: { user: { email: string; displayName?: string | null } };
  try { me = await apiFetch<{ user: { email: string; displayName?: string | null } }>('/auth/me', { cookies: cookieHeader }); } catch { redirect('/signin'); }
  return <><nav className="app-nav"><span className="brand">CareerFlow</span><Link href="/home">Home</Link><Link href="/direction">Direction</Link><Link href="/profile">Profile</Link><Link href="/evidence">Evidence</Link><Link href="/opportunities">Opportunities</Link><Link href="/applications">Applications</Link><Link href="/documents">Documents</Link>
        <Link href="/cv/import">Import CV</Link>
        <Link href="/linkedin">LinkedIn</Link><Link href="/meh">MEH</Link>
        <Link href="/offers">Offers</Link>
        <Link href="/growth">Growth</Link><span style={{ marginInlineStart:'auto' }} className="muted">{me.user.displayName ?? me.user.email}</span><SignOut /><NotificationBell />        <Link href="/settings">Settings</Link>
        <Link href="/help">Help</Link>
      </nav><main className="shell">{children}</main>
      <MehWidget />
      </>;
}
