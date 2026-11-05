// Same-origin JSON-RPC proxy: the browser calls /api/rpc; the provider URL (with its API key)
// lives only in the server-only RPC_URL env var and never ships to the client.
// Allowlisted methods only (lib/rpc-allowlist.ts) and a per-IP, cost-weighted rate limit
// (lib/rate-limit.ts): shared via Upstash when UPSTASH_REDIS_REST_URL/TOKEN are set, else per
// instance. WebSocket subscriptions go straight to the public endpoint in NEXT_PUBLIC_WS_URL
// instead (no key needed).
import { checkRpcBody } from "@/lib/rpc-allowlist";
import {
  DEFAULT_LIMIT,
  MemoryLimiter,
  clientIp,
  costOf,
  upstashCheck,
  type LimitResult,
} from "@/lib/rate-limit";

const UPSTREAM = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const LIMIT = Number(process.env.RPC_RATE_LIMIT ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const memory = new MemoryLimiter(LIMIT);

const rpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message } }, { status, headers });

async function limit(ip: string, cost: number): Promise<LimitResult> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      return await upstashCheck(UPSTASH_URL, UPSTASH_TOKEN, ip, cost, LIMIT);
    } catch {
      // Upstash unreachable: fall back to this instance's counter rather than failing open.
    }
  }
  return memory.check(ip, cost);
}

export async function POST(request: Request) {
  const check = checkRpcBody(await request.text());
  if (!check.ok) return rpcError(check.status, check.error);

  const rl = await limit(clientIp(request.headers), costOf(check.body));
  if (!rl.allowed) return rpcError(429, "rate limited, slow down", { "retry-after": String(rl.retryAfterS) });

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(check.body),
      cache: "no-store",
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    // Never echo the upstream URL: it carries the API key.
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: "upstream RPC unavailable" } },
      { status: 502 }
    );
  }
}
