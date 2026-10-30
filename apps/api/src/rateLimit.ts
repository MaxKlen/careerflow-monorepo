// In-memory sliding window. Per-process. If deploying multiple API instances,
// replace with Redis (M8 when we add Redis-backed notifications).

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMIT = 10;

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
  }
}, WINDOW_MS);
cleanup.unref();

export function checkRateLimit(key: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (b.count >= LIMIT) {
    return { ok: false, retryAfterMs: WINDOW_MS - (now - b.windowStart) };
  }
  b.count += 1;
  return { ok: true };
}
