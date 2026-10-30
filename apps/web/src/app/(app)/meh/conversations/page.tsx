import { cookies } from 'next/headers';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ensureFirstWorkspace } from '@/lib/workspace';

export default async function ConversationsPage() {
  const cookieHeader = (await cookies()).toString();
  const ws = await ensureFirstWorkspace(cookieHeader);
  const { conversations } = await apiFetch<{ conversations: any[] }>(`/meh/${ws.id}/conversations`, { cookies: cookieHeader });
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>MEH conversations</h2>
        <p className="muted">Each message is labeled with its mode and provenance. "ai_generated_unverified" means verify anything factual.</p>
        <Link href="/meh"><button className="btn">New conversation</button></Link>
      </div>
      {conversations.length === 0 ? <div className="card"><p className="muted">No conversations yet.</p></div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {conversations.map(c => (
            <div key={c.id} className="card" style={{ padding: 12 }}>
              <p style={{ margin: 0 }}>Conversation {c.id.slice(0, 8)}…</p>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Updated {new Date(c.updatedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
