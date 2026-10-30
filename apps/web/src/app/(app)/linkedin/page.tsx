'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

const SECTIONS = ['headline', 'about', 'experience', 'skills', 'featured'] as const;
type Section = typeof SECTIONS[number];

export default function LinkedInPage() {
  const [section, setSection] = useState<Section>('headline');
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true);
    try {
      const res = await apiFetch<{ suggestions: any[] }>('/linkedin/analyze', { method: 'POST', body: JSON.stringify({ section, text }) });
      setSuggestions(res.suggestions);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>LinkedIn section review</h2>
        <p className="muted">Paste a section. Suggestions are deterministic — no AI, no external call. CareerFlow never publishes to LinkedIn.</p>
        <div className="form-field"><label>Section</label>
          <select value={section} onChange={e => setSection(e.target.value as Section)} style={{ padding: 10, borderRadius: 8 }}>
            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-field"><label>Text</label>
          <textarea rows={6} value={text} onChange={e => setText(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
        </div>
        <button className="btn btn-mint" onClick={analyze} disabled={busy || !text.trim()}>{busy ? 'Analyzing…' : 'Get suggestions'}</button>
      </div>
      {suggestions && (
        <div className="card">
          <h3 style={{ marginBlockStart: 0 }}>Suggestions ({suggestions.length})</h3>
          {suggestions.length === 0 ? <p className="muted">No issues flagged.</p> : (
            <div style={{ display: 'grid', gap: 12 }}>
              {suggestions.map(s => (
                <div key={s.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{s.message}</p>
                  {s.original && s.proposed && s.original !== s.proposed && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBlockStart: 8 }}>
                      <div><div className="muted" style={{ fontSize: 12 }}>Original</div><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{s.original}</pre></div>
                      <div><div className="muted" style={{ fontSize: 12 }}>Suggested</div><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{s.proposed}</pre></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
