"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Plan = {
  id: "starter" | "plus" | "growth";
  name: string;
  amountCents: number;
  currency: string;
  interval: string;
  features: string[];
};
type Subscription = {
  id: string;
  plan: Plan["id"];
  status: "active" | "past_due" | "canceled" | "trialing";
  currentPeriodEnd: string | null;
};
type Invoice = {
  id: string;
  externalInvoiceId: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string;
  isSynthetic: boolean;
  description: string;
};
type Snapshot = {
  subscription: Subscription | null;
  invoices: Invoice[];
  access: {
    effectivePlan: Plan["id"];
    subscriptionStatus: Subscription["status"] | null;
    hasSubscriptionAccess: boolean;
    hasPaidAccess: boolean;
    features: string[];
  };
};
const STARTER_ACCESS: Snapshot["access"] = {
  effectivePlan: "starter",
  subscriptionStatus: null,
  hasSubscriptionAccess: false,
  hasPaidAccess: false,
  features: [],
};

export default function EmployerBillingClient() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    subscription: null,
    invoices: [],
    access: STARTER_ACCESS,
  });
  const [signedIn, setSignedIn] = useState(false);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const [planResult, current] = await Promise.all([
      apiFetch<{ plans: Plan[]; checkoutAvailable: boolean }>(
        "/employer/membership/plans",
      ),
      apiFetch<Snapshot>("/employer/membership/current"),
    ]);
    setPlans(planResult.plans);
    setCheckoutAvailable(planResult.checkoutAvailable);
    setSnapshot(current);
  }

  useEffect(() => {
    void apiFetch("/employer/auth/me")
      .then(() => {
        setSignedIn(true);
        return load();
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Sign in to manage billing.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  async function subscribe(plan: Plan) {
    setBusy(plan.id);
    setError("");
    setNotice("");
    try {
      const path =
        snapshot.subscription && snapshot.subscription.status !== "canceled"
          ? "/employer/membership/upgrade"
          : "/employer/membership/checkout";
      const result = await apiFetch<{ duplicate?: boolean }>(path, {
        method: "POST",
        body: JSON.stringify({
          plan: plan.id,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      await load();
      setNotice(
        result.duplicate
          ? "This plan is already active; no duplicate invoice was created."
          : "DEMO / SYNTHETIC: simulated checkout completed; no real payment was made.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout failed.");
    } finally {
      setBusy("");
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this demo subscription now?")) return;
    setBusy("cancel");
    setError("");
    setNotice("");
    try {
      await apiFetch("/employer/membership/cancel", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
      setNotice(
        "DEMO / SYNTHETIC: local subscription canceled; no payment was involved.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation failed.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <p>Loading demo billing…</p>;
  if (!signedIn)
    return (
      <section>
        <h1>Employer billing</h1>
        <p role="alert">Sign in to manage a subscription. {error}</p>
        <a href="/login">Go to employer sign in</a>
      </section>
    );

  const active =
    snapshot.subscription && snapshot.subscription.status !== "canceled"
      ? snapshot.subscription
      : null;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section
        style={{ border: "2px solid #f59e0b", borderRadius: 10, padding: 16 }}
      >
        <strong style={{ color: "#fbbf24" }}>DEMO / SYNTHETIC</strong>
        <p>
          Invented prices, subscriptions and invoices only. No real payment or
          contract is created. Illustrative monthly USD prices are not an offer.
        </p>
      </section>
      {snapshot.subscription && (
        <section
          style={{ border: "1px solid #1e3a5f", padding: 16, borderRadius: 10 }}
        >
          <h2>Current subscription</h2>
          <p>
            {snapshot.subscription.plan.toUpperCase()} ·{" "}
            {snapshot.subscription.status}
          </p>
          {snapshot.subscription.currentPeriodEnd && (
            <p>
              Period ends{" "}
              {new Date(
                snapshot.subscription.currentPeriodEnd,
              ).toLocaleDateString()}
            </p>
          )}
          {active && (
            <button disabled={Boolean(busy)} onClick={() => void cancel()}>
              {busy === "cancel" ? "Canceling…" : "Cancel subscription"}
            </button>
          )}
        </section>
      )}
      <section
        style={{ border: "1px solid #1e3a5f", padding: 16, borderRadius: 10 }}
      >
        <h2>Access granted</h2>
        <p>
          {snapshot.access.effectivePlan.toUpperCase()} tier ·{" "}
          {snapshot.access.hasPaidAccess
            ? "paid access active (simulated)"
            : "free Starter access"}
        </p>
        {snapshot.access.subscriptionStatus && (
          <p>Billing status: {snapshot.access.subscriptionStatus}</p>
        )}
        <ul>
          {snapshot.access.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
        }}
      >
        {plans.map((plan) => (
          <section
            key={plan.id}
            style={{
              background: "#1e3a5f",
              padding: 18,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0 }}>{plan.name}</h2>
            <p style={{ fontSize: 24, margin: 0 }}>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: plan.currency,
              }).format(plan.amountCents / 100)}
              <small> / month</small>
            </p>
            <small>Illustrative demo price · not real billing</small>
            <ul style={{ flex: 1, paddingLeft: 20 }}>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button
              disabled={
                !checkoutAvailable || Boolean(busy) || active?.plan === plan.id
              }
              onClick={() => void subscribe(plan)}
            >
              {active?.plan === plan.id
                ? "Current plan"
                : !checkoutAvailable
                  ? "Checkout disabled"
                  : active
                    ? "Upgrade (DEMO)"
                    : "Subscribe (DEMO)"}
            </button>
          </section>
        ))}
      </div>
      {error && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <section
        style={{ border: "1px solid #1e3a5f", padding: 16, borderRadius: 10 }}
      >
        <h2>Invoices · DEMO / SYNTHETIC</h2>
        {snapshot.invoices.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{new Date(invoice.issuedAt).toLocaleDateString()}</td>
                    <td>{invoice.externalInvoiceId}</td>
                    <td>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: invoice.currency,
                      }).format(invoice.amountCents / 100)}
                    </td>
                    <td>{invoice.status} · DEMO / SYNTHETIC</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No invoices yet.</p>
        )}
      </section>
    </div>
  );
}
