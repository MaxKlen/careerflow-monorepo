import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from './db.js';
import { adminSessions, adminUsers, auditLog } from '@careerflow/db';
import { hashToken } from './session.js';

const TTL_MS = 8 * 60 * 60 * 1000;
export const ADMIN_COOKIE = {
  name: 'cf_admin_session',
  ttlMs: TTL_MS,
  options(secure: boolean) {
    return { httpOnly: true, sameSite: 'strict' as const, secure, path: '/', maxAge: Math.floor(TTL_MS / 1000) };
  },
};

export async function createAdminSession(adminUserId: string, userAgent: string | null): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  await db.insert(adminSessions).values({
    adminUserId, tokenHash: hashToken(raw), userAgent,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return raw;
}

export async function destroyAdminSession(raw: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(raw)));
}

export async function findAdminSession(raw: string) {
  const rows = await db.select({
    sessionId: adminSessions.id,
    adminUserId: adminUsers.id,
    email: adminUsers.email,
    displayName: adminUsers.displayName,
    role: adminUsers.role,
  }).from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(and(eq(adminSessions.tokenHash, hashToken(raw)), gt(adminSessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function audit(
  actorAdminUserId: string | null,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown>,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  await db.insert(auditLog).values({ actorAdminUserId, action, targetType, targetId, metadata, ipAddress: ip, userAgent });
}

export function adminOriginAllowed(origin: string | undefined, adminUrl: string): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(adminUrl).origin; }
  catch { return false; }
}
