import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { employerUsers, employerInvitations } from '@careerflow/db';
import { hashPassword, verifyPassword } from '../password.js';
import { EMPLOYER_COOKIE, createEmployerSession, destroyEmployerSession } from '../employerSession.js';
import { env } from '../env.js';

function hashInvitationToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function trustedEmployerOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.EMPLOYER_URL).origin; }
  catch { return false; }
}

const SignupInput = z.object({
  email: z.string().email().toLowerCase().max(254),
  password: z.string().min(10).max(200),
  companyName: z.string().trim().min(1).max(200),
  invitationToken: z.string().min(20).max(200),
});

const SigninInput = z.object({
  email: z.string().email().toLowerCase().max(254),
  password: z.string().min(1).max(200),
});

export async function registerEmployerAuth(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'POST' && !trustedEmployerOrigin(req.headers.origin)) {
      return reply.code(403).send({ error: 'invalid_origin' });
    }
  });
  // POST /employer/auth/signup — requires a valid, unused, unexpired invitation token.
  app.post('/signup', async (req, reply) => {
    const body = SignupInput.parse(req.body);
    const tokenHash = hashInvitationToken(body.invitationToken);
    const invitation = (await db.select().from(employerInvitations)
      .where(and(
        eq(employerInvitations.tokenHash, tokenHash),
        isNull(employerInvitations.usedAt),
        isNull(employerInvitations.revokedAt),
        gt(employerInvitations.expiresAt, new Date()),
      )).limit(1))[0];
    if (!invitation) return reply.code(400).send({ error: 'invalid_invitation' });
    if (invitation.employerEmail.toLowerCase() !== body.email.toLowerCase()) {
      return reply.code(400).send({ error: 'email_mismatch', message: 'Use the email address this invitation was sent to.' });
    }

    // Atomic: create employer + mark invitation used, all in one transaction
    let employerRow: { id: string; email: string; companyName: string | null } | undefined;
    try {
      await db.transaction(async (tx) => {
        const inserted = await tx.insert(employerUsers).values({
          email: body.email,
          passwordHash: await hashPassword(body.password),
          companyName: body.companyName,
        }).returning({ id: employerUsers.id, email: employerUsers.email, companyName: employerUsers.companyName });
        employerRow = inserted[0];
        if (!employerRow) throw new Error('employer_insert_failed');

        const claimed = await tx.update(employerInvitations).set({
          usedAt: new Date(),
          employerUserId: employerRow.id,
        }).where(and(
          eq(employerInvitations.id, invitation.id),
          isNull(employerInvitations.usedAt),
          isNull(employerInvitations.revokedAt),
          gt(employerInvitations.expiresAt, new Date()),
        )).returning({ id: employerInvitations.id });
        if (!claimed.length) throw new Error('invitation_already_used');
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'invitation_already_used') return reply.code(409).send({ error: 'invitation_already_used' });
      if (msg.includes('duplicate') || msg.includes('unique')) return reply.code(409).send({ error: 'employer_email_taken' });
      throw e;
    }

    const raw = await createEmployerSession(employerRow!.id, req.headers['user-agent'] ?? null);
    reply.setCookie(EMPLOYER_COOKIE.name, raw, EMPLOYER_COOKIE.options(env.NODE_ENV === 'production'));
    return { employer: employerRow };
  });

  app.post('/signin', async (req, reply) => {
    const body = SigninInput.parse(req.body);
    const rows = await db.select().from(employerUsers).where(eq(employerUsers.email, body.email)).limit(1);
    if (!rows[0] || !(await verifyPassword(body.password, rows[0].passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    await db.update(employerUsers).set({ lastSignInAt: new Date() }).where(eq(employerUsers.id, rows[0].id));
    const raw = await createEmployerSession(rows[0].id, req.headers['user-agent'] ?? null);
    reply.setCookie(EMPLOYER_COOKIE.name, raw, EMPLOYER_COOKIE.options(env.NODE_ENV === 'production'));
    return { employer: { id: rows[0].id, email: rows[0].email, companyName: rows[0].companyName } };
  });

  app.post('/signout', async (req, reply) => {
    const raw = req.cookies[EMPLOYER_COOKIE.name];
    if (raw) await destroyEmployerSession(raw);
    reply.clearCookie(EMPLOYER_COOKIE.name, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req, reply) => {
    if (!req.employer) return reply.code(401).send({ error: 'unauthenticated' });
    return { employer: req.employer };
  });
}
