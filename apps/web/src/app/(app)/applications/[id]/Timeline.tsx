'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApplicationEventKind } from '@careerflow/shared';
import { apiFetch } from '@/lib/api';

const APPLICATION_EVENT_KINDS: ApplicationEventKind[] = [
  'note', 'submission_recorded', 'submission_confirmed',
  'interview_scheduled', 'interview_completed', 'follow_up',
  'offer_received', 'offer_declined', 'closed',
];

const KIND_LABELS: Record<ApplicationEventKind, string> = {
  note: 'Note',
  submission_recorded: 'Submitted (recorded by you)',
  submission_confirmed: 'Submitted (confirmed by employer)',
  interview_scheduled: 'Interview scheduled',
  interview_completed: 'Interview completed',
  follow_up: 'Follow-up',
  offer_received: 'Offer received',
  offer_declined: 'Offer declined',
  closed: 'Closed',
};

interface ApplicationEventRecord {
  id: string;
  kind: ApplicationEventKind;
  occurredAt: string;
  note: string | null;
  sourceType: string;
}

export default function Timeline({ applicationId, events }: {
  applicationId: string;
  events: ApplicationEventRecord[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ApplicationEventKind>('note');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addEvent() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/applications/${applicationId}/events`, {
        method: 'POST',
        body: JSON.stringify({ kind, occurredAt, note: note || undefined }),
      });
      setNote('');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add event');
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent(eventId: string) {
    setDeleting(eventId);
    setError(null);
    try {
      await apiFetch(`/applications/${applicationId}/events/${eventId}`, { method: 'DELETE' });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete event');
    } finally {
      setDeleting(null);
    }
  }

  const sortedEvents = [...events].sort((a, b) =>
    new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="muted" style={{ margin: 0 }}>
        Events are ordered by date. <strong>Candidate</strong> entries are what you recorded; <strong>Confirmed</strong> entries come from an integration.
        CareerFlow never marks something confirmed on your behalf.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted">Event type</span>
            <select aria-label="Event type" value={kind} onChange={event => setKind(event.target.value as ApplicationEventKind)} style={{ padding: 6, borderRadius: 6 }}>
              {APPLICATION_EVENT_KINDS.map(eventKind => <option key={eventKind} value={eventKind}>{KIND_LABELS[eventKind]}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="muted">Event date</span>
            <input aria-label="Event date" type="date" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </label>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="muted">Optional note</span>
          <textarea rows={2} value={note} onChange={event => setNote(event.target.value)} placeholder="Optional note"
            style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
        </label>
        <button className="btn btn-mint" onClick={addEvent} disabled={busy} style={{ justifySelf: 'start' }}>
          {busy ? 'Adding…' : 'Add event'}
        </button>
        {error && <p className="err" role="alert">{error}</p>}
      </div>

      {sortedEvents.length === 0 ? <p className="muted">No events yet.</p> : (
        <div role="list" aria-label="Application events" style={{ display: 'grid', gap: 6 }}>
          {sortedEvents.map(event => {
            const date = event.occurredAt.slice(0, 10);
            return (
              <div role="listitem" key={event.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', padding: 8, border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <time dateTime={event.occurredAt} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{date}</time>
                <div>
                  <strong style={{ fontSize: 13 }}>{KIND_LABELS[event.kind]}</strong>
                  {event.sourceType === 'opportunity_listing' && <span className="muted" style={{ fontSize: 11, marginInlineStart: 6 }}>· Confirmed</span>}
                  {event.sourceType === 'candidate_input' && <span className="muted" style={{ fontSize: 11, marginInlineStart: 6 }}>· Candidate</span>}
                  {event.note && <div className="muted" style={{ fontSize: 12, marginBlockStart: 2 }}>{event.note}</div>}
                </div>
                <button className="btn" aria-label={`Delete ${KIND_LABELS[event.kind]} on ${date}`} style={{ fontSize: 11, padding: '2px 8px' }} disabled={deleting === event.id} onClick={() => deleteEvent(event.id)}>
                  {deleting === event.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
