'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function MehWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [wsId, setWsId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ connected: boolean; providerConfigured: boolean } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || wsId) return;
    (async () => {
      const ws = await apiFetch<{ workspaces: any[] }>('/workspaces');
      const id = ws.workspaces[0]?.id;
      if (!id) return;
      setWsId(id);
      const s = await apiFetch<{ connected: boolean; providerConfigured: boolean }>(`/meh/${id}/status`);
      setStatus(s);
    })().catch(() => {});
  }, [open, wsId]);

  // don't render on /meh pages (full page there already)
  if (pathname?.startsWith('/meh')) return null;

  async function send() {
    if (!wsId || !prompt.trim()) return;
    setBusy(true); setErr(null); setReply(null);
    try {
      const mode = status?.connected && status.providerConfigured ? 'connected' : 'offline';
      const res = await apiFetch<{ response: { body: string }; messages: any[] }>('/meh/respond', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: wsId, screen: pathname ?? '/', prompt, mode }),
      });
      setReply(res.response.body);
      setPrompt('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    } finally { setBusy(false); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close MEH' : 'Open MEH assistant'}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 40,
          width: 56, height: 56, borderRadius: 28, border: 0, cursor: 'pointer',
          background: 'var(--mint)', color: 'var(--navy)', fontWeight: 700, fontSize: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}
      >
        {open ? '×' : 'M'}
      </button>
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 20, zIndex: 40,
          width: 340, maxWidth: 'calc(100vw - 40px)',
          background: 'white', borderRadius: 12, padding: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'grid', gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>MEH</strong>
            <Link href="/meh" style={{ fontSize: 12 }}>Full page</Link>
          </div>
          {status && (
            <div className="muted" style={{ fontSize: 11 }}>
              {status.connected && status.providerConfigured ? 'Connected' :
               status.connected ? 'Connected mode not available' :
               'Offline mode'}
            </div>
          )}
          {reply && (
            <div style={{ background: '#f1f5f9', padding: 10, borderRadius: 8, fontSize: 13, maxHeight: 200, overflow: 'auto' }}>
              {reply}
            </div>
          )}
          {err && <div className="err" style={{ fontSize: 12 }}>{err}</div>}
          <textarea
            rows={2}
            placeholder="Ask about this screen or your next step"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit', fontSize: 13 }}
          />
          <button className="btn btn-mint" onClick={send} disabled={busy || !prompt.trim()} style={{ fontSize: 13 }}>
            {busy ? 'Sending…' : 'Ask MEH'}
          </button>
        </div>
      )}
    </>
  );
}
