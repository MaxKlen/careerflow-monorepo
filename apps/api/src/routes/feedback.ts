import type { FastifyInstance } from "fastify";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../db.js";
import { feedbackItems } from "@careerflow/db";
import { SubmitFeedbackInput } from "@careerflow/shared";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function registerFeedback(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthenticated" });
  });

  app.post("/", async (req, reply) => {
    const body = SubmitFeedbackInput.parse(req.body);
    const row = (
      await db
        .insert(feedbackItems)
        .values({
          userId: req.user!.id,
          workspaceId: null,
          kind: body.kind,
          subject: body.subject,
          body: body.body,
          contactOk: body.contactOk,
          contextScreen: body.contextScreen ?? null,
        })
        .returning()
    )[0]!;
    return reply.code(201).send({
      feedback: { id: row.id, status: row.status, createdAt: row.createdAt },
    });
  });

  app.get("/", async (req, reply) => {
    const query = req.query as {
      limit?: string;
      beforeCreatedAt?: string;
      beforeId?: string;
    };
    const limit =
      query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return reply.code(400).send({
        error: "invalid_limit",
        message: `limit must be an integer from 1 to ${MAX_PAGE_SIZE}`,
      });
    }

    const hasCursorDate = query.beforeCreatedAt !== undefined;
    const hasCursorId = query.beforeId !== undefined;
    if (hasCursorDate !== hasCursorId)
      return reply.code(400).send({ error: "invalid_cursor" });

    let cursorDate: Date | undefined;
    if (hasCursorDate && hasCursorId) {
      cursorDate = new Date(query.beforeCreatedAt!);
      if (
        Number.isNaN(cursorDate.getTime()) ||
        !UUID_PATTERN.test(query.beforeId!)
      ) {
        return reply.code(400).send({ error: "invalid_cursor" });
      }
    }

    const conditions = [eq(feedbackItems.userId, req.user!.id)];
    if (cursorDate) {
      conditions.push(
        or(
          lt(feedbackItems.createdAt, cursorDate),
          and(
            eq(feedbackItems.createdAt, cursorDate),
            lt(feedbackItems.id, query.beforeId!),
          ),
        )!,
      );
    }
    const rows = await db
      .select({
        id: feedbackItems.id,
        kind: feedbackItems.kind,
        subject: feedbackItems.subject,
        status: feedbackItems.status,
        createdAt: feedbackItems.createdAt,
        updatedAt: feedbackItems.updatedAt,
      })
      .from(feedbackItems)
      .where(and(...conditions))
      .orderBy(desc(feedbackItems.createdAt), desc(feedbackItems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? {
              beforeCreatedAt: last.createdAt.toISOString(),
              beforeId: last.id,
            }
          : null,
    };
  });

  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = (
      await db
        .select()
        .from(feedbackItems)
        .where(
          and(eq(feedbackItems.id, id), eq(feedbackItems.userId, req.user!.id)),
        )
        .limit(1)
    )[0];
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { item: row };
  });
}
