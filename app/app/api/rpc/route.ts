// Same-origin JSON-RPC proxy: the browser calls /api/rpc; the provider URL (with its API key)
// lives only in the server-only RPC_URL env var and never ships to the client.
// Allowlisted methods only (lib/rpc-allowlist.ts). WebSocket subscriptions go straight to the
// public endpoint in NEXT_PUBLIC_WS_URL instead (no key needed).
import { checkRpcBody } from "@/lib/rpc-allowlist";

const UPSTREAM = process.env.RPC_URL ?? "https://api.devnet.solana.com";

export async function POST(request: Request) {
  const check = checkRpcBody(await request.text());
  if (!check.ok) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: check.error },
      },
      { status: check.status }
    );
  }
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
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "upstream RPC unavailable" },
      },
      { status: 502 }
    );
  }
}
