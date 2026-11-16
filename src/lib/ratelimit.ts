/**
 * Fixed-window rate limiter, keyed by client IP.
 *
 * Active only when HOSTED_DEMO=true or RATE_LIMIT=true.
 * Window limits are configurable via env vars:
 *   RATE_LIMIT_CHAT_PER_MIN   (default 30) — /api/chat and /api/conference
 *   RATE_LIMIT_WRITE_PER_MIN  (default 20) — /api/memory writes
 *
 * The in-memory map is bounded: once it exceeds MAX_ENTRIES the oldest
 * entries (by window start) are evicted until it is half that size.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_ENTRIES = 10_000;

export type LimitBucket = "chat" | "write";

interface Entry {
  count: number;
  windowStart: number;
}

const store = new Map<string, Entry>();

function limitFor(bucket: LimitBucket): number {
  if (bucket === "write") {
    return Number(process.env.RATE_LIMIT_WRITE_PER_MIN ?? 20);
  }
  return Number(process.env.RATE_LIMIT_CHAT_PER_MIN ?? 30);
}

function evict(): void {
  if (store.size < MAX_ENTRIES) return;
  // Collect all entries, sort by windowStart ascending, drop the oldest half.
  const entries = [...store.entries()].sort(
    ([, a], [, b]) => a.windowStart - b.windowStart
  );
  const target = Math.floor(MAX_ENTRIES / 2);
  for (let i = 0; i < entries.length - target; i++) {
    store.delete(entries[i]![0]);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets (only meaningful when !allowed). */
  retryAfterSeconds: number;
}

/**
 * Check whether `ip` is within the rate limit for `bucket`.
 * Increments the counter when allowed.
 */
export function checkRateLimit(ip: string, bucket: LimitBucket): RateLimitResult {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const limit = limitFor(bucket);

  let entry = store.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // Start a fresh window.
    evict();
    entry = { count: 0, windowStart: now };
    store.set(key, entry);
  }

  if (entry.count >= limit) {
    const retryAfterSeconds = Math.ceil(
      (entry.windowStart + WINDOW_MS - now) / 1000
    );
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Whether rate limiting is active in the current environment. */
export function isRateLimitEnabled(): boolean {
  return (
    process.env.HOSTED_DEMO === "true" || process.env.RATE_LIMIT === "true"
  );
}

/** Extract the best-effort client IP from request headers. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    // Use the LAST entry: the reverse proxy (Caddy) is the only hop that can
    // reach the app and the address it appends/sets is the real client.
    // Anything a client puts earlier in the header is attacker-controlled.
    const parts = xff.split(",").map((x) => x.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "unknown";
}

/** Exposed for tests: reset the limiter state. */
export function _resetStore(): void {
  store.clear();
}
