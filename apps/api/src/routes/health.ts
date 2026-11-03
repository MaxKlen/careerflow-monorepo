import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export async function registerHealth(app: FastifyInstance): Promise<void> {
  // Use /live for frequent process health probes; it intentionally avoids DB I/O.
  app.get("/live", async () => ({ ok: true, service: "careerflow-api" }));

  // /ready and the legacy /health endpoint verify that PostgreSQL is reachable.
  const checkDatabase = async (_req: unknown, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true, service: "careerflow-api" };
    } catch {
      return reply.code(503).send({ ok: false, service: "careerflow-api" });
    }
  };
  app.get("/ready", checkDatabase);
  app.get("/health", checkDatabase);
}
