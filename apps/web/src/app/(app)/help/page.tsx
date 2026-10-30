import Link from 'next/link';

const TOPICS = [
  { title: 'Set my direction', body: 'Go to Direction → Start. You can pause anytime; nothing is final until you save a goal.' },
  { title: 'Import my CV', body: 'Go to Import CV. Supported: PDF (selectable text), TXT, MD. You review every section before anything enters your profile.' },
  { title: 'Link evidence to a role', body: 'Open an application, find a requirement, click "Link evidence…". Only same-workspace evidence is offered.' },
  { title: 'Prepare for an interview', body: 'Open an application → Prepare for interview. Questions are deterministic for your role; your evidence is selectable.' },
  { title: 'Download my data', body: 'Settings → Privacy & data → Request data export. A complete JSON snapshot is generated.' },
  { title: 'Delete my account', body: 'Settings → Delete account. Requires password and typed email confirmation.' },
];

export default function HelpPage() {
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card">
      <h2 style={{ marginBlockStart: 0 }}>Help</h2>
      <p className="muted">Common tasks. For anything else, <Link href="/feedback">report a problem or share feedback</Link>.</p>
    </div>
    {TOPICS.map(t => <div key={t.title} className="card"><h3 style={{ marginBlockStart: 0 }}>{t.title}</h3><p>{t.body}</p></div>)}
    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>What CareerFlow is not</h3>
      <p>CareerFlow does not verify your experience, predict hiring outcomes, or replace professional career, legal, financial, or mental-health advice. For consequential decisions, consult a qualified professional.</p>
    </div>
  </div>;
}
