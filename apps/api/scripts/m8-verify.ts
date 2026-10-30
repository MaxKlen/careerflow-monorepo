import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db.js';
import { hashPassword } from '../src/password.js';
import { createSession } from '../src/session.js';
import { createAdminSession } from '../src/adminSession.js';
import { runNotificationsSchedulerTick } from '../src/notificationsScheduler.js';
import { env } from '../src/env.js';
import { adminSessions, adminUsers, applicationEvents, applications, featureFlags, notificationPreferences, notifications, sessions, users, workspaces } from '@careerflow/db';

const API = process.env.API_URL || `http://localhost:${env.PORT}`;
const ADMIN_ORIGIN = new URL(env.ADMIN_URL).origin;
type Call = { status: number; text: string; headers: Headers };
async function call(path: string, options: { method?: string; cookie?: string; origin?: string; body?: unknown } = {}): Promise<Call> {
  const headers = new Headers();
  if (options.cookie) headers.set('cookie', options.cookie);
  if (options.origin) headers.set('origin', options.origin);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${API}${path}`, { method: options.method ?? 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, text: await response.text(), headers: response.headers };
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function json(response: Call): any { try { return JSON.parse(response.text); } catch { return {}; } }
function cookieFrom(response: Call, name: string): string {
  const value = response.headers.get('set-cookie') ?? '';
  const match = value.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
  assert(match, `missing ${name} Set-Cookie`);
  return `${name}=${match[1]}`;
}
function tomorrow(): Date { return new Date(Date.now() + 24 * 60 * 60 * 1000); }

async function main() {
  try {
    const health = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) throw new Error(`health HTTP ${health.status}`);
  } catch {
    console.log(`SKIP M8 authenticated verification: API unavailable at ${API}`);
    await pool.end();
    return;
  }
  const suffix = randomUUID();
  const candidateEmail = `m8-candidate-${suffix}@test.local`;
  const otherEmail = `m8-other-${suffix}@test.local`;
  const adminEmail = `m8-admin-${suffix}@test.local`;
  const contenderEmail = `m8-admin-contender-${suffix}@test.local`;
  const supportEmail = `m8-support-${suffix}@test.local`;
  const adminPassword = `A-${randomUUID()}-${randomUUID()}!`;
  const contenderPassword = `B-${randomUUID()}-${randomUUID()}!`;
  const candidateId = randomUUID(); const otherId = randomUUID();
  const candidateWorkspaceId = randomUUID(); const otherWorkspaceId = randomUUID();
  const applicationId = randomUUID(); const suppressedApplicationId = randomUUID();
  const firstEventId = randomUUID(); const suppressedEventId = randomUUID();
  const featureKey = `m8_test_${suffix.replaceAll('-', '_')}`;
  let adminId: string | null = null; let supportId: string | null = null;
  let adminCookie = ''; let candidateCookie = ''; let otherCookie = '';
  let supportCookie = '';
  const checks: string[] = [];
  try {
    const adminCheck = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    assert(adminCheck.length === 0, 'Existing admin account found; preserving it and skipping bootstrap test.');

    const candidateHash = await hashPassword(`synthetic-${randomUUID()}-not-used`);
    const otherHash = await hashPassword(`synthetic-${randomUUID()}-not-used`);
    await db.insert(users).values([
      { id: candidateId, email: candidateEmail, passwordHash: candidateHash, displayName: 'M8 Synthetic Candidate', timezone: 'UTC' },
      { id: otherId, email: otherEmail, passwordHash: otherHash, displayName: 'M8 Other Synthetic', timezone: 'UTC' },
    ]);
    await db.insert(workspaces).values([
      { id: candidateWorkspaceId, ownerId: candidateId, name: 'M8 Synthetic Workspace', kind: 'personal' },
      { id: otherWorkspaceId, ownerId: otherId, name: 'M8 Other Workspace', kind: 'personal' },
    ]);
    const candidateRaw = await createSession(candidateId, 'M8 verification');
    const otherRaw = await createSession(otherId, 'M8 verification');
    candidateCookie = `cf_session=${candidateRaw}`; otherCookie = `cf_session=${otherRaw}`;
    checks.push('synthetic candidate and separate sessions created');

    await db.insert(applications).values([
      { id: applicationId, workspaceId: candidateWorkspaceId, stage: 'interviewing', nextAction: 'M8 synthetic interview' },
      { id: suppressedApplicationId, workspaceId: candidateWorkspaceId, stage: 'interviewing', nextAction: 'M8 preference suppression test' },
    ]);
    const eventAt = tomorrow();
    await db.insert(applicationEvents).values([
      { id: firstEventId, applicationId, kind: 'interview_scheduled', occurredAt: eventAt, note: 'M8 Synthetic Interview Title', createdBy: candidateId },
    ]);
    await db.insert(notificationPreferences).values({ workspaceId: candidateWorkspaceId, kind: 'interview_scheduled', enabled: true });
    await db.insert(notificationPreferences).values({ workspaceId: candidateWorkspaceId, kind: 'application_deadline', enabled: false });
    await runNotificationsSchedulerTick();
    await runNotificationsSchedulerTick();
    let matching = await db.select().from(notifications).where(and(eq(notifications.workspaceId, candidateWorkspaceId), eq(notifications.dedupeKey, `interview_scheduled:${firstEventId}`)));
    assert(matching.length === 1, `expected one deduplicated interview notification, found ${matching.length}`);
    checks.push('scheduler creates one deduplicated notification for tomorrow’s interview');

    const disabledPref = await call(`/notifications/${candidateWorkspaceId}/preferences`, { method: 'PUT', cookie: candidateCookie, body: { prefs: [{ kind: 'interview_scheduled', enabled: false }] } });
    assert(disabledPref.status === 200, `preference save returned ${disabledPref.status}`);
    await db.insert(applicationEvents).values({ id: suppressedEventId, applicationId: suppressedApplicationId, kind: 'interview_scheduled', occurredAt: new Date(eventAt.getTime() + 60_000), note: 'M8 Suppressed Interview', createdBy: candidateId });
    await runNotificationsSchedulerTick();
    matching = await db.select().from(notifications).where(and(eq(notifications.workspaceId, candidateWorkspaceId), eq(notifications.dedupeKey, `interview_scheduled:${suppressedEventId}`)));
    assert(matching.length === 0, 'disabled notification preference was not respected');
    const savedPrefs = await call(`/notifications/${candidateWorkspaceId}/preferences`, { cookie: candidateCookie });
    assert(json(savedPrefs).preferences?.interview_scheduled?.enabled === false, 'saved preferences did not round-trip');
    checks.push('preference save/load works and disabled reminders are suppressed');

    const list = await call(`/notifications/${candidateWorkspaceId}?unread=1`, { cookie: candidateCookie });
    assert(list.status === 200 && json(list).notifications?.length === 1, `notification list returned ${list.status}`);
    const notificationId = json(list).notifications[0].id;
    const marked = await call(`/notifications/${candidateWorkspaceId}/${notificationId}/read`, { method: 'POST', cookie: candidateCookie, body: {} });
    assert(marked.status === 200, `mark read returned ${marked.status}`);
    const readRow = await db.select().from(notifications).where(eq(notifications.id, notificationId));
    assert(!!readRow[0]?.readAt, 'mark read did not persist');
    checks.push('authenticated notification list and mark-read work');

    const crossWorkspace = await call(`/notifications/${candidateWorkspaceId}`, { cookie: otherCookie });
    assert(crossWorkspace.status === 404, `other user read workspace notifications (${crossWorkspace.status})`);
    const crossPrefs = await call(`/notifications/${candidateWorkspaceId}/preferences`, { cookie: otherCookie });
    assert(crossPrefs.status === 404, `other user read workspace preferences (${crossPrefs.status})`);
    const crossRead = await call(`/notifications/${candidateWorkspaceId}/${notificationId}/read`, { method: 'POST', cookie: otherCookie, body: {} });
    assert(crossRead.status === 404, `other user marked notification read (${crossRead.status})`);
    checks.push('notification workspace isolation blocks another candidate');

    const calendar = await call(`/calendar/applications/${applicationId}.ics`, { cookie: candidateCookie });
    assert(calendar.status === 200, `calendar export returned ${calendar.status}: ${calendar.text.slice(0, 160)}`);
    assert((calendar.headers.get('content-type') ?? '').includes('text/calendar'), 'calendar response content type is not text/calendar');
    const dtstart = eventAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    assert(calendar.text.includes(`DTSTART:${dtstart}`), 'calendar export has the wrong event date');
    assert(calendar.text.includes('SUMMARY:Interview scheduled'), 'calendar export has the wrong event title');
    assert(calendar.text.endsWith('\r\n'), 'calendar file is missing final CRLF');
    const crossCalendar = await call(`/calendar/applications/${applicationId}.ics`, { cookie: otherCookie });
    assert(crossCalendar.status === 404, 'another candidate downloaded an application calendar');
    checks.push('authenticated per-application ICS has correct date/title and ownership guard');

    const bootstrapResults = await Promise.all([
      call('/admin/auth/signup', { method: 'POST', origin: ADMIN_ORIGIN, body: { email: adminEmail, password: adminPassword, displayName: 'M8 Synthetic Admin' } }),
      call('/admin/auth/signup', { method: 'POST', origin: ADMIN_ORIGIN, body: { email: contenderEmail, password: contenderPassword, displayName: 'M8 Synthetic Contender' } }),
    ]);
    const winnerIndex = bootstrapResults.findIndex(result => result.status === 200);
    assert(winnerIndex >= 0 && bootstrapResults.filter(result => result.status === 403).length === 1, `concurrent admin bootstrap results were ${bootstrapResults.map(result => result.status).join(',')}`);
    const winningEmail = winnerIndex === 0 ? adminEmail : contenderEmail;
    const winningPassword = winnerIndex === 0 ? adminPassword : contenderPassword;
    const signup = bootstrapResults[winnerIndex];
    adminId = json(signup).admin?.id;
    assert(adminId, 'bootstrap response omitted admin id');
    adminCookie = cookieFrom(signup, 'cf_admin_session');
    const signin = await call('/admin/auth/signin', { method: 'POST', origin: ADMIN_ORIGIN, body: { email: winningEmail, password: winningPassword } });
    assert(signin.status === 200, `admin signin returned ${signin.status}`);
    adminCookie = cookieFrom(signin, 'cf_admin_session');
    const dashboard = await call('/admin/dashboard', { cookie: adminCookie });
    assert(dashboard.status === 200 && Number(json(dashboard).totals?.users) >= 2, `admin dashboard failed (${dashboard.status})`);
    const candidateIntoAdmin = await call('/admin/dashboard', { cookie: candidateCookie });
    const adminIntoCandidate = await call('/auth/me', { cookie: adminCookie });
    assert(candidateIntoAdmin.status === 401 && adminIntoCandidate.status === 401, 'candidate/admin cookies crossed identity domains');
    checks.push('concurrent first-admin bootstrap creates one owner; scrypt signin, live dashboard, and distinct identity cookies work');

    const lookup = await call(`/admin/users?q=${encodeURIComponent(candidateEmail)}`, { cookie: adminCookie });
    assert(lookup.status === 200, `metadata lookup returned ${lookup.status}`);
    const found = json(lookup).users?.[0];
    assert(found?.email === candidateEmail, 'synthetic candidate was not found');
    const allowedKeys = ['createdAt', 'displayName', 'email', 'id', 'timezone'].sort();
    assert(JSON.stringify(Object.keys(found).sort()) === JSON.stringify(allowedKeys), `lookup exposed unexpected fields: ${Object.keys(found).join(',')}`);
    const auditResponse = await call('/admin/audit-log', { cookie: adminCookie });
    const entries = json(auditResponse).entries ?? [];
    for (const action of ['admin.signup', 'admin.signin', 'admin.view_dashboard', 'admin.lookup_user']) assert(entries.some((entry: any) => entry.action === action), `missing audit action ${action}`);
    assert(!entries.some((entry: any) => JSON.stringify(entry.metadata).includes(candidateEmail)), 'audit log retained the raw candidate email search');
    checks.push('user lookup is metadata-only and every lookup is audit-logged without raw query text');

    const flag = await call('/admin/feature-flags', { method: 'PUT', cookie: adminCookie, origin: ADMIN_ORIGIN, body: { key: featureKey, enabled: true, description: 'temporary M8 verification flag' } });
    assert(flag.status === 200, `owner feature flag update returned ${flag.status}`);
    const csrf = await call('/admin/feature-flags', { method: 'PUT', cookie: adminCookie, origin: new URL(env.APP_URL).origin, body: { key: `${featureKey}_csrf`, enabled: true } });
    assert(csrf.status === 403, `cross-origin admin mutation was not blocked (${csrf.status})`);
    const supportHash = await hashPassword(`synthetic-${randomUUID()}-not-used`);
    const insertedSupport = await db.insert(adminUsers).values({ email: supportEmail, passwordHash: supportHash, displayName: 'M8 Temporary Support', role: 'support' }).returning({ id: adminUsers.id });
    supportId = insertedSupport[0]!.id;
    const supportRaw = await createAdminSession(supportId, 'M8 verification'); supportCookie = `cf_admin_session=${supportRaw}`;
    const deniedFlag = await call('/admin/feature-flags', { method: 'PUT', cookie: supportCookie, origin: ADMIN_ORIGIN, body: { key: featureKey, enabled: false } });
    assert(deniedFlag.status === 403, `non-owner changed feature flag (${deniedFlag.status})`);
    checks.push('owner-only flag mutation and admin-origin boundary are enforced');

    const wrongStatuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await call('/admin/auth/signin', { method: 'POST', origin: ADMIN_ORIGIN, body: { email: adminEmail, password: process.env.M8_WRONG_PASSWORD } });
      wrongStatuses.push(response.status);
    }
    assert(wrongStatuses.slice(0, 5).every(status => status === 401) && wrongStatuses[5] === 429, `admin signin rate limit unexpected: ${wrongStatuses.join(',')}`);
    checks.push('admin signin rate-limits repeated failures');

    const signout = await call('/admin/auth/signout', { method: 'POST', cookie: adminCookie, origin: ADMIN_ORIGIN, body: {} });
    assert(signout.status === 200, `admin signout returned ${signout.status}`);
    const afterSignout = await call('/admin/auth/me', { cookie: adminCookie });
    assert(afterSignout.status === 401, 'admin session survived signout');
    checks.push('admin signout revokes its session');

    for (const check of checks) console.log(`  PASS ${check}`);
    console.log('\nM8 authenticated verification: PASS');
  } finally {
    // Preserve audit entries as evidence; remove only M8-created principals, sessions, flags, and candidate data.
    if (featureKey) await db.delete(featureFlags).where(eq(featureFlags.key, featureKey)).catch(() => undefined);
    if (supportId) {
      await db.delete(adminSessions).where(eq(adminSessions.adminUserId, supportId)).catch(() => undefined);
      await db.delete(adminUsers).where(eq(adminUsers.id, supportId)).catch(() => undefined);
    }
    if (adminId) {
      await db.delete(adminSessions).where(eq(adminSessions.adminUserId, adminId)).catch(() => undefined);
      await db.delete(adminUsers).where(eq(adminUsers.id, adminId)).catch(() => undefined);
    }
    await db.delete(workspaces).where(and(eq(workspaces.id, candidateWorkspaceId), eq(workspaces.ownerId, candidateId))).catch(() => undefined);
    await db.delete(workspaces).where(and(eq(workspaces.id, otherWorkspaceId), eq(workspaces.ownerId, otherId))).catch(() => undefined);
    await db.delete(sessions).where(eq(sessions.userId, candidateId)).catch(() => undefined);
    await db.delete(sessions).where(eq(sessions.userId, otherId)).catch(() => undefined);
    await db.delete(users).where(eq(users.id, candidateId)).catch(() => undefined);
    await db.delete(users).where(eq(users.id, otherId)).catch(() => undefined);
    await pool.end();
  }
}

main().catch(error => { console.error(`M8 verification failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
