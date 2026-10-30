import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { users } from '@careerflow/db';
import { hashPassword, verifyPassword } from '../password.js';
import { COOKIE, createSession, destroySession } from '../session.js';
import { env } from '../env.js';

const SignupSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(10).max(200),
  displayName: z.string().min(1).max(80).optional(),
});

const SigninSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.post('/signup', async (req, reply) => {
    const body = SignupSchema.parse(req.body);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (existing[0]) return reply.code(409).send({ error: 'email_taken' });

    const passwordHash = await hashPassword(body.password);
    const inserted = await db
      .insert(users)
      .values({ email: body.email, passwordHash, displayName: body.displayName ?? null })
      .returning({ id: users.id, email: users.email, displayName: users.displayName });
    const user = inserted[0]!;

    const raw = await createSession(user.id, req.headers['user-agent'] ?? null);
    reply.setCookie(COOKIE.name, raw, COOKIE.options(env.NODE_ENV === 'production'));
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  });

  app.post('/signin', async (req, reply) => {
    const body = SigninSchema.parse(req.body);
    const rows = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, passwordHash: users.passwordHash })
      .from(users).where(eq(users.email, body.email)).limit(1);
    const user = rows[0];
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const raw = await createSession(user.id, req.headers['user-agent'] ?? null);
    reply.setCookie(COOKIE.name, raw, COOKIE.options(env.NODE_ENV === 'production'));
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  });

  app.post('/signout', async (req, reply) => {
    const raw = req.cookies[COOKIE.name];
    if (raw) await destroySession(raw);
    reply.clearCookie(COOKIE.name, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
    return { user: req.user };
  });
}
