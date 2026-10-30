import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export default async function MembershipPage() {
  const cookieHeader = (await cookies()).toString();
  const plans = await apiFetch<any>('/membership/plans', { cookies: cookieHeader });
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card">
      <h2 style={{ marginBlockStart: 0 }}>Membership</h2>
      {plans.message ? <p className="muted">{plans.message}</p> : <p className="muted">Choose a plan below.</p>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      {plans.plans.map((p: any) => <div key={p.id} className="card">
        <h3 style={{ marginBlockStart: 0 }}>{p.name}</h3>
        <ul style={{ paddingInlineStart: 20, margin: 0, fontSize: 14 }}>{p.features.map((f: string) => <li key={f}>{f}</li>)}</ul>
        {!plans.checkoutAvailable && <p className="muted" style={{ fontSize: 12, marginBlockStart: 12 }}>Available at no cost in this deployment.</p>}
      </div>)}
    </div>
    <div className="card">
      <p className="muted" style={{ fontSize: 12 }}>Payment provider configured: <strong>{plans.provider}</strong>. When a provider is enabled, a checkout flow will be available on this page.</p>
    </div>
  </div>;
}
