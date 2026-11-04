"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
type Dashboard = {
  totals: Record<string, number>;
  definitions: Record<string, string>;
  generatedAt: string;
  demo?: boolean;
};
export default function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void apiFetch<Dashboard>("/admin/dashboard")
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Request failed"),
      );
  }, []);
  if (error)
    return (
      <div style={{ background: "#7f1d1d", padding: 20, borderRadius: 8 }}>
        <h2>Not signed in</h2>
        <p>{error}</p>
        <a href="/login" style={{ color: "white" }}>
          Sign in or complete first-admin setup
        </a>
      </div>
    );
  if (!data) return <p>Loading live counts…</p>;
  return (
    <div>
      <h1>Super-owner dashboard</h1>
      <p style={{ color: "#94a3b8", fontSize: 14 }}>
        Counts are read from live tables; definitions are shown beneath each
        number.
      </p>
      <p style={{ color: "#fbbf24" }}>
        <a href="/users" style={{ color: "#3ddc97" }}>
          Manage all users
        </a>{" "}
        ·{" "}
        <a href="/revenue" style={{ color: "#3ddc97" }}>
          View simulated revenue and invoices
        </a>
      </p>
      {data.demo && (
        <p
          style={{
            border: "2px solid #f59e0b",
            background: "#422006",
            color: "#fcd34d",
            padding: 12,
            borderRadius: 8,
            fontWeight: 700,
          }}
        >
          DEMO / SYNTHETIC — seeded account counts and MRR are invented; not
          real customers, revenue or payments.
        </p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 16,
          marginBlockStart: 20,
        }}
      >
        {Object.entries(data.totals).map(([key, value]) => (
          <div
            key={key}
            style={{ background: "#1e3a5f", padding: 16, borderRadius: 8 }}
          >
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              {key === "simulatedMrrCents"
                ? new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(value / 100)
                : value}
            </div>
            <div>
              {key === "simulatedMrrCents"
                ? "Simulated MRR · USD"
                : key === "activeSubscriptions"
                  ? "Active subscriptions"
                  : key}
            </div>
            <div
              style={{ color: "#94a3b8", fontSize: 11, marginBlockStart: 6 }}
            >
              {data.definitions[key]}
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: "#64748b", fontSize: 12, marginBlockStart: 20 }}>
        Generated {new Date(data.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
