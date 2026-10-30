import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { applications, applicationEvents, workspaces } from '@careerflow/db';

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function foldLine(line: string): string {
  let result = '';
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > 75) { result += '\r\n '; bytes = 1; }
    result += character;
    bytes += size;
  }
  return result;
}
function toIcsDate(value: Date): string { return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
const TITLES: Record<string, string> = {
  note: 'Application note', submission_recorded: 'Application submitted', submission_confirmed: 'Submission confirmed',
  interview_scheduled: 'Interview scheduled', interview_completed: 'Interview completed', follow_up: 'Follow-up',
  offer_received: 'Offer received', offer_declined: 'Offer declined', closed: 'Application closed',
};

export async function registerCalendarExport(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/applications/:id.ics', async (req, reply) => {
    const parsed = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_application_id' });
    const id = parsed.data;
    const rows = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
    const application = rows[0];
    if (!application) return reply.code(404).send({ error: 'not_found' });
    const owned = await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, application.workspaceId), eq(workspaces.ownerId, req.user!.id))).limit(1);
    if (!owned[0]) return reply.code(404).send({ error: 'not_found' });
    const events = await db.select({ id: applicationEvents.id, kind: applicationEvents.kind, occurredAt: applicationEvents.occurredAt, note: applicationEvents.note })
      .from(applicationEvents).where(eq(applicationEvents.applicationId, id)).orderBy(asc(applicationEvents.occurredAt));
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerFlow//Application Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const event of events) {
      lines.push('BEGIN:VEVENT', `UID:${event.id}@careerflow.local`, `DTSTAMP:${toIcsDate(new Date())}`, `DTSTART:${toIcsDate(new Date(event.occurredAt))}`, `SUMMARY:${icsEscape(TITLES[event.kind] ?? 'Application event')}`, `DESCRIPTION:${icsEscape(event.note ?? '')}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    reply.header('content-type', 'text/calendar; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="application-${id}.ics"`);
    return lines.map(foldLine).join('\r\n') + '\r\n';
  });
}
