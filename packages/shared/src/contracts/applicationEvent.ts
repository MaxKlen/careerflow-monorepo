import { z } from 'zod';

export const APPLICATION_EVENT_KINDS = [
  'note',
  'submission_recorded',
  'submission_confirmed',
  'interview_scheduled',
  'interview_completed',
  'follow_up',
  'offer_received',
  'offer_declined',
  'closed',
] as const;

export type ApplicationEventKind = typeof APPLICATION_EVENT_KINDS[number];

const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Expected a real calendar date');

export const CreateApplicationEventInput = z.object({
  kind: z.enum(APPLICATION_EVENT_KINDS),
  occurredAt: dateOnly,
  note: z.string().max(2000).optional(),
});

export type CreateApplicationEventInput = z.infer<typeof CreateApplicationEventInput>;
