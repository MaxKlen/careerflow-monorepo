import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from './db.js';
import { sessions, users } from '@careerflow/db';

const COOKIE_NAME = 'cf_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash, userAgent, expiresAt });
  return raw;
}

export async function destroySession(raw: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)));
}

export async function findSession(raw: string) {
  const rows = await db
    .select({ sessionId: sessions.id, userId: users.id, email: users.email, displayName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(raw)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export const COOKIE = {
  name: COOKIE_NAME,
  ttlMs: TTL_MS,
  options(secure: boolean) {
    return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: Math.floor(TTL_MS / 1000) };
  },
};
