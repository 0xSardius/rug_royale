// Client-side trade previews and live mark-to-market for the duel room (PnL race bar). Uses
// the exact program math (math.ts), so a preview equals what `trade` / `finalize_match` do
// at the same price.
import { BPS, buyQuote, portfolioValue, sellQuote } from "./math";
import type { Seat } from "./decode";

/**
 * Limit price for a trade with `slippageBps` tolerance around the current raw price:
 * buys accept up to price * (1 + s), sells down to price * (1 - s).
 */
export function limitWithSlippage(
  price: bigint,
  side: "buy" | "sell",
  slippageBps: number
): bigint {
  const s = BigInt(slippageBps);
  return side === "buy" ? (price * (BPS + s)) / BPS : (price * (BPS - s)) / BPS;
}

export interface TradePreview {
  amountOut: bigint;
  fee: bigint;
  limitPrice: bigint;
}

/** What `trade` would return at `price` (raw feed units, arena exponent). */
export function previewTrade(
  side: "buy" | "sell",
  amount: bigint,
  price: bigint,
  exponent: number,
  feeBps: number,
  slippageBps = 50
): TradePreview {
  const limitPrice = limitWithSlippage(price, side, slippageBps);
  if (side === "buy") {
    const q = buyQuote(amount, price, exponent, feeBps);
    return { amountOut: q.qtyOut, fee: q.fee, limitPrice };
  }
  const q = sellQuote(amount, price, exponent, feeBps);
  return { amountOut: q.cashOut, fee: q.fee, limitPrice };
}

/**
 * A seat's live value in micro-USD at the given raw prices (null = unknown price: the asset
 * must not be held). Same formula as finalize, so at end_ts it predicts the result.
 */
export function markToMarket(
  seat: Seat,
  prices: (bigint | null)[],
  exponents: number[]
): bigint {
  const marks = seat.qty.map((q, i) => {
    if (q === 0n) return 0n;
    const p = prices[i];
    if (p === null || p === undefined)
      throw new Error(`no price for held asset ${i}`);
    return p;
  });
  return portfolioValue(
    seat.cash,
    seat.qty.slice(0, exponents.length),
    marks.slice(0, exponents.length),
    exponents
  );
}

/** PnL in basis points vs the starting bankroll (positive = up). */
export const pnlBps = (value: bigint, bankroll: bigint) =>
  Number(((value - bankroll) * BPS) / bankroll);

/** Whether a feed's publish time is within the match's max price age (trade would accept it). */
export const isFresh = (publishTime: bigint, nowS: bigint, maxAgeS: number) =>
  nowS - publishTime <= BigInt(maxAgeS);
