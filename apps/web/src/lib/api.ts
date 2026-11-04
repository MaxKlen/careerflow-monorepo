export const API_URL =
  typeof window === "undefined"
    ? (process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");

type ApiOptions = RequestInit & { cookies?: string };

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
    invalid_origin: "Refresh the app and try that action again.",
    workspace_not_found: "That workspace is no longer available.",
    plan_downgrade_not_supported: "Choose your current plan or an upgrade.",
    active_subscription_not_found: "There is no active subscription to cancel.",
    payment_not_configured: "Checkout is not enabled in this demo environment.",
  };
  if (known[code]) return known[code];
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "The requested item could not be found.";
  if (status === 409)
    return "That action conflicts with the current state. Refresh and try again.";
  return "The request could not be completed. Please try again.";
}

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (options.cookies) headers.set("cookie", options.cookies);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(friendlyApiError(response.status, body));
  }
  return response.json() as Promise<T>;
}

export function apiError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
