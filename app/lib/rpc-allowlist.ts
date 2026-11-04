// JSON-RPC validation for the /api/rpc proxy (pure; unit-tested from the repo root).
// The proxy exists so the RPC provider's API key (e.g. Helius ?api-key=) stays on the server:
// anything referenced as NEXT_PUBLIC_* is inlined into the JavaScript every visitor downloads.

/** Methods the app and wallet adapter need. Everything else is rejected (not an open proxy). */
export const ALLOWED_METHODS = new Set([
  // reads
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getBalance",
  "getTransaction",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getLatestBlockhash",
  "isBlockhashValid",
  "getBlockHeight",
  "getSlot",
  "getEpochInfo",
  "getMinimumBalanceForRentExemption",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "getVersion",
  "getGenesisHash",
  "getHealth",
  // writes / simulation (the wallet signs; the proxy only relays signed bytes)
  "sendTransaction",
  "simulateTransaction",
]);

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_BATCH = 20;

export type RpcCheck =
  | { ok: true; body: unknown }
  | { ok: false; status: number; error: string };

/** Validates a raw JSON-RPC request body (single request or batch). */
export function checkRpcBody(raw: string): RpcCheck {
  if (raw.length > MAX_BODY_BYTES)
    return { ok: false, status: 413, error: "request too large" };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: "invalid JSON" };
  }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH)
    return { ok: false, status: 400, error: "bad batch size" };
  for (const c of calls) {
    const method = (c as { method?: unknown })?.method;
    if (typeof method !== "string" || !ALLOWED_METHODS.has(method))
      return {
        ok: false,
        status: 403,
        error: `method not allowed: ${String(method).slice(0, 40)}`,
      };
  }
  return { ok: true, body };
}
