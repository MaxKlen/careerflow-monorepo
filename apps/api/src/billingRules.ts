import type { BillingPlan } from "./billingCatalog.js";

export type SubscriptionStatus =
  "active" | "past_due" | "canceled" | "trialing";

export function canAccessSubscription(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

export function nextSubscriptionState(input: {
  currentPlan: BillingPlan | null;
  currentStatus: SubscriptionStatus | null;
  requestedPlan: BillingPlan;
  action: "checkout" | "upgrade";
}): { allowed: true; plan: BillingPlan } | { allowed: false; reason: string } {
  if (input.currentStatus && input.currentStatus !== "canceled") {
    if (input.currentPlan === input.requestedPlan) {
      return { allowed: false, reason: "already_on_plan" };
    }
    const ranks: Record<BillingPlan, number> = {
      starter: 0,
      plus: 1,
      growth: 2,
    };
    if (ranks[input.requestedPlan] < ranks[input.currentPlan ?? "starter"]) {
      return { allowed: false, reason: "plan_downgrade_not_supported" };
    }
    if (input.action === "checkout" && input.currentPlan) {
      return { allowed: false, reason: "use_upgrade_action" };
    }
  }
  return { allowed: true, plan: input.requestedPlan };
}

export function nextPeriodEnd(start: Date): Date {
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}
