// Pure arena feed checks (v2 PRD §10.2, spike 01), unit-tested in CI. An arena coin is only
// safe to list when its MagicBlock oracle feed is live and, scaled by the coin-list exponent,
// agrees with an independent reference price. Spike 01 found both failure modes in the wild:
// a feed whose stored exponent is wrong (BONK: 8 vs the real 10) and a dead feed (AI16Z).
import { v2 } from "@rug-royale/sdk";

export const MAX_DEVIATION_BPS = 200; // 2%
export const MAX_FEED_AGE_S = 60n;

export type CoinStatus =
  | "ok"
  | "stale"
  | "mismatch"
  | "missing"
  | "no-reference";

export interface CoinCheck {
  symbol: string;
  status: CoinStatus;
  /** Oracle price scaled by the coin-list exponent, USD. */
  oracle: number | null;
  reference: number | null;
  deviationBps: number | null;
  ageS: bigint | null;
}

export function checkCoin(
  coin: Pick<v2.ArenaCoin, "symbol" | "exponent">,
  feed: v2.PriceFeed | null,
  reference: number | null,
  nowS: bigint
): CoinCheck {
  const base = {
    symbol: coin.symbol,
    oracle: null,
    reference,
    deviationBps: null,
    ageS: null,
  };
  if (!feed || feed.price <= 0n || feed.postedSlot === 0n)
    return { ...base, status: "missing" };
  const oracle = v2.displayPrice(feed.price, coin.exponent);
  const ageS = nowS - feed.publishTime;
  if (ageS > MAX_FEED_AGE_S) return { ...base, oracle, ageS, status: "stale" };
  if (reference === null || !(reference > 0))
    return { ...base, oracle, ageS, status: "no-reference" };
  const deviationBps = Math.round(
    (Math.abs(oracle - reference) / reference) * 10_000
  );
  return {
    ...base,
    oracle,
    ageS,
    deviationBps,
    status: deviationBps > MAX_DEVIATION_BPS ? "mismatch" : "ok",
  };
}

/** True when every coin is safe to list. "no-reference" fails unless explicitly allowed. */
export const allPass = (checks: CoinCheck[], allowNoReference = false) =>
  checks.every(
    (c) =>
      c.status === "ok" || (allowNoReference && c.status === "no-reference")
  );
