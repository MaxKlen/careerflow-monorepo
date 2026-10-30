import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { passwordResetTokens, users } from '@careerflow/db';
import { hashPassword } from '../password.js';
import { emailConfigured, sendEmail } from '../email.js';
import { env } from '../env.js';

const TOKEN_TTL_MS = 60 * 60 * 1000;
const REQUEST_LIMIT = 5;
const RequestInput = z.object({ email: z.string().email().toLowerCase().max(254) });
const ResetInput = z.object({ token: z.string().min(20).max(200), newPassword: z.string().min(10).max(200) });
const requestLog = new Map<string, { count: number; resetAt: number }>();

function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function allowRequest(email: string): boolean {
  const now = Date.now();
  const entry = requestLog.get(email);
  if (!entry || entry.resetAt <= now) {
    requestLog.set(email, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= REQUEST_LIMIT) return false;
  entry.count++;
  return true;
}

export async function registerPasswordReset(app: FastifyInstance): Promise<void> {
  app.post('/request', { logLevel: 'silent' }, async (req, reply) => {
    const body = RequestInput.parse(req.body);
    reply.header('Cache-Control', 'no-store');
    if (!allowRequest(body.email)) return reply.code(200).send({ ok: true });

    const rows = await db.select({ id: users.id, email: users.email }).from(users)
      .where(eq(users.email, body.email)).limit(1);
    const user = rows[0];
    if (!user) return reply.code(200).send({ ok: true });

    await db.update(passwordResetTokens).set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(rawToken);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      requestedIp: req.ip,
    });

    const resetUrl = `${env.APP_URL}/reset/verify?token=${encodeURIComponent(rawToken)}`;
    const configuredEmail = emailConfigured();
    if (configuredEmail) {
      await sendEmail(
        user.email,
        'Reset your CareerFlow password',
        `Use this link within 1 hour to reset your password: ${resetUrl}\n\nIf you did not request a reset, ignore this email.`,
      );
    }

    // Only a non-production, no-email environment may expose a test token.
    if (!configuredEmail && env.NODE_ENV !== 'production') {
      return reply.code(200).send({ ok: true, devToken: rawToken, devResetUrl: resetUrl });
    }
    return reply.code(200).send({ ok: true });
  });

  app.post('/reset', { logLevel: 'silent' }, async (req, reply) => {
    const body = ResetInput.parse(req.body);
    reply.header('Cache-Control', 'no-store');
    const tokenHash = hashResetToken(body.token);
    const rows = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ))
      .limit(1);
    const resetToken = rows[0];
    if (!resetToken) return reply.code(400).send({ error: 'invalid_or_expired_token' });

    const passwordHash = await hashPassword(body.newPassword);
    const consumedAt = new Date();
    const consumed = await db.transaction(async (tx) => {
      // Conditional claim serializes concurrent attempts; only one can consume this token.
      const claimed = await tx.update(passwordResetTokens).set({ usedAt: consumedAt })
        .where(and(
          eq(passwordResetTokens.id, resetToken.id),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, consumedAt),
        ))
        .returning({ userId: passwordResetTokens.userId });
      if (!claimed[0]) return false;

      const updated = await tx.update(users).set({ passwordHash })
        .where(eq(users.id, claimed[0].userId))
        .returning({ id: users.id });
      if (!updated.length) throw new Error('reset_user_missing');
      return true;
    });
    if (!consumed) return reply.code(400).send({ error: 'invalid_or_expired_token' });
    return reply.code(200).send({ ok: true });
  });

  app.get('/verify', { logLevel: 'silent' }, async (req, reply) => {
    const token = (req.query as { token?: string }).token;
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    if (!token) return reply.code(400).send({ error: 'token_required' });
    const rows = await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, hashResetToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ))
      .limit(1);
    return reply.code(200).send({ valid: !!rows[0] });
  });
}
