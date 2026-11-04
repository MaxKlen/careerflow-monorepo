export type BillingPlan = "starter" | "plus" | "growth";
export type BillingAccountKind = "candidate" | "employer";

export interface PublicPlan {
  id: BillingPlan;
  name: string;
  amountCents: number;
  currency: "USD";
  interval: "month";
  features: string[];
}

export interface AccessSubscription {
  plan: BillingPlan;
  status: "active" | "past_due" | "canceled" | "trialing";
}

export function getAccessSnapshot(
  kind: BillingAccountKind,
  subscription: AccessSubscription | null,
) {
  const subscriptionActive =
    subscription?.status === "active" || subscription?.status === "trialing";
  const effectivePlan = subscriptionActive ? subscription!.plan : "starter";
  return {
    effectivePlan,
    subscriptionStatus: subscription?.status ?? null,
    hasSubscriptionAccess: Boolean(subscriptionActive),
    hasPaidAccess: Boolean(
      subscriptionActive && subscription!.plan !== "starter",
    ),
    features: getPlan(kind, effectivePlan).features,
  };
}

const CATALOG: Record<BillingAccountKind, PublicPlan[]> = {
  candidate: [
    {
      id: "starter",
      name: "Starter",
      amountCents: 0,
      currency: "USD",
      interval: "month",
      features: [
        "Profile versions",
        "Evidence library",
        "Basic applications",
        "Offline guidance",
      ],
    },
    {
      id: "plus",
      name: "Plus",
      amountCents: 1200,
      currency: "USD",
      interval: "month",
      features: [
        "Everything in Starter",
        "Advanced editor",
        "Interview preparation",
        "Connected guidance allowance",
      ],
    },
    {
      id: "growth",
      name: "Growth",
      amountCents: 2400,
      currency: "USD",
      interval: "month",
      features: [
        "Everything in Plus",
        "Growth tracker",
        "Deeper guidance",
        "Priority support",
      ],
    },
  ],
  employer: [
    {
      id: "starter",
      name: "Starter",
      amountCents: 0,
      currency: "USD",
      interval: "month",
      features: ["Invitation-based application review", "Basic collaboration"],
    },
    {
      id: "plus",
      name: "Team",
      amountCents: 4900,
      currency: "USD",
      interval: "month",
      features: [
        "Everything in Starter",
        "Team review tools",
        "Shared hiring notes",
      ],
    },
    {
      id: "growth",
      name: "Scale",
      amountCents: 9900,
      currency: "USD",
      interval: "month",
      features: [
        "Everything in Team",
        "Expanded collaboration",
        "Priority support",
      ],
    },
  ],
};

const RANK: Record<BillingPlan, number> = { starter: 0, plus: 1, growth: 2 };

export function getPlan(
  kind: BillingAccountKind,
  plan: BillingPlan,
): PublicPlan {
  const selected = CATALOG[kind].find((item) => item.id === plan);
  if (!selected) throw new Error("unknown_plan");
  return selected;
}

export function getPlans(kind: BillingAccountKind): PublicPlan[] {
  return CATALOG[kind];
}

export function isUpgrade(current: BillingPlan, next: BillingPlan): boolean {
  return RANK[next] > RANK[current];
}

export function formatSyntheticPrice(
  amountCents: number,
  currency = "USD",
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}
