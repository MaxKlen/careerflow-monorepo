import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { workspaces, consents, mehConversations, mehMessages } from '@careerflow/db';
import { hasProvider, respond, type MehMode } from '@careerflow/meh';
import { checkRateLimit } from '../rateLimit.js';

const CONSENT_DISCLOSURE_VERSION = 'm5-v1' as const;
const RespondBody = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  screen: z.string().min(1).max(120),
  prompt: z.string().min(1).max(4000),
  mode: z.enum(['offline', 'connected']).default('offline'),
});
const ConsentBody = z.object({
  disclosureVersion: z.literal(CONSENT_DISCLOSURE_VERSION),
  acknowledgeDataFlow: z.literal(true),
});

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}

async function activeConsent(workspaceId: string) {
  const rows = await db.select().from(consents)
    .where(and(
      eq(consents.workspaceId, workspaceId),
      eq(consents.feature, 'ai_connected'),
      isNull(consents.withdrawnAt),
      isNotNull(consents.grantedAt),
    )).limit(1);
  return rows[0] ?? null;
}

export async function registerMeh(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/:workspaceId/status', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const consent = await activeConsent(workspaceId);
    return {
      connected: !!consent,
      providerConfigured: hasProvider(),
      consentGrantedAt: consent?.grantedAt ?? null,
    };
  });

  app.post('/:workspaceId/enable-connected', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const accepted = ConsentBody.safeParse(req.body ?? {});
    if (!accepted.success) {
      return reply.code(400).send({
        error: 'consent_acknowledgement_required',
        message: 'Review the connected-mode data disclosure and acknowledge it before granting consent.',
      });
    }
    const existing = await activeConsent(workspaceId);
    if (existing) return { consent: existing, alreadyActive: true };
    const grantedAt = new Date();
    const row = (await db.insert(consents).values({
      workspaceId,
      feature: 'ai_connected',
      grantedAt,
      evidence: {
        grantedVia: 'versioned_acknowledgement',
        disclosureVersion: CONSENT_DISCLOSURE_VERSION,
        acknowledgedData: ['prompt', 'screen'],
        providerConfiguredAtGrant: hasProvider(),
        userAgent: req.headers['user-agent'] ?? null,
        at: grantedAt.toISOString(),
      },
    }).returning())[0]!;
    return reply.code(201).send({ consent: row });
  });

  app.post('/:workspaceId/disable-connected', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.update(consents).set({ withdrawnAt: new Date() })
      .where(and(
        eq(consents.workspaceId, workspaceId),
        eq(consents.feature, 'ai_connected'),
        isNull(consents.withdrawnAt),
        isNotNull(consents.grantedAt),
      )).returning();
    return { withdrawn: rows.length };
  });

  app.post('/respond', async (req, reply) => {
    const parsed = RespondBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const body = parsed.data;
    if (!(await ownsWorkspace(body.workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });

    const rl = checkRateLimit(body.workspaceId);
    if (!rl.ok) {
      reply.header('retry-after', Math.ceil(rl.retryAfterMs / 1000));
      return reply.code(429).send({ error: 'rate_limited', retryAfterMs: rl.retryAfterMs });
    }

    let mode: MehMode;
    if (body.mode === 'connected') {
      const consent = await activeConsent(body.workspaceId);
      if (!consent) return reply.code(403).send({ error: 'consent_required', message: 'Enable connected assistant consent first.' });
      if (!hasProvider()) {
        return reply.code(503).send({
          error: 'provider_not_configured',
          message: 'Connected assistant is unavailable: no provider is configured for this deployment. Your prompt was not sent to a provider.',
        });
      }
      mode = { kind: 'connected', consentRecordId: consent.id, providerId: 'openai-compatible' };
    } else {
      mode = { kind: 'offline', reason: 'no_consent' };
    }

    if (body.conversationId) {
      const conv = await db.select({ id: mehConversations.id }).from(mehConversations)
        .where(and(eq(mehConversations.id, body.conversationId), eq(mehConversations.workspaceId, body.workspaceId)))
        .limit(1);
      if (!conv[0]) return reply.code(404).send({ error: 'conversation_not_found' });
    }

    let out;
    try {
      out = await respond({ workspaceId: body.workspaceId, screen: body.screen, prompt: body.prompt }, mode);
    } catch {
      return reply.code(502).send({ error: 'provider_error', message: 'The connected assistant provider request failed.' });
    }

    let conversationId = body.conversationId;
    if (!conversationId) {
      const conv = (await db.insert(mehConversations).values({ workspaceId: body.workspaceId }).returning())[0]!;
      conversationId = conv.id;
    }
    const userCreatedAt = new Date();
    await db.insert(mehMessages).values({
      conversationId,
      role: 'user',
      content: body.prompt,
      modeKind: mode.kind,
      sourceType: 'candidate_input',
      createdAt: userCreatedAt,
    });
    await db.insert(mehMessages).values({
      conversationId,
      role: 'assistant',
      content: out.body,
      modeKind: out.modeKind,
      sourceType: 'ai_generated_unverified',
      provenance: out.sources ?? [],
      createdAt: new Date(userCreatedAt.getTime() + 1),
    });
    await db.update(mehConversations).set({ updatedAt: new Date() })
      .where(eq(mehConversations.id, conversationId));

    const messages = await db.select().from(mehMessages)
      .where(eq(mehMessages.conversationId, conversationId))
      .orderBy(asc(mehMessages.createdAt));
    return { response: out, conversationId, messages };
  });

  app.get('/:workspaceId/conversations', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select().from(mehConversations)
      .where(eq(mehConversations.workspaceId, workspaceId))
      .orderBy(desc(mehConversations.updatedAt));
    return { conversations: rows };
  });

  app.get('/:workspaceId/conversations/:id', async (req, reply) => {
    const { workspaceId, id } = req.params as { workspaceId: string; id: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const conv = await db.select().from(mehConversations)
      .where(and(eq(mehConversations.id, id), eq(mehConversations.workspaceId, workspaceId)))
      .limit(1);
    if (!conv[0]) return reply.code(404).send({ error: 'not_found' });
    const messages = await db.select().from(mehMessages)
      .where(eq(mehMessages.conversationId, id))
      .orderBy(asc(mehMessages.createdAt));
    return { conversation: conv[0], messages };
  });
}
