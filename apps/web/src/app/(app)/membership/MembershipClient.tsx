"use client";
import { useState } from "react";
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
  workspaceId: string;
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
  workspaces: { id: string; name: string }[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  accessByWorkspace: Record<
    string,
    {
      effectivePlan: Plan["id"];
      subscriptionStatus: Subscription["status"] | null;
      hasSubscriptionAccess: boolean;
      hasPaidAccess: boolean;
      features: string[];
    }
  >;
};

export default function MembershipClient({
  plans,
  initialCurrent,
  checkoutAvailable,
  demo,
  message,
}: {
  plans: Plan[];
  initialCurrent: Snapshot;
  checkoutAvailable: boolean;
  demo: boolean;
  message: string | null;
}) {
  const [current, setCurrent] = useState(initialCurrent);
  const [workspaceId, setWorkspaceId] = useState(
    initialCurrent.workspaces[0]?.id ?? "",
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeSubscription = current.subscriptions.find(
    (subscription) =>
      subscription.workspaceId === workspaceId &&
      subscription.status !== "canceled",
  );
  const latestSubscription = current.subscriptions.find(
    (subscription) => subscription.workspaceId === workspaceId,
  );
  const access = current.accessByWorkspace[workspaceId];

  async function reload() {
    const snapshot = await apiFetch<Snapshot>("/membership/current");
    setCurrent(snapshot);
  }

  async function subscribe(plan: Plan) {
    if (!workspaceId) return;
    setBusy(plan.id);
    setError("");
    setNotice("");
    try {
      const path = activeSubscription
        ? "/membership/upgrade"
        : "/membership/checkout";
      const result = await apiFetch<{ label?: string; duplicate?: boolean }>(
        path,
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId,
            plan: plan.id,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      await reload();
      setNotice(
        result.duplicate
          ? "This plan is already active. No second invoice was created."
          : "DEMO / SYNTHETIC: the simulated checkout completed; no real payment was made.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout failed.");
    } finally {
      setBusy("");
    }
  }

  async function cancel() {
    if (!workspaceId || !window.confirm("Cancel this demo subscription now?"))
      return;
    setBusy("cancel");
    setError("");
    setNotice("");
    try {
      await apiFetch("/membership/cancel", {
        method: "POST",
        body: JSON.stringify({ workspaceId }),
      });
      await reload();
      setNotice(
        "DEMO / SYNTHETIC: the local subscription is canceled; no real payment was involved.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="card" style={{ border: "2px solid #f59e0b" }}>
        <strong style={{ color: "#fbbf24" }}>
          DEMO / SYNTHETIC ·{" "}
          {demo ? "mock checkout active" : "checkout disabled"}
        </strong>
        <p className="muted" style={{ marginBottom: 0 }}>
          {message ??
            "All prices, subscriptions and invoices here are illustrative synthetic data. Checkout creates no real charge, contract or payment."}{" "}
          Illustrative monthly USD prices are not an offer.
        </p>
      </section>

      {current.workspaces.length > 1 && (
        <label className="card">
          Workspace
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            style={{
              display: "block",
              marginTop: 8,
              padding: 8,
              width: "100%",
            }}
          >
            {current.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!current.workspaces.length && (
        <p className="card">Create a workspace before choosing a plan.</p>
      )}
      {access && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Access granted</h2>
          <p>
            {access.effectivePlan.toUpperCase()} tier ·{" "}
            {access.hasPaidAccess
              ? "paid access active (simulated)"
              : "free Starter access"}
          </p>
          {access.subscriptionStatus && (
            <p className="muted">Billing status: {access.subscriptionStatus}</p>
          )}
          <ul style={{ paddingLeft: 20 }}>
            {access.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>
      )}
      {latestSubscription && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Current subscription</h2>
          <p>
            {latestSubscription.plan.toUpperCase()} ·{" "}
            {latestSubscription.status}
          </p>
          {latestSubscription.currentPeriodEnd && (
            <p className="muted">
              Period ends{" "}
              {new Date(
                latestSubscription.currentPeriodEnd,
              ).toLocaleDateString()}
            </p>
          )}
          {activeSubscription && (
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={Boolean(busy)}
            >
              {busy === "cancel" ? "Canceling…" : "Cancel subscription"}
            </button>
          )}
        </section>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {plans.map((plan) => {
          const isCurrent = activeSubscription?.plan === plan.id;
          const blocked =
            !checkoutAvailable || !workspaceId || Boolean(busy) || isCurrent;
          return (
            <section
              className="card"
              key={plan.id}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div>
                <h2 style={{ margin: 0 }}>{plan.name}</h2>
                <p style={{ fontSize: 24, margin: "6px 0" }}>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: plan.currency,
                  }).format(plan.amountCents / 100)}
                  <small className="muted"> / month</small>
                </p>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Illustrative demo price · not real billing
              </p>
              <ul style={{ paddingLeft: 20, flex: 1 }}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={blocked}
                onClick={() => void subscribe(plan)}
              >
                {isCurrent
                  ? "Current plan"
                  : !checkoutAvailable
                    ? "Checkout disabled"
                    : activeSubscription
                      ? "Upgrade (DEMO)"
                      : "Subscribe (DEMO)"}
              </button>
            </section>
          );
        })}
      </div>

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ color: "#047857" }}>
          {notice}
        </p>
      )}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>
          Invoices <small>DEMO / SYNTHETIC</small>
        </h2>
        {!current.invoices.length ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {current.invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    style={{ borderTop: "1px solid #cbd5e1" }}
                  >
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
        )}
      </section>
    </div>
  );
}
