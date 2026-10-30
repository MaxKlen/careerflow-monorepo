import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { subscriptions, workspaces } from '@careerflow/db';
import { StartCheckoutInput } from '@careerflow/shared';
import { getPaymentProvider } from '../paymentProvider.js';

const PLAN_DESCRIPTIONS = {
  starter: { name: 'Starter', features: ['Profile versions', 'Evidence library', 'Basic applications', 'Offline MEH guidance'] },
  plus: { name: 'Plus', features: ['Everything in Starter', 'Advanced editor + version history', 'Interview prep', 'Defined MEH connected allowance'] },
  growth: { name: 'Growth', features: ['Everything in Plus', 'Post-hire growth tracker', 'Deeper connected AI', 'Priority support'] },
} as const;

export async function registerMembership(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/plans', async () => {
    const provider = getPaymentProvider();
    return {
      plans: Object.entries(PLAN_DESCRIPTIONS).map(([id, plan]) => ({ id, ...plan })),
      checkoutAvailable: provider.configured,
      provider: provider.name,
      message: provider.configured ? null : 'Billing is not configured in this deployment. No checkout is available.',
    };
  });

  app.get('/current', async (req) => {
    const owned = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, req.user!.id));
    const workspaceIds = owned.map(row => row.id);
    if (!workspaceIds.length) return { subscription: null, provider: 'none' };
    const rows = await db.select().from(subscriptions).where(inArray(subscriptions.workspaceId, workspaceIds));
    return { subscription: rows[0] ?? null, provider: getPaymentProvider().name };
  });

  app.post('/checkout', async (req, reply) => {
    const body = StartCheckoutInput.parse(req.body);
    const owned = (await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, body.workspaceId), eq(workspaces.ownerId, req.user!.id))).limit(1))[0];
    if (!owned) return reply.code(404).send({ error: 'workspace_not_found' });
    const provider = getPaymentProvider();
    if (!provider.configured) return reply.code(501).send({ error: 'payment_not_configured', message: 'No payment provider is configured in this deployment.' });
    const session = await provider.startCheckout(body.workspaceId, body.plan, '/membership/success', '/membership/cancel');
    if (!session) return reply.code(501).send({ error: 'checkout_not_implemented' });
    return { checkoutUrl: session.url };
  });
}
