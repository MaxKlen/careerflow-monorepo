import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from './db.js';
import { employerSessions, employerUsers } from '@careerflow/db';

const COOKIE_NAME = 'cf_employer_session';
const TTL_MS = 8 * 60 * 60 * 1000;

export function hashEmployerToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function createEmployerSession(employerUserId: string, userAgent: string | null): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  await db.insert(employerSessions).values({
    employerUserId,
    tokenHash: hashEmployerToken(raw),
    userAgent,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return raw;
}

export async function destroyEmployerSession(raw: string): Promise<void> {
  await db.delete(employerSessions).where(eq(employerSessions.tokenHash, hashEmployerToken(raw)));
}

export async function findEmployerSession(raw: string) {
  const rows = await db
    .select({
      sessionId: employerSessions.id,
      employerUserId: employerUsers.id,
      email: employerUsers.email,
      companyName: employerUsers.companyName,
    })
    .from(employerSessions)
    .innerJoin(employerUsers, eq(employerUsers.id, employerSessions.employerUserId))
    .where(and(eq(employerSessions.tokenHash, hashEmployerToken(raw)), gt(employerSessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export const EMPLOYER_COOKIE = {
  name: COOKIE_NAME,
  ttlMs: TTL_MS,
  options(secure: boolean) {
    return { httpOnly: true, sameSite: 'strict' as const, secure, path: '/', maxAge: Math.floor(TTL_MS / 1000) };
  },
};
