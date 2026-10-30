import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull, desc } from 'drizzle-orm';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { applications, workspaces, employerInvitations } from '@careerflow/db';
import { sendEmail, emailConfigured } from '../email.js';
import { env } from '../env.js';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function trustedCandidateOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.APP_URL).origin; }
  catch { return false; }
}

const CreateInput = z.object({
  employerEmail: z.string().email().toLowerCase().max(254),
});

async function ownsApplication(appId: string, userId: string) {
  const rows = await db.select({ id: applications.id, workspaceId: applications.workspaceId })
    .from(applications).where(eq(applications.id, appId)).limit(1);
  if (!rows[0]) return null;
  const ws = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, rows[0].workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return ws[0] ? rows[0] : null;
}

export async function registerApplicationInvitations(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/:applicationId/invitations', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    if (!(await ownsApplication(applicationId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select({
      id: employerInvitations.id,
      employerEmail: employerInvitations.employerEmail,
      expiresAt: employerInvitations.expiresAt,
      usedAt: employerInvitations.usedAt,
      revokedAt: employerInvitations.revokedAt,
      createdAt: employerInvitations.createdAt,
    }).from(employerInvitations)
      .where(eq(employerInvitations.applicationId, applicationId))
      .orderBy(desc(employerInvitations.createdAt));
    return { invitations: rows };
  });

  app.post('/:applicationId/invitations', async (req, reply) => {
    if (!trustedCandidateOrigin(req.headers.origin)) return reply.code(403).send({ error: 'invalid_origin' });
    const { applicationId } = req.params as { applicationId: string };
    if (!(await ownsApplication(applicationId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = CreateInput.parse(req.body);

    // Only one active invitation per (application, email)
    const existing = await db.select({ id: employerInvitations.id }).from(employerInvitations)
      .where(and(
        eq(employerInvitations.applicationId, applicationId),
        eq(employerInvitations.employerEmail, body.employerEmail),
        isNull(employerInvitations.revokedAt),
        isNull(employerInvitations.usedAt),
        gt(employerInvitations.expiresAt, new Date()),
      )).limit(1);
    if (existing[0]) return reply.code(409).send({ error: 'invitation_already_pending' });

    const raw = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const row = (await db.insert(employerInvitations).values({
      applicationId,
      employerEmail: body.employerEmail,
      tokenHash,
      expiresAt,
    }).returning({ id: employerInvitations.id, expiresAt: employerInvitations.expiresAt }))[0]!;

    const acceptUrl = `${env.EMPLOYER_URL}/accept#token=${encodeURIComponent(raw)}`;
    let emailResult: { ok: boolean; error?: string } = { ok: false, error: 'email_not_configured' };
    if (emailConfigured()) {
      emailResult = await sendEmail(
        body.employerEmail,
        'A candidate has invited you to review their CareerFlow application',
        `A candidate has invited you to review their application materials.\n\nOpen: ${acceptUrl}\n\nThis link expires ${expiresAt.toUTCString()} and can be used once.`,
      );
    }

    return reply.code(201).send({
      invitation: row,
      // In dev without email, return the URL so the candidate can copy/share it.
      ...(emailConfigured() ? {} : { invitationUrl: acceptUrl }),
      emailResult,
    });
  });

  app.delete('/:applicationId/invitations/:invitationId', async (req, reply) => {
    if (!trustedCandidateOrigin(req.headers.origin)) return reply.code(403).send({ error: 'invalid_origin' });
    const { applicationId, invitationId } = req.params as { applicationId: string; invitationId: string };
    if (!(await ownsApplication(applicationId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.update(employerInvitations).set({ revokedAt: new Date() })
      .where(and(
        eq(employerInvitations.id, invitationId),
        eq(employerInvitations.applicationId, applicationId),
        isNull(employerInvitations.revokedAt),
      )).returning({ id: employerInvitations.id });
    if (!rows.length) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
