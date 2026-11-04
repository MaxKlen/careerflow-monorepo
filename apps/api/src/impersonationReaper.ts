import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { auditLog, employerSessions, sessions } from "@careerflow/db";
import { db } from "./db.js";

export async function reapExpiredImpersonationSessions(
  now = new Date(),
): Promise<number> {
  return db.transaction(async (tx) => {
    const expiredCandidates = await tx
      .select({
        id: sessions.id,
        userId: sessions.userId,
        impersonatorAdminUserId: sessions.impersonatorAdminUserId,
        reason: sessions.impersonationReason,
        expiresAt: sessions.expiresAt,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.isImpersonation, true),
          lte(sessions.expiresAt, now),
          isNotNull(sessions.impersonatorAdminUserId),
        ),
      )
      .for("update");
    const expiredEmployers = await tx
      .select({
        id: employerSessions.id,
        employerUserId: employerSessions.employerUserId,
        impersonatorAdminUserId: employerSessions.impersonatorAdminUserId,
        reason: employerSessions.impersonationReason,
        expiresAt: employerSessions.expiresAt,
        userAgent: employerSessions.userAgent,
      })
      .from(employerSessions)
      .where(
        and(
          eq(employerSessions.isImpersonation, true),
          lte(employerSessions.expiresAt, now),
          isNotNull(employerSessions.impersonatorAdminUserId),
        ),
      )
      .for("update");

    if (expiredCandidates.length) {
      await tx.insert(auditLog).values(
        expiredCandidates.map((session) => ({
          actorAdminUserId: session.impersonatorAdminUserId!,
          action: "admin.impersonation.expired",
          targetType: "candidate",
          targetId: session.userId,
          metadata: {
            sessionId: session.id,
            reason: session.reason,
            expiredAt: session.expiresAt.toISOString(),
          },
          ipAddress: null,
          userAgent: session.userAgent,
          createdAt: now,
        })),
      );
      await tx.delete(sessions).where(
        inArray(
          sessions.id,
          expiredCandidates.map((session) => session.id),
        ),
      );
    }

    if (expiredEmployers.length) {
      await tx.insert(auditLog).values(
        expiredEmployers.map((session) => ({
          actorAdminUserId: session.impersonatorAdminUserId!,
          action: "admin.impersonation.expired",
          targetType: "employer",
          targetId: session.employerUserId,
          metadata: {
            sessionId: session.id,
            reason: session.reason,
            expiredAt: session.expiresAt.toISOString(),
          },
          ipAddress: null,
          userAgent: session.userAgent,
          createdAt: now,
        })),
      );
      await tx.delete(employerSessions).where(
        inArray(
          employerSessions.id,
          expiredEmployers.map((session) => session.id),
        ),
      );
    }

    return expiredCandidates.length + expiredEmployers.length;
  });
}

export function startImpersonationReaper(app: FastifyInstance): void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const removed = await reapExpiredImpersonationSessions();
      if (removed > 0) {
        app.log.info(
          { removed },
          "Expired impersonation sessions audited and removed",
        );
      }
    } catch (error) {
      app.log.error(
        { err: error },
        "Failed to reap expired impersonation sessions",
      );
    } finally {
      running = false;
    }
  };

  void sweep();
  const timer = setInterval(() => void sweep(), 60_000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
}
