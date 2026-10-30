import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, lte, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import {
  users, sessions, workspaces, careerDirections, goals, profileVersions, experiences, educations, skills, certifications,
  evidenceItems, applications, applicationRequirements, requirementEvidenceLinks, applicationEvents, applicationCompensationNotes,
  interviewPreps, documents, documentVersions, cvImportSessions, growthGoals, growthEntries, notifications, notificationPreferences,
  consents, mehConversations, mehMessages, opportunities, opportunitySources, opportunityRequirements, dataExports,
  feedbackItems, subscriptions,
} from '@careerflow/db';
import { ChangePasswordInput, DeleteAccountInput, UpdateProfileInput } from '@careerflow/shared';
import { hashPassword, verifyPassword } from '../password.js';
import { createSession, destroySession, COOKIE } from '../session.js';
import { sendEmail, emailConfigured } from '../email.js';
import { getPaymentProvider } from '../paymentProvider.js';
import { putObject, getObject, deleteObject } from '../storage.js';

const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXPORT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
function exportKey(id: string): string { return `exports/${id}.json`; }

async function collectForUser(userId: string): Promise<Record<string, unknown>> {
  const userRow = (await db.select({
    id: users.id, email: users.email, displayName: users.displayName, timezone: users.timezone,
    locale: users.locale, createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!userRow) throw new Error('user_not_found');
  const workspacesOwned = await db.select({
    id: workspaces.id, name: workspaces.name, kind: workspaces.kind, createdAt: workspaces.createdAt,
  }).from(workspaces).where(eq(workspaces.ownerId, userId));
  const wsIds = workspacesOwned.map(w => w.id);
  const emptySharedCatalog = {
    note: 'These are shared catalog entries referenced by your applications, not records exclusively owned by you. Account deletion does not remove shared catalog entries.',
    opportunities: [], opportunityRequirements: [], opportunitySources: [],
  };
  if (!wsIds.length) {
    const feedback = await db.select().from(feedbackItems).where(eq(feedbackItems.userId, userId));
    return {
      exportVersion: '1.0', generatedAt: new Date().toISOString(), user: userRow, workspaces: [],
      careerDirections: [], goals: [], profileVersions: [], experiences: [], educations: [], skills: [], certifications: [],
      evidenceItems: [], applications: [], applicationRequirements: [], requirementEvidenceLinks: [], applicationEvents: [],
      applicationCompensationNotes: [], interviewPreps: [], documents: [], documentVersions: [], cvImports: [], growthGoals: [],
      growthEntries: [], notifications: [], notificationPreferences: [], consents: [], mehConversations: [], mehMessages: [],
      subscriptions: [], feedbackItems: feedback, sharedCatalogEntries: emptySharedCatalog,
      notes: 'Raw uploaded CV files are not included; parsed CV text and reviewed sections are included under cvImports.',
    };
  }

  const [dirs, goalsR, pvs, apps, docs, cvImports, growthGoalsR, growthEntriesR, notificationsR, notifPrefsR, consentsR, convs, evidenceR, subscriptionRows, feedbackRows] = await Promise.all([
    db.select().from(careerDirections).where(inArray(careerDirections.workspaceId, wsIds)),
    db.select().from(goals).where(inArray(goals.workspaceId, wsIds)),
    db.select().from(profileVersions).where(inArray(profileVersions.workspaceId, wsIds)),
    db.select().from(applications).where(inArray(applications.workspaceId, wsIds)),
    db.select().from(documents).where(inArray(documents.workspaceId, wsIds)),
    db.select().from(cvImportSessions).where(inArray(cvImportSessions.workspaceId, wsIds)),
    db.select().from(growthGoals).where(inArray(growthGoals.workspaceId, wsIds)),
    db.select().from(growthEntries).where(inArray(growthEntries.workspaceId, wsIds)),
    db.select().from(notifications).where(inArray(notifications.workspaceId, wsIds)),
    db.select().from(notificationPreferences).where(inArray(notificationPreferences.workspaceId, wsIds)),
    db.select().from(consents).where(inArray(consents.workspaceId, wsIds)),
    db.select().from(mehConversations).where(inArray(mehConversations.workspaceId, wsIds)),
    db.select().from(evidenceItems).where(inArray(evidenceItems.workspaceId, wsIds)),
    db.select().from(subscriptions).where(inArray(subscriptions.workspaceId, wsIds)),
    db.select().from(feedbackItems).where(eq(feedbackItems.userId, userId)),
  ]);
  const pvIds = pvs.map(p => p.id);
  const appIds = apps.map(a => a.id);
  const docIds = docs.map(d => d.id);
  const convIds = convs.map(c => c.id);
  const [expR, eduR, skillR, certR, appReqR, appEvtR, appCompR, docVerR, mehMsgR] = await Promise.all([
    pvIds.length ? db.select().from(experiences).where(inArray(experiences.profileVersionId, pvIds)) : [],
    pvIds.length ? db.select().from(educations).where(inArray(educations.profileVersionId, pvIds)) : [],
    pvIds.length ? db.select().from(skills).where(inArray(skills.profileVersionId, pvIds)) : [],
    pvIds.length ? db.select().from(certifications).where(inArray(certifications.profileVersionId, pvIds)) : [],
    appIds.length ? db.select().from(applicationRequirements).where(inArray(applicationRequirements.applicationId, appIds)) : [],
    appIds.length ? db.select().from(applicationEvents).where(inArray(applicationEvents.applicationId, appIds)) : [],
    appIds.length ? db.select().from(applicationCompensationNotes).where(inArray(applicationCompensationNotes.applicationId, appIds)) : [],
    docIds.length ? db.select().from(documentVersions).where(inArray(documentVersions.documentId, docIds)) : [],
    convIds.length ? db.select().from(mehMessages).where(inArray(mehMessages.conversationId, convIds)) : [],
  ]);
  const reqIds = appReqR.map(r => r.id);
  const reqLinks = reqIds.length ? await db.select().from(requirementEvidenceLinks).where(inArray(requirementEvidenceLinks.requirementId, reqIds)) : [];
  const myPreps = appIds.length ? await db.select().from(interviewPreps).where(inArray(interviewPreps.applicationId, appIds)) : [];
  const oppIds = [...new Set(apps.map(a => a.opportunityId).filter((x): x is string => !!x))];
  const [oppRows, oppReqRows] = oppIds.length ? await Promise.all([
    db.select().from(opportunities).where(inArray(opportunities.id, oppIds)),
    db.select().from(opportunityRequirements).where(inArray(opportunityRequirements.opportunityId, oppIds)),
  ]) : [[], []];
  const sourceIds = [...new Set(oppRows.map(o => o.sourceId))];
  const sourceRows = sourceIds.length ? await db.select().from(opportunitySources).where(inArray(opportunitySources.id, sourceIds)) : [];

  return {
    exportVersion: '1.0', generatedAt: new Date().toISOString(), user: userRow, workspaces: workspacesOwned,
    careerDirections: dirs, goals: goalsR, profileVersions: pvs, experiences: expR, educations: eduR, skills: skillR, certifications: certR,
    evidenceItems: evidenceR, applications: apps, applicationRequirements: appReqR, requirementEvidenceLinks: reqLinks,
    applicationEvents: appEvtR, applicationCompensationNotes: appCompR, interviewPreps: myPreps,
    documents: docs, documentVersions: docVerR,
    cvImports: cvImports.map(c => ({ id: c.id, workspaceId: c.workspaceId, filename: c.filename, mime: c.mime, status: c.status, rawText: c.rawText, sections: c.sections, error: c.error, createdAt: c.createdAt, parsedAt: c.parsedAt })),
    growthGoals: growthGoalsR, growthEntries: growthEntriesR, notifications: notificationsR,
    notificationPreferences: notifPrefsR, consents: consentsR, mehConversations: convs, mehMessages: mehMsgR,
    subscriptions: subscriptionRows, feedbackItems: feedbackRows,
    sharedCatalogEntries: { ...emptySharedCatalog, opportunities: oppRows, opportunityRequirements: oppReqRows, opportunitySources: sourceRows },
    notes: 'Raw uploaded CV files are not included; parsed CV text and reviewed sections are included under cvImports. Opportunity/source records are shared catalog entries, not your exclusively owned records.',
  };
}

async function cleanupExpiredExports(userId?: string, logError?: (error: unknown) => void): Promise<void> {
  const where = userId
    ? and(eq(dataExports.userId, userId), eq(dataExports.status, 'ready'), lte(dataExports.expiresAt, new Date()))
    : and(eq(dataExports.status, 'ready'), lte(dataExports.expiresAt, new Date()));
  const expired = await db.select({ id: dataExports.id, storageKey: dataExports.storageKey })
    .from(dataExports).where(where);
  for (const row of expired) {
    try {
      const expectedKey = exportKey(row.id);
      if (row.storageKey && row.storageKey !== expectedKey) throw new Error('unexpected_export_storage_key');
      if (row.storageKey) await deleteObject(row.storageKey);
      await db.update(dataExports).set({ status: 'expired', storageKey: null })
        .where(and(eq(dataExports.id, row.id), eq(dataExports.status, 'ready')));
    } catch (error) {
      logError?.(error);
    }
  }
}

async function deleteUserCascade(userId: string): Promise<string[]> {
  const ownedWsIds = (await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, userId))).map(r => r.id);
  const uploadRows = ownedWsIds.length
    ? await db.select({ workspaceId: cvImportSessions.workspaceId, storageKey: cvImportSessions.storageKey })
      .from(cvImportSessions).where(inArray(cvImportSessions.workspaceId, ownedWsIds))
    : [];
  const exportRows = await db.select({ id: dataExports.id, storageKey: dataExports.storageKey })
    .from(dataExports).where(eq(dataExports.userId, userId));
  const objectKeys = new Set<string>();
  for (const row of uploadRows) {
    if (row.storageKey.startsWith(`cv-imports/${row.workspaceId}/`)) objectKeys.add(row.storageKey);
  }
  for (const row of exportRows) {
    if (!row.storageKey || row.storageKey === exportKey(row.id)) {
      if (row.storageKey) objectKeys.add(row.storageKey);
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(feedbackItems).set({ userId: null, workspaceId: null })
      .where(eq(feedbackItems.userId, userId));
    const deleted = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    if (!deleted.length) throw new Error('user_delete_failed');
  });

  const warnings: string[] = [];
  for (const key of objectKeys) {
    try { await deleteObject(key); }
    catch { warnings.push('storage_cleanup_failed'); }
  }
  return warnings;
}

export async function registerSettings(app: FastifyInstance): Promise<void> {
  const cleanupTimer = setInterval(() => {
    void cleanupExpiredExports(undefined, error => app.log.error({ err: error }, 'Expired export cleanup failed'));
  }, EXPORT_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/', async (req) => {
    const row = (await db.select({ id: users.id, email: users.email, displayName: users.displayName, timezone: users.timezone, locale: users.locale, createdAt: users.createdAt })
      .from(users).where(eq(users.id, req.user!.id)).limit(1))[0];
    return { user: row, emailConfigured: emailConfigured(), paymentProvider: getPaymentProvider().name };
  });

  app.patch('/', async (req) => {
    const body = UpdateProfileInput.parse(req.body);
    await db.update(users).set({
      ...(body.displayName !== undefined ? { displayName: body.displayName ?? null } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
    }).where(eq(users.id, req.user!.id));
    return { ok: true };
  });

  app.post('/password', async (req, reply) => {
    const body = ChangePasswordInput.parse(req.body);
    const row = (await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, req.user!.id)).limit(1))[0];
    if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) return reply.code(401).send({ error: 'invalid_password' });
    await db.update(users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(users.id, req.user!.id));
    if (req.sessionId) await db.delete(sessions).where(and(eq(sessions.userId, req.user!.id), ne(sessions.id, req.sessionId)));
    return { ok: true };
  });

  app.post('/export', async (req, reply) => {
    const userId = req.user!.id;
    const id = randomUUID();
    const key = exportKey(id);
    await db.insert(dataExports).values({ id, userId, status: 'pending', expiresAt: new Date(Date.now() + EXPORT_TTL_MS) });
    try {
      const data = await collectForUser(userId);
      await putObject(key, Buffer.from(JSON.stringify(data, null, 2), 'utf8'), 'application/json');
      const updated = await db.update(dataExports).set({ status: 'ready', storageKey: key, readyAt: new Date() })
        .where(and(eq(dataExports.id, id), eq(dataExports.userId, userId))).returning({ id: dataExports.id });
      if (!updated.length) {
        await deleteObject(key);
        return reply.code(409).send({ error: 'export_cancelled' });
      }
      if (emailConfigured()) {
        await sendEmail(req.user!.email, 'Your CareerFlow data export is ready', 'Your requested export is ready in Settings and will expire in 7 days.')
          .catch(error => app.log.error({ err: error }, 'Transactional export email failed'));
      }
      return reply.code(201).send({ exportId: id, status: 'ready' });
    } catch (error) {
      await deleteObject(key).catch(() => undefined);
      await db.update(dataExports).set({ status: 'failed', error: 'export_failed' }).where(eq(dataExports.id, id));
      app.log.error({ err: error }, 'Data export generation failed');
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  app.get('/exports', async (req) => {
    await cleanupExpiredExports(req.user!.id, error => app.log.error({ err: error }, 'User export cleanup failed'));
    const rows = await db.select({ id: dataExports.id, status: dataExports.status, requestedAt: dataExports.requestedAt, readyAt: dataExports.readyAt, downloadedAt: dataExports.downloadedAt, expiresAt: dataExports.expiresAt })
      .from(dataExports).where(eq(dataExports.userId, req.user!.id));
    return { exports: rows };
  });

  app.get('/export/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = (await db.select().from(dataExports).where(and(eq(dataExports.id, id), eq(dataExports.userId, req.user!.id))).limit(1))[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!row.expiresAt || row.expiresAt.getTime() <= Date.now()) {
      await cleanupExpiredExports(req.user!.id, error => app.log.error({ err: error }, 'Expired export cleanup failed'));
      return reply.code(410).send({ error: 'expired' });
    }
    if (row.status !== 'ready' || !row.storageKey) return reply.code(409).send({ error: 'not_ready' });
    if (row.storageKey !== exportKey(row.id)) return reply.code(404).send({ error: 'not_found' });
    try {
      const data = await getObject(row.storageKey);
      await db.update(dataExports).set({ downloadedAt: new Date() }).where(and(eq(dataExports.id, id), eq(dataExports.userId, req.user!.id)));
      reply.header('content-type', 'application/json; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="careerflow-export-${id}.json"`);
      return reply.send(data);
    } catch {
      return reply.code(410).send({ error: 'file_missing' });
    }
  });

  app.post('/delete', async (req, reply) => {
    const body = DeleteAccountInput.parse(req.body);
    const row = (await db.select({ email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.id, req.user!.id)).limit(1))[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!(await verifyPassword(body.password, row.passwordHash))) return reply.code(401).send({ error: 'invalid_password' });
    if (body.confirmEmail.toLowerCase() !== row.email.toLowerCase()) return reply.code(400).send({ error: 'confirm_mismatch' });
    const cleanupWarnings = await deleteUserCascade(req.user!.id);
    const raw = req.cookies[COOKIE.name];
    if (raw) await destroySession(raw).catch(() => undefined);
    reply.clearCookie(COOKIE.name, { path: '/' });
    return { ok: true, message: 'Account and associated records have been deleted.', cleanupWarnings };
  });
}
