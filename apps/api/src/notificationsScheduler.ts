import type { FastifyInstance } from 'fastify';
import { and, count, eq, gte, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import { db } from './db.js';
import { applicationEvents, applications, goals, notifications, notificationPreferences, users, workspaces } from '@careerflow/db';

const TICK_MS = 5 * 60 * 1000;
type NotificationKind = 'application_deadline' | 'follow_up_due' | 'interview_scheduled' | 'goal_reminder' | 'weekly_digest';

function partsAt(date: Date, timeZone: string): { hour: number; minute: number; day: string; weekday: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(date);
  }
  const value = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { hour: Number(value('hour')), minute: Number(value('minute')), day: `${value('year')}-${value('month')}-${value('day')}`, weekday: value('weekday') };
}

function withinQuietHours(start: string | null, end: string | null, now: Date, timezone: string): boolean {
  if (!start || !end) return false;
  const { hour, minute } = partsAt(now, timezone);
  const nowMin = hour * 60 + minute;
  const [sh = 0, sm = 0] = start.split(':').map(Number);
  const [eh = 0, em = 0] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return startMin <= endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin;
}

async function createIfAllowed(
  workspaceId: string,
  kind: NotificationKind,
  title: string,
  body: string,
  dueAt: Date | null,
  dedupeKey: string,
  payload: Record<string, unknown>,
  now: Date,
): Promise<boolean> {
  const [pref] = await db.select().from(notificationPreferences)
    .where(and(eq(notificationPreferences.workspaceId, workspaceId), eq(notificationPreferences.kind, kind))).limit(1);
  if (pref && !pref.enabled) return false;
  const [context] = await db.select({ timezone: users.timezone }).from(workspaces)
    .innerJoin(users, eq(users.id, workspaces.ownerId)).where(eq(workspaces.id, workspaceId)).limit(1);
  const timezone = context?.timezone || 'UTC';
  if (pref && withinQuietHours(pref.quietHoursStart, pref.quietHoursEnd, now, timezone)) return false;
  const inserted = await db.insert(notifications).values({ workspaceId, kind, title, body, dueAt, dedupeKey, payload })
    .onConflictDoNothing().returning({ id: notifications.id });
  return inserted.length > 0;
}

function mondayOfLocalWeek(localDay: string): string {
  const [y = 1970, m = 1, d = 1] = localDay.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export async function runNotificationsSchedulerTick(): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const weekSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const dueApps = await db.select({ id: applications.id, workspaceId: applications.workspaceId, dueDate: applications.dueDate, nextAction: applications.nextAction })
    .from(applications).where(and(isNotNull(applications.dueDate), gte(applications.dueDate, now), lte(applications.dueDate, soon), ne(applications.stage, 'closed')));
  for (const a of dueApps) {
    if (!a.dueDate) continue;
    await createIfAllowed(a.workspaceId, 'application_deadline', 'Application deadline approaching', a.nextAction ?? 'An application deadline is within the next 48 hours.', a.dueDate, `app_deadline:${a.id}:${a.dueDate.toISOString()}`, { applicationId: a.id }, now);
  }

  const events = await db.select({ id: applicationEvents.id, applicationId: applicationEvents.applicationId, workspaceId: applications.workspaceId, stage: applications.stage, kind: applicationEvents.kind, occurredAt: applicationEvents.occurredAt, note: applicationEvents.note })
    .from(applicationEvents).innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
    .where(and(inArray(applicationEvents.kind, ['interview_scheduled', 'follow_up']), gte(applicationEvents.occurredAt, now), lte(applicationEvents.occurredAt, soon), ne(applications.stage, 'closed')));
  for (const e of events) {
    const kind: NotificationKind = e.kind === 'follow_up' ? 'follow_up_due' : 'interview_scheduled';
    await createIfAllowed(e.workspaceId, kind, kind === 'follow_up_due' ? 'Follow-up coming up' : 'Interview coming up', e.note ?? (kind === 'follow_up_due' ? 'A follow-up is scheduled in the next 48 hours.' : 'You have an interview in the next 48 hours.'), e.occurredAt, `${kind}:${e.id}`, { applicationId: e.applicationId, eventId: e.id }, now);
  }

  const dueGoals = await db.select({ id: goals.id, workspaceId: goals.workspaceId, title: goals.title, targetDate: goals.targetDate })
    .from(goals).where(and(eq(goals.status, 'active'), isNotNull(goals.targetDate), gte(goals.targetDate, now), lte(goals.targetDate, soon)));
  for (const g of dueGoals) {
    if (!g.targetDate) continue;
    await createIfAllowed(g.workspaceId, 'goal_reminder', 'Goal coming up', g.title, g.targetDate, `goal:${g.id}:${g.targetDate.toISOString()}`, { goalId: g.id }, now);
  }

  const allWorkspaces = await db.select({ id: workspaces.id, timezone: users.timezone }).from(workspaces)
    .innerJoin(users, eq(users.id, workspaces.ownerId));
  for (const ws of allWorkspaces) {
    const local = partsAt(now, ws.timezone || 'UTC');
    if (local.weekday !== 'Mon' || local.hour < 9) continue;
    const weekStart = mondayOfLocalWeek(local.day);
    const [activeApps] = await db.select({ value: count() }).from(applications)
      .where(and(eq(applications.workspaceId, ws.id), ne(applications.stage, 'closed')));
    const [interviews] = await db.select({ value: count() }).from(applicationEvents)
      .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
      .where(and(eq(applications.workspaceId, ws.id), eq(applicationEvents.kind, 'interview_scheduled'), gte(applicationEvents.occurredAt, now), lte(applicationEvents.occurredAt, weekSoon)));
    const body = `You have ${Number(activeApps?.value ?? 0)} active applications and ${Number(interviews?.value ?? 0)} interviews scheduled in the next 7 days.`;
    await createIfAllowed(ws.id, 'weekly_digest', 'Your weekly career check-in', body, now, `weekly_digest:${weekStart}`, {}, now);
  }
}

export function startNotificationsScheduler(app: FastifyInstance): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runNotificationsSchedulerTick();
      app.log.info('notifications scheduler tick complete');
    } catch (error) {
      app.log.error({ err: error instanceof Error ? error.message : String(error) }, 'notifications scheduler tick failed');
    } finally { running = false; }
  };
  void tick();
  const handle = setInterval(() => { void tick(); }, TICK_MS);
  app.addHook('onClose', async () => clearInterval(handle));
}
