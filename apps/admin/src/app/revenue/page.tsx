"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Revenue = {
  label: string;
  currency: string;
  mrrCents: number;
  activeSubscriptions: number;
  canceledLast30Days: number;
  churnRatePercent: number;
  generatedAt: string;
};
type Invoice = {
  id: string;
  externalInvoiceId: string;
  accountKind: string;
  accountEmail: string;
  accountName: string | null;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string;
  isSynthetic: boolean;
  description: string;
};

export default function RevenuePage() {
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([
      apiFetch<Revenue>("/admin/revenue"),
      apiFetch<{ invoices: Invoice[] }>("/admin/invoices"),
    ])
      .then(([metrics, invoiceData]) => {
        setRevenue(metrics);
        setInvoices(invoiceData.invoices);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load billing data.",
        ),
      );
  }, []);
  if (error)
    return (
      <section>
        <h1>Revenue dashboard</h1>
        <p role="alert">{error}</p>
        <a href="/login">Sign in</a>
      </section>
    );
  if (!revenue) return <p>Loading billing metrics…</p>;
  const cards = [
    [
      "Simulated MRR",
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: revenue.currency,
      }).format(revenue.mrrCents / 100),
    ],
    ["Active subscriptions", String(revenue.activeSubscriptions)],
    ["Cancellations · last 30 days", String(revenue.canceledLast30Days)],
    ["Churn · last 30 days", `${revenue.churnRatePercent.toFixed(2)}%`],
  ];
  return (
    <div>
      <h1>Revenue dashboard</h1>
      <p style={banner}>{revenue.label}</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
          gap: 14,
          marginBlock: 20,
        }}
      >
        {cards.map(([label, value]) => (
          <section key={label} style={card}>
            <small>{label}</small>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
              {value}
            </div>
          </section>
        ))}
      </div>
      <p style={{ color: "#94a3b8" }}>
        Metrics are calculated from demo subscription rows and illustrative
        monthly plan prices. They do not represent actual customers, revenue,
        collections or payments. Updated{" "}
        {new Date(revenue.generatedAt).toLocaleString()}.
      </p>
      <h2>Recent invoices · DEMO / SYNTHETIC</h2>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}
        >
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Date</th>
              <th>Account</th>
              <th>Type</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} style={{ borderTop: "1px solid #1e3a5f" }}>
                <td>{new Date(invoice.issuedAt).toLocaleDateString()}</td>
                <td>
                  {invoice.accountName ?? invoice.accountEmail}
                  <br />
                  <small>{invoice.accountEmail}</small>
                </td>
                <td>{invoice.accountKind}</td>
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
    </div>
  );
}

const banner = {
  padding: 14,
  borderRadius: 8,
  border: "2px solid #f59e0b",
  background: "#422006",
  color: "#fcd34d",
  fontWeight: 700,
};
const card = { background: "#1e3a5f", borderRadius: 8, padding: 18 };
