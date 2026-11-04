"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";

type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  kind: "candidate" | "employer" | "admin";
  status: "active" | "suspended";
  role: string | null;
  createdAt: string;
  suspendedAt: string | null;
};

export default function UsersPage() {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [demo, setDemo] = useState(false);

  async function load(search = "") {
    const result = await apiFetch<{ users: ManagedUser[]; demo: boolean }>(
      `/admin/managed-users${search ? `?q=${encodeURIComponent(search)}` : ""}`,
    );
    setUsers(result.users);
    setDemo(result.demo);
  }

  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load accounts.",
      ),
    );
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await load(query.trim());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Account search failed.",
      );
    }
  }

  async function setStatus(
    user: ManagedUser,
    action: "suspend" | "reactivate",
  ) {
    if (reason.trim().length < 8) {
      setError("Enter an action reason of at least 8 characters first.");
      return;
    }
    setBusy(`${user.kind}:${user.id}`);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/managed-users/${user.kind}/${user.id}/status`, {
        method: "POST",
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      await load(query.trim());
      setNotice(
        `${user.email} is now ${action === "suspend" ? "suspended" : "active"}. The action was audit-logged.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Account action failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function impersonate(user: ManagedUser) {
    if (reason.trim().length < 10) {
      setError(
        "Enter an impersonation reason of at least 10 characters first.",
      );
      return;
    }
    if (
      !window.confirm(
        `Start a 15-minute, read-only session as ${user.email}? This action is audit-logged.`,
      )
    )
      return;
    setBusy(`${user.kind}:${user.id}`);
    setError("");
    try {
      const result = await apiFetch<{ redirectUrl: string }>(
        `/admin/managed-users/${user.kind}/${user.id}/impersonate`,
        {
          method: "POST",
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      window.location.assign(result.redirectUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start impersonation.",
      );
      setBusy("");
    }
  }

  return (
    <div>
      <h1>All users</h1>
      <p style={{ color: "#94a3b8" }}>
        Candidates, employers and admins. Sensitive actions require a reason,
        are owner-only and are audit-logged. Impersonation is read-only and
        expires after 15 minutes.
      </p>
      {demo && (
        <p style={demoBanner}>
          DEMO / SYNTHETIC accounts are seeded test identities.
        </p>
      )}
      <form
        onSubmit={search}
        style={{ display: "flex", gap: 8, marginBlock: 16 }}
      >
        <input
          aria-label="Search accounts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          minLength={2}
          maxLength={254}
          placeholder="Filter by email…"
          style={inputStyle}
        />
        <button disabled={Boolean(busy)}>Search</button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => {
            setQuery("");
            void load().catch((cause) => setError(String(cause)));
          }}
        >
          Show all
        </button>
      </form>
      <label style={{ display: "block", maxWidth: 680, marginBottom: 16 }}>
        Reason for the next sensitive action
        <input
          aria-label="Action reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={8}
          maxLength={500}
          placeholder="For example: customer requested account access support"
          style={inputStyle}
        />
      </label>
      {error && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ color: "#86efac" }}>
          {notice}
        </p>
      )}
      <p>
        {users.length} account{users.length === 1 ? "" : "s"} shown
      </p>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}
        >
          <thead>
            <tr
              style={{ textAlign: "left", borderBottom: "1px solid #475569" }}
            >
              <th>Account</th>
              <th>Type / role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={`${user.kind}:${user.id}`}
                style={{ borderBottom: "1px solid #1e3a5f" }}
              >
                <td style={{ padding: 10 }}>
                  <strong>{user.name ?? "—"}</strong>
                  <br />
                  <span style={{ color: "#cbd5e1" }}>{user.email}</span>
                </td>
                <td>
                  {user.kind}
                  {user.role ? ` · ${user.role}` : ""}
                </td>
                <td
                  style={{
                    color: user.status === "suspended" ? "#fca5a5" : "#86efac",
                  }}
                >
                  {user.status}
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                <td
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    padding: 8,
                  }}
                >
                  {user.status === "active" ? (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => void setStatus(user, "suspend")}
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => void setStatus(user, "reactivate")}
                    >
                      Reactivate
                    </button>
                  )}
                  {user.kind !== "admin" && user.status === "active" && (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => void impersonate(user)}
                    >
                      Impersonate · read-only
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const demoBanner = {
  background: "#422006",
  color: "#fcd34d",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #f59e0b",
};
const inputStyle = {
  boxSizing: "border-box" as const,
  display: "block",
  width: "100%",
  padding: 10,
  marginBlockStart: 5,
  borderRadius: 6,
  border: "1px solid #475569",
  background: "#0b1f3a",
  color: "white",
};
