const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
function apiBase(): string {
  if (typeof window !== "undefined" || !BASE.startsWith("/")) return BASE;
  return process.env.API_PROXY_TARGET ?? "http://localhost:4000";
}

function friendlyApiError(status: number, body: string): string {
  let code = "";
  try {
    const payload = JSON.parse(body) as { error?: unknown };
    if (typeof payload.error === "string") code = payload.error;
  } catch {
    // Ignore non-JSON server responses and use the status fallback below.
  }
  const known: Record<string, string> = {
    invalid_request: "Some required details are missing or invalid.",
    invalid_origin: "Refresh the admin app and try that action again.",
    account_not_found: "The selected account could not be found.",
    target_not_found: "The selected account could not be found.",
  };
  if (known[code]) return known[code];
  if (status === 401)
    return "Your admin session has expired. Please sign in again.";
  if (status === 403) return "This action is not allowed for your admin role.";
  if (status === 404) return "The requested item could not be found.";
  if (status === 409)
    return "That action conflicts with the current state. Refresh and try again.";
  return "The request could not be completed. Please try again.";
}
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const base = apiBase();
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (base.startsWith("http") && new URL(base).hostname.endsWith(".loca.lt")) {
    headers.set("Bypass-Tunnel-Reminder", "true");
  }
  if (
    typeof window === "undefined" &&
    BASE.startsWith("/") &&
    !headers.has("origin")
  ) {
    const origin = process.env.ADMIN_URL ?? "http://localhost:3001";
    headers.set("origin", new URL(origin).origin);
  }
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(friendlyApiError(response.status, await response.text()));
  return response.json() as Promise<T>;
}
