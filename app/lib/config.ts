const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

/**
 * NEXT_PUBLIC_RPC_URL with forgiving parsing: trims whitespace and stray quotes, and falls
 * back to public devnet if the value is empty or not an http(s) URL. A bad env var must not
 * break the build: ConnectionProvider throws on anything that isn't http(s), even at prerender.
 */
function resolveRpcUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (/^https?:\/\/\S+$/.test(value)) return value;
  if (value) console.warn(`NEXT_PUBLIC_RPC_URL is not an http(s) URL; using ${DEFAULT_RPC_URL}`);
  return DEFAULT_RPC_URL;
}

export const RPC_URL = resolveRpcUrl(process.env.NEXT_PUBLIC_RPC_URL);
export const CLUSTER = "devnet";

export const explorerUrl = (kind: "address" | "tx", id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`;

/** create_duel's account inits exceed the 200k default (PRD §6.2). */
export const CREATE_DUEL_CU = 400_000;
