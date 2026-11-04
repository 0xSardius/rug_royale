const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com";

/**
 * JSON-RPC endpoint for the browser: the same-origin /api/rpc proxy, which forwards to the
 * server-only RPC_URL (so a provider API key never ships in the client bundle). During
 * prerender there is no window; ConnectionProvider still needs an http(s) URL, so use public
 * devnet there (no requests are made at prerender).
 * Never reference a NEXT_PUBLIC_* variable holding a keyed URL: Next.js inlines it.
 */
export const RPC_URL =
  typeof window === "undefined" ? PUBLIC_DEVNET_RPC : `${window.location.origin}/api/rpc`;

/**
 * WebSocket endpoint for subscriptions (transaction confirmations). Serverless routes can't
 * proxy WebSockets, so this goes to a public endpoint. It must NOT contain an API key.
 */
function resolveWsUrl(raw: string | undefined): string {
  const value = (raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  if (/^wss?:\/\/\S+$/.test(value) && !/api[-_]?key/i.test(value)) return value;
  return "wss://api.devnet.solana.com";
}
export const WS_URL = resolveWsUrl(process.env.NEXT_PUBLIC_WS_URL);
export const CLUSTER = "devnet";

export const explorerUrl = (kind: "address" | "tx", id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`;

/** create_duel's account inits exceed the 200k default (PRD §6.2). */
export const CREATE_DUEL_CU = 400_000;
