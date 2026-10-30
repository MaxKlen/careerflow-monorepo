import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { employerInvitations, applications, opportunities } from '@careerflow/db';
import { env } from '../env.js';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function trustedEmployerOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.EMPLOYER_URL).origin; }
  catch { return false; }
}

const TokenInput = z.object({ token: z.string().min(20).max(200) });

export async function registerEmployerInvitations(app: FastifyInstance): Promise<void> {
  // The bearer token is accepted only in POST JSON bodies, never in a URL/path.
  app.post('/preview', async (req, reply) => {
    const parsed = TokenInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_token' });
    const tokenHash = hashToken(parsed.data.token);
    const rows = await db.select({
      employerEmail: employerInvitations.employerEmail,
      expiresAt: employerInvitations.expiresAt,
      usedAt: employerInvitations.usedAt,
      revokedAt: employerInvitations.revokedAt,
      opportunityTitle: opportunities.title,
      opportunityCompany: opportunities.company,
    }).from(employerInvitations)
      .leftJoin(applications, eq(applications.id, employerInvitations.applicationId))
      .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(eq(employerInvitations.tokenHash, tokenHash))
      .limit(1);
    const inv = rows[0];
    if (!inv) return reply.code(404).send({ error: 'not_found' });
    if (inv.revokedAt) return reply.code(410).send({ error: 'revoked' });
    if (inv.usedAt) return reply.code(410).send({ error: 'already_used' });
    if (inv.expiresAt.getTime() <= Date.now()) return reply.code(410).send({ error: 'expired' });
    return { invitation: {
      employerEmail: inv.employerEmail,
      expiresAt: inv.expiresAt,
      opportunityTitle: inv.opportunityTitle,
      opportunityCompany: inv.opportunityCompany,
    } };
  });

  app.post('/accept', async (req, reply) => {
    if (!req.employer) return reply.code(401).send({ error: 'unauthenticated' });
    if (!trustedEmployerOrigin(req.headers.origin)) return reply.code(403).send({ error: 'invalid_origin' });
    const parsed = TokenInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_token' });
    const rows = await db.select().from(employerInvitations)
      .where(eq(employerInvitations.tokenHash, hashToken(parsed.data.token))).limit(1);
    const inv = rows[0];
    if (!inv) return reply.code(404).send({ error: 'not_found' });
    if (inv.revokedAt) return reply.code(410).send({ error: 'revoked' });
    if (inv.expiresAt.getTime() <= Date.now()) return reply.code(410).send({ error: 'expired' });
    if (inv.employerEmail.toLowerCase() !== req.employer.email.toLowerCase()) {
      return reply.code(403).send({ error: 'invited_email_mismatch' });
    }
    if (inv.employerUserId && inv.employerUserId !== req.employer.id) {
      return reply.code(409).send({ error: 'belongs_to_other_employer' });
    }
    if (!inv.employerUserId) {
      const claimed = await db.update(employerInvitations).set({
        employerUserId: req.employer.id,
        usedAt: inv.usedAt ?? new Date(),
      }).where(and(
        eq(employerInvitations.id, inv.id),
        isNull(employerInvitations.employerUserId),
        isNull(employerInvitations.usedAt),
        isNull(employerInvitations.revokedAt),
        gt(employerInvitations.expiresAt, new Date()),
      )).returning({ id: employerInvitations.id });
      if (!claimed.length) return reply.code(404).send({ error: 'not_found' });
    }
    return { ok: true, applicationId: inv.applicationId };
  });
}
