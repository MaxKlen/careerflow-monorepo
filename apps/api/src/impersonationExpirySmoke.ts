import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { auditLog, sessions } from "@careerflow/db";
import { db, pool } from "./db.js";
import { hashToken } from "./session.js";
import { isAllowedDemoDatabase } from "./demoGuard.js";
import { reapExpiredImpersonationSessions } from "./impersonationReaper.js";

const [adminId, candidateId] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (!adminId || !candidateId) {
  throw new Error(
    "Usage: tsx src/impersonationExpirySmoke.ts <adminId> <candidateId>",
  );
}
if (
  !databaseUrl ||
  !isAllowedDemoDatabase({
    databaseUrl,
    demoMode: process.env.DEMO_MODE === "true",
    nodeEnv: process.env.NODE_ENV ?? "",
  })
) {
  throw new Error(
    "Refusing impersonation expiry smoke test outside an explicit local demo/test database.",
  );
}

const sessionId = randomUUID();
const reason = `integration-expiry-${randomUUID()}`;
const tokenHash = hashToken(randomUUID());

try {
  await db.insert(sessions).values({
    id: sessionId,
    userId: candidateId,
    tokenHash,
    isImpersonation: true,
    impersonatorAdminUserId: adminId,
    impersonationReason: reason,
    expiresAt: new Date(Date.now() - 60_000),
    userAgent: "Phase 2 synthetic expiry integration test",
  });

  await reapExpiredImpersonationSessions();
  const audit = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "admin.impersonation.expired"),
        eq(auditLog.targetType, "candidate"),
        eq(auditLog.targetId, candidateId),
        sql`${auditLog.metadata}->>'reason' = ${reason}`,
      ),
    )
    .limit(1);
  const remaining = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!audit.length || remaining.length) {
    throw new Error("Expired impersonation was not both audited and removed");
  }
  console.log("IMPERSONATION_EXPIRY_AUDIT_PASS");
} finally {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await pool.end();
}
