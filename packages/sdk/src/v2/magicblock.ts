// MagicBlock endpoints and routing for v2 (build item 8). A match lives in exactly one place:
// - Open: on the base layer (not yet delegated).
// - Active, until finalize commits it home: in the ER region whose validator is in
//   Pot.validator (pinned at create, D6). Reads and `trade` / `finalize_match` go there.
// - Finalized after the commit lands: on the base layer again (settle, close).
// Pot (the money) is always on the base layer. No API keys are needed for these endpoints.
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID } from "./pdas";

export type Cluster = "devnet" | "mainnet";
export type Region = "us" | "eu" | "as";

/** Region validator identities (spike 02; identical on devnet and mainnet as of 2026-11-04). */
export const VALIDATORS: Record<Region, PublicKey> = {
  us: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
  eu: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  as: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
};

export const MAGICBLOCK: Record<
  Cluster,
  { router: string; er: Record<Region, string> }
> = {
  devnet: {
    router: "https://devnet-router.magicblock.app",
    er: {
      us: "https://devnet-us.magicblock.app",
      eu: "https://devnet-eu.magicblock.app",
      as: "https://devnet-as.magicblock.app",
    },
  },
  mainnet: {
    router: "https://router.magicblock.app",
    er: {
      us: "https://us.magicblock.app",
      eu: "https://eu.magicblock.app",
      as: "https://as.magicblock.app",
    },
  },
};

export const REGION_LABEL: Record<Region, string> = {
  us: "US",
  eu: "Europe",
  as: "Asia",
};

/** The region of a validator identity (e.g. Pot.validator), or null if unknown. */
export function regionOf(validator: PublicKey): Region | null {
  for (const r of Object.keys(VALIDATORS) as Region[])
    if (VALIDATORS[r].equals(validator)) return r;
  return null;
}

/** ER RPC URL for a validator identity on a cluster (no router round trip needed). */
export function erEndpoint(
  validator: PublicKey,
  cluster: Cluster
): string | null {
  const r = regionOf(validator);
  return r ? MAGICBLOCK[cluster].er[r] : null;
}

/** A Connection to the ER that holds (or will hold) a match, from its Pot.validator. */
export function erConnection(
  validator: PublicKey,
  cluster: Cluster,
  commitment: "processed" | "confirmed" = "confirmed"
) {
  const url = erEndpoint(validator, cluster);
  if (!url) throw new Error(`unknown ER validator ${validator.toBase58()}`);
  return new Connection(url, {
    commitment,
    wsEndpoint: url.replace("https", "wss"),
  });
}

export interface DelegationStatus {
  isDelegated: boolean;
  /** ER endpoint holding the account, when delegated to a known node. */
  fqdn: string | null;
  /** Router error text (e.g. accounts delegated to "any validator", like oracle feeds). */
  error?: string;
}

/**
 * Asks MagicBlock's router where an account is delegated. Use it for ROUTING HINTS only:
 * observed 2026-11-04 on devnet, the router still reported a match as delegated a day after
 * it was undelegated. Whether a match is home is decided by its base-layer owner
 * (`matchLocation`), which is also what `settle` checks on-chain.
 */
export async function getDelegationStatus(
  account: PublicKey,
  cluster: Cluster,
  fetchImpl: typeof fetch = fetch
): Promise<DelegationStatus> {
  const r = await fetchImpl(MAGICBLOCK[cluster].router, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getDelegationStatus",
      params: [account.toBase58()],
    }),
  });
  const j = (await r.json()) as {
    result?: { isDelegated?: boolean; fqdn?: string };
    error?: { message?: string };
  };
  if (j.error)
    return {
      isDelegated: false,
      fqdn: null,
      error: j.error.message ?? "router error",
    };
  return {
    isDelegated: !!j.result?.isDelegated,
    fqdn: j.result?.fqdn ? j.result.fqdn.replace(/\/$/, "") : null,
  };
}

/**
 * Waits until `account` is owned by `programId` on the base layer again, i.e. the ER's
 * commit + undelegation landed (~1-2 s after finalize_match, spike 02 / item 6).
 */
export async function waitForUndelegation(
  base: Connection,
  account: PublicKey,
  programId: PublicKey,
  timeoutMs = 60_000,
  pollMs = 300
): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const info = await base.getAccountInfo(account, "confirmed");
    if (info?.owner.equals(programId)) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}

export type MatchLocation = "base" | "er" | "missing";

/**
 * Where a match's live state is, from its BASE-LAYER account info (the source of truth):
 * owned by the Delegation Program = in the ER; owned by the program = home on base.
 */
export function matchLocationFromInfo(
  info: AccountInfo<Buffer> | null,
  programId: PublicKey
): MatchLocation {
  if (!info) return "missing";
  if (info.owner.equals(DELEGATION_PROGRAM_ID)) return "er";
  if (info.owner.equals(programId)) return "base";
  throw new Error(
    `match owned by an unexpected program ${info.owner.toBase58()}`
  );
}

export async function matchLocation(
  base: Connection,
  matchAccount: PublicKey,
  programId: PublicKey
): Promise<MatchLocation> {
  return matchLocationFromInfo(
    await base.getAccountInfo(matchAccount, "confirmed"),
    programId
  );
}
