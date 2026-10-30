import { sql } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { adminUsers } from '@careerflow/db';
import { AdminSigninInput, AdminSignupInput } from '@careerflow/shared';
import { hashPassword, verifyPassword } from '../password.js';
import { ADMIN_COOKIE, adminOriginAllowed, audit, createAdminSession, destroyAdminSession, findAdminSession } from '../adminSession.js';
import { env } from '../env.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const signInAttempts = new Map<string, { count: number; resetAt: number }>();
const signUpAttempts = new Map<string, { count: number; resetAt: number }>();
function rateLimited(map: Map<string, { count: number; resetAt: number }>, key: string): boolean {
  const now = Date.now();
  const current = map.get(key);
  if (!current || current.resetAt <= now) { map.delete(key); return false; }
  return current.count >= MAX_FAILURES;
}
function recordFailure(map: Map<string, { count: number; resetAt: number }>, key: string): void {
  const now = Date.now();
  const current = map.get(key);
  if (!current || current.resetAt <= now) map.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else current.count++;
  if (map.size > 5000) for (const [entry, value] of map) if (value.resetAt <= now) map.delete(entry);
}
function userAgent(req: { headers: Record<string, unknown> }): string | null {
  const value = req.headers['user-agent'];
  return typeof value === 'string' ? value : null;
}

export async function registerAdminAuth(app: FastifyInstance): Promise<void> {
  app.post('/signup', async (req, reply) => {
    if (!adminOriginAllowed(req.headers.origin, env.ADMIN_URL)) return reply.code(403).send({ error: 'invalid_origin' });
    const ip = req.ip;
    if (rateLimited(signUpAttempts, ip)) return reply.code(429).send({ error: 'rate_limited' });
    const body = AdminSignupInput.parse(req.body);
    if (env.NODE_ENV === 'production') {
      const expected = env.ADMIN_BOOTSTRAP_TOKEN;
      if (!expected) return reply.code(403).send({ error: 'admin_bootstrap_disabled' });
      const suppliedBytes = Buffer.from(body.bootstrapToken ?? '');
      const expectedBytes = Buffer.from(expected);
      if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
        recordFailure(signUpAttempts, ip);
        return reply.code(rateLimited(signUpAttempts, ip) ? 429 : 403).send({ error: 'admin_bootstrap_failed' });
      }
    }
    let created: { id: string; email: string; role: 'owner' } | undefined;
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('careerflow-admin-bootstrap'))`);
      const existing = await tx.select({ id: adminUsers.id }).from(adminUsers).limit(1);
      if (existing.length) return;
      const inserted = await tx.insert(adminUsers).values({ email: body.email, passwordHash: await hashPassword(body.password), displayName: body.displayName ?? null, role: 'owner' })
        .returning({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role });
      created = inserted[0] as { id: string; email: string; role: 'owner' } | undefined;
    });
    if (!created) {
      recordFailure(signUpAttempts, ip);
      return reply.code(403).send({ error: 'admin_signup_closed' });
    }
    signUpAttempts.delete(ip);
    const raw = await createAdminSession(created.id, userAgent(req));
    reply.setCookie(ADMIN_COOKIE.name, raw, ADMIN_COOKIE.options(env.NODE_ENV === 'production'));
    await audit(created.id, 'admin.signup', 'admin_user', created.id, {}, req.ip, userAgent(req));
    return { admin: created };
  });

  app.post('/signin', async (req, reply) => {
    if (!adminOriginAllowed(req.headers.origin, env.ADMIN_URL)) return reply.code(403).send({ error: 'invalid_origin' });
    const ip = req.ip;
    if (rateLimited(signInAttempts, ip)) return reply.code(429).send({ error: 'rate_limited' });
    const body = AdminSigninInput.parse(req.body);
    const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, body.email)).limit(1);
    const passwordOk = rows[0] ? await verifyPassword(body.password, rows[0].passwordHash) : await verifyPassword(body.password, await hashPassword('careerflow-nonexistent-admin-dummy-password'));
    if (!rows[0] || !passwordOk) {
      recordFailure(signInAttempts, ip);
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    signInAttempts.delete(ip);
    await db.update(adminUsers).set({ lastSignInAt: new Date() }).where(eq(adminUsers.id, rows[0].id));
    const raw = await createAdminSession(rows[0].id, userAgent(req));
    reply.setCookie(ADMIN_COOKIE.name, raw, ADMIN_COOKIE.options(env.NODE_ENV === 'production'));
    await audit(rows[0].id, 'admin.signin', 'admin_user', rows[0].id, {}, req.ip, userAgent(req));
    return { admin: { id: rows[0].id, email: rows[0].email, role: rows[0].role, displayName: rows[0].displayName } };
  });

  app.post('/signout', async (req, reply) => {
    if (!adminOriginAllowed(req.headers.origin, env.ADMIN_URL)) return reply.code(403).send({ error: 'invalid_origin' });
    const raw = req.cookies[ADMIN_COOKIE.name];
    if (raw) await destroyAdminSession(raw);
    reply.clearCookie(ADMIN_COOKIE.name, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req, reply) => {
    const raw = req.cookies[ADMIN_COOKIE.name];
    if (!raw) return reply.code(401).send({ error: 'unauthenticated' });
    const found = await findAdminSession(raw);
    if (!found) return reply.code(401).send({ error: 'unauthenticated' });
    return { admin: { id: found.adminUserId, email: found.email, role: found.role, displayName: found.displayName } };
  });
}
