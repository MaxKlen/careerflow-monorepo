import { cookies } from 'next/headers';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ensureFirstWorkspace } from '@/lib/workspace';

export default async function OffersPage() {
  const cookieHeader = (await cookies()).toString();
  const ws = await ensureFirstWorkspace(cookieHeader);
  const { offers } = await apiFetch<{ offers: any[] }>(`/offers?workspaceId=${ws.id}`, { cookies: cookieHeader });

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>Offer comparison</h2>
        <p className="muted">Offers are applications you have moved to the "offer" stage. Missing information is marked, not guessed.</p>
      </div>
      {offers.length === 0 ? (
        <div className="card"><p className="muted">No offers yet. Move an application to the "offer" stage to see it here.</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {offers.map(o => (
            <div key={o.applicationId} className="card">
              <h3 style={{ marginBlockStart: 0 }}>{o.title ?? 'Untitled role'} — {o.company ?? 'Unknown company'}</h3>
              {o.compensation.length === 0 ? (
                <p className="muted">No compensation recorded. Add one via the API or wait for a compensation UI in a later milestone.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBlockStart: 8 }}>
                  <thead><tr style={{ textAlign: 'left' }}><th>Currency</th><th>Range</th><th>Period</th><th>Estimate?</th></tr></thead>
                  <tbody>
                    {o.compensation.map((c: any) => (
                      <tr key={c.id}>
                        <td>{c.currency}</td>
                        <td>{c.amountMin ?? '?'}–{c.amountMax ?? '?'}</td>
                        <td>{c.period}</td>
                        <td>{c.isEstimate ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Link href={`/applications/${o.applicationId}`}><button className="btn" style={{ marginBlockStart: 8 }}>Open application</button></Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
