import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import FeedbackClient from './FeedbackClient';

export default async function FeedbackPage() {
  const cookieHeader = (await cookies()).toString();
  const items = await apiFetch<{ items: any[] }>('/feedback', { cookies: cookieHeader }).catch(() => ({ items: [] }));
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card"><h2 style={{ marginBlockStart: 0 }}>Feedback</h2><p className="muted">Report a problem or share a suggestion. Only the fields below are sent. Support may contact you only if you allow it.</p></div>
    <FeedbackClient items={items.items} />
  </div>;
}
