import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import MembershipClient from "./MembershipClient";

type PlanResponse = {
  plans: {
    id: "starter" | "plus" | "growth";
    name: string;
    amountCents: number;
    currency: string;
    interval: string;
    features: string[];
  }[];
  checkoutAvailable: boolean;
  demo: boolean;
  message: string | null;
};
type Snapshot = {
  workspaces: { id: string; name: string }[];
  subscriptions: {
    id: string;
    workspaceId: string;
    plan: "starter" | "plus" | "growth";
    status: "active" | "past_due" | "canceled" | "trialing";
    currentPeriodEnd: string | null;
  }[];
  invoices: {
    id: string;
    externalInvoiceId: string;
    amountCents: number;
    currency: string;
    status: string;
    issuedAt: string;
    isSynthetic: boolean;
    description: string;
  }[];
  accessByWorkspace: Record<
    string,
    {
      effectivePlan: "starter" | "plus" | "growth";
      subscriptionStatus:
        "active" | "past_due" | "canceled" | "trialing" | null;
      hasSubscriptionAccess: boolean;
      hasPaidAccess: boolean;
      features: string[];
    }
  >;
};

export default async function MembershipPage() {
  const cookieHeader = (await cookies()).toString();
  const [plans, current] = await Promise.all([
    apiFetch<PlanResponse>("/membership/plans", { cookies: cookieHeader }),
    apiFetch<Snapshot>("/membership/current", { cookies: cookieHeader }),
  ]);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Membership</h1>
      <MembershipClient
        plans={plans.plans}
        initialCurrent={current}
        checkoutAvailable={plans.checkoutAvailable}
        demo={plans.demo}
        message={plans.message}
      />
    </div>
  );
}
