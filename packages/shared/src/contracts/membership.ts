import { z } from 'zod';

export const SUBSCRIPTION_PLANS = ['starter', 'plus', 'growth'] as const;
export type SubscriptionPlan = typeof SUBSCRIPTION_PLANS[number];

export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'canceled', 'trialing'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

export const StartCheckoutInput = z.object({
  workspaceId: z.string().uuid(),
  plan: z.enum(SUBSCRIPTION_PLANS),
});
export type StartCheckoutInput = z.infer<typeof StartCheckoutInput>;
