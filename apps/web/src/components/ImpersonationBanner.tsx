"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export default function ImpersonationBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function endSession() {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/auth/impersonation/end", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.location.assign("/signin");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not end the session.",
      );
      setBusy(false);
    }
  }
  return (
    <section
      role="alert"
      style={{
        background: "#7c2d12",
        color: "#fff7ed",
        padding: 12,
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
      }}
    >
      <span>
        <strong>ADMIN IMPERSONATION · READ ONLY</strong> — you are viewing{" "}
        {email}; changes are blocked and this session expires automatically in
        15 minutes.
      </span>
      <button disabled={busy} onClick={() => void endSession()}>
        {busy ? "Ending…" : "End session"}
      </button>
      {error && <small>{error}</small>}
    </section>
  );
}
