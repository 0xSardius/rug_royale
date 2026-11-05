// Per-IP rate limiting for the /api/rpc proxy (pure parts; unit-tested from the repo root).
// The proxy hides the RPC provider's API key, but without a limit anyone could still spend
// the provider's credits through it. Requests are weighted: getProgramAccounts (the lobby's
// expensive call) costs more than a point read.

/** Budget per client IP per window (override with RPC_RATE_LIMIT). */
export const DEFAULT_LIMIT = 300;
export const WINDOW_MS = 60_000;

const COST: Record<string, number> = {
  getProgramAccounts: 10,
  getSignaturesForAddress: 3,
  getTransaction: 2,
  simulateTransaction: 2,
};

/** Cost of a validated JSON-RPC body (single request or batch). */
export function costOf(body: unknown): number {
  const calls = Array.isArray(body) ? body : [body];
  return calls.reduce((sum: number, c) => sum + (COST[(c as { method?: string })?.method ?? ""] ?? 1), 0);
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for; first entry is the client). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export interface LimitResult {
  allowed: boolean;
  /** Units used in the current window, including this request if allowed. */
  used: number;
  /** Seconds until the window resets. */
  retryAfterS: number;
}

const windowOf = (now: number) => Math.floor(now / WINDOW_MS);
const retryAfter = (now: number) => Math.max(1, Math.ceil((WINDOW_MS - (now % WINDOW_MS)) / 1000));

/**
 * Fixed-window counter held in this server instance's memory. On Vercel each instance counts
 * separately, so this is a floor, not a guarantee; set UPSTASH_REDIS_REST_URL/TOKEN for a
 * shared limit.
 */
export class MemoryLimiter {
  private counts = new Map<string, { window: number; used: number }>();
  constructor(private limit = DEFAULT_LIMIT, private now: () => number = Date.now) {}

  check(ip: string, cost: number): LimitResult {
    const t = this.now();
    const w = windowOf(t);
    const cur = this.counts.get(ip);
    const used = cur && cur.window === w ? cur.used : 0;
    if (used + cost > this.limit) return { allowed: false, used, retryAfterS: retryAfter(t) };
    this.counts.set(ip, { window: w, used: used + cost });
    if (this.counts.size > 10_000) this.sweep(w);
    return { allowed: true, used: used + cost, retryAfterS: retryAfter(t) };
  }

  private sweep(w: number) {
    for (const [k, v] of this.counts) if (v.window !== w) this.counts.delete(k);
  }
}

/** Shared fixed-window counter in Upstash Redis (REST API; no SDK). Throws on transport errors. */
export async function upstashCheck(
  url: string,
  token: string,
  ip: string,
  cost: number,
  limit = DEFAULT_LIMIT,
  now = Date.now(),
  fetchImpl: typeof fetch = fetch
): Promise<LimitResult> {
  const key = `rl:rpc:${ip}:${windowOf(now)}`;
  const res = await fetchImpl(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify([
      ["INCRBY", key, cost],
      ["EXPIRE", key, Math.ceil((2 * WINDOW_MS) / 1000)],
    ]),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const [incr] = (await res.json()) as { result?: number; error?: string }[];
  if (typeof incr?.result !== "number") throw new Error(`upstash: ${incr?.error ?? "bad reply"}`);
  // INCRBY already counted this request; over the limit means reject it.
  return { allowed: incr.result <= limit, used: incr.result, retryAfterS: retryAfter(now) };
}
