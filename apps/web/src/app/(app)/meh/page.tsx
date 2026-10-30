'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

const CONSENT_DISCLOSURE_VERSION = 'm5-v1';
interface Status { connected: boolean; providerConfigured: boolean; consentGrantedAt: string | null; }
interface Message { id: string; role: string; content: string; modeKind: string; sourceType: string; createdAt: string; }
interface Conversation { id: string; updatedAt: string; }

function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Request failed. Please try again.';
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? raw;
  } catch {
    return raw;
  }
}

export default function MehPage() {
  const [wsId, setWsId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'offline' | 'connected'>('offline');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ws = await apiFetch<{ workspaces: { id: string }[] }>('/workspaces');
      const id = ws.workspaces[0]?.id;
      if (!id) throw new Error('No workspace is available for this account.');
      if (cancelled) return;
      setWsId(id);
      const s = await apiFetch<Status>(`/meh/${id}/status`);
      if (cancelled) return;
      setStatus(s);
      const listing = await apiFetch<{ conversations: Conversation[] }>(`/meh/${id}/conversations`);
      const latest = listing.conversations[0];
      if (latest) {
        const detail = await apiFetch<{ messages: Message[] }>(`/meh/${id}/conversations/${latest.id}`);
        if (!cancelled) {
          setConversationId(latest.id);
          setMessages(detail.messages);
        }
      }
    })().catch(e => { if (!cancelled) setErr(readableError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function refreshStatus() {
    if (!wsId) return;
    const s = await apiFetch<Status>(`/meh/${wsId}/status`);
    setStatus(s);
    return s;
  }

  async function enable() {
    if (!wsId || !acknowledged) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/meh/${wsId}/enable-connected`, {
        method: 'POST',
        body: JSON.stringify({ disclosureVersion: CONSENT_DISCLOSURE_VERSION, acknowledgeDataFlow: true }),
      });
      const s = await refreshStatus();
      setAcknowledged(false);
      if (s?.providerConfigured) setMode('connected');
    } catch (e) { setErr(readableError(e)); }
    finally { setBusy(false); }
  }

  async function disable() {
    if (!wsId) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/meh/${wsId}/disable-connected`, { method: 'POST', body: JSON.stringify({}) });
      await refreshStatus();
      setMode('offline');
    } catch (e) { setErr(readableError(e)); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!wsId || !prompt.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch<{ conversationId: string; messages: Message[] }>('/meh/respond', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: wsId, conversationId: conversationId ?? undefined, screen: '/meh', prompt, mode }),
      });
      setConversationId(res.conversationId);
      setMessages(res.messages);
      setPrompt('');
    } catch (e) {
      setErr(readableError(e));
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>MEH — CareerFlow assistant</h2>
        <p className="muted" style={{ marginBlockEnd: 8 }}>
          MEH helps with navigation and organization. It does not predict hiring, verify experience, or replace qualified human advice.
          Suggestions are unverified; please check factual claims before using them.
        </p>
        {loading && <p className="muted">Loading assistant status…</p>}
        {status && (
          <div style={{ padding: 12, background: status.connected ? '#f0fdf4' : '#f1f5f9', borderRadius: 8, marginBlockEnd: 12 }}>
            <div style={{ fontWeight: 600 }}>
              {status.connected
                ? (status.providerConfigured ? 'Consent granted — connected provider configured' : 'Consent granted — no provider is configured')
                : 'Offline mode — no prompt is sent to an external AI provider'}
            </div>
            {status.connected && !status.providerConfigured && <p style={{ marginBlock: '6px 0' }}>Connected requests are unavailable and return 503 until a provider is configured; no prompt is sent to a provider.</p>}
            {status.consentGrantedAt && <div className="muted" style={{ fontSize: 12 }}>Consent granted {new Date(status.consentGrantedAt).toLocaleString()}</div>}
            <div style={{ display: 'flex', gap: 8, marginBlockStart: 8 }}>
              {status.connected && <button className="btn" onClick={disable} disabled={busy}>Disable connected mode (withdraw consent)</button>}
            </div>
          </div>
        )}
        <section aria-labelledby="meh-data-disclosure" style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, marginBlockEnd: 12 }}>
          <h3 id="meh-data-disclosure" style={{ marginBlockStart: 0 }}>Connected mode and your data</h3>
          <p>Before you grant consent: when you choose Connected mode and send a message, only the prompt text you type and this screen identifier (for example, <code>/meh</code>) are sent to the provider configured for this deployment. Your saved profile, CV, evidence, and other conversation history are not included.</p>
          <p>The provider's own privacy, retention, and data-use terms apply; CareerFlow cannot guarantee those terms. Granting consent by itself does not send your prompt. Offline mode uses fixed guidance and sends no prompt to an external AI provider. You can withdraw consent at any time.</p>
          {status && !status.providerConfigured && <p><strong>No provider is currently configured.</strong> Granting consent records your preference only; connected requests will return 503 and send no prompt to a provider.</p>}
          {!status?.connected && !loading && (
            <div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
                <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
                <span>I understand what data connected mode would send and the provider's terms would apply.</span>
              </label>
              <button className="btn btn-mint" onClick={enable} disabled={busy || !acknowledged} style={{ marginTop: 10 }}>Grant connected-mode consent</button>
            </div>
          )}
        </section>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="meh-mode" className="muted" style={{ fontSize: 12 }}>Mode:</label>
          <select id="meh-mode" value={mode} onChange={e => setMode(e.target.value as 'offline' | 'connected')} style={{ padding: 6, borderRadius: 6 }}>
            <option value="offline">Offline (deterministic)</option>
            <option value="connected" disabled={!status?.connected}>Connected</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Conversation</h3>
        {messages.length === 0 ? <p className="muted">No messages yet.</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {messages.map(m => (
              <div key={m.id} style={{
                padding: 10, borderRadius: 8,
                background: m.role === 'user' ? '#e0f2fe' : m.modeKind === 'connected' ? '#fef3c7' : '#f1f5f9',
              }}>
                <div className="muted" style={{ fontSize: 11, marginBlockEnd: 2 }}>
                  {m.role === 'user' ? 'You' : 'MEH'} · {m.modeKind} · {m.sourceType}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <label htmlFor="meh-prompt" style={{ display: 'block', marginBlockEnd: 6 }}>Your message</label>
        <textarea id="meh-prompt" rows={3} value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="Ask about your next step, a draft, or the current screen"
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-mint" onClick={send} disabled={busy || !prompt.trim() || !wsId} style={{ marginBlockStart: 8 }}>
          {busy ? 'Sending…' : `Send (${mode})`}
        </button>
      </div>
    </div>
  );
}
