import { z } from 'zod';

export const NOTIFICATION_KINDS = [
  'application_deadline', 'follow_up_due', 'interview_scheduled',
  'goal_reminder', 'weekly_digest',
] as const;
export type NotificationKind = typeof NOTIFICATION_KINDS[number];

const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const NotificationPreferencesInput = z.object({
  prefs: z.array(z.object({
    kind: z.enum(NOTIFICATION_KINDS),
    enabled: z.boolean(),
    quietHoursStart: clockTime.nullable().optional(),
    quietHoursEnd: clockTime.nullable().optional(),
  }).superRefine((pref, ctx) => {
    const hasStart = pref.quietHoursStart != null && pref.quietHoursStart !== '';
    const hasEnd = pref.quietHoursEnd != null && pref.quietHoursEnd !== '';
    if (hasStart !== hasEnd) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Set both quiet-hour times or neither.' });
  })),
});
export type NotificationPreferencesInput = z.infer<typeof NotificationPreferencesInput>;
