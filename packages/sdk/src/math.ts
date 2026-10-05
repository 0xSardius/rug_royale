// PRD §7 math, mirrored exactly by programs/rug_royale/src/math (invariant I12).
// bigint throughout; every division rounds down, as u128 integer division does in Rust.
// Do not change a formula here without changing the Rust in the same PR.

export const BPS = 10_000n;

export type Side = "buy" | "sell";

export interface Reserves {
  quoteReserve: bigint;
  tokenReserve: bigint;
}

export interface SwapQuote extends Reserves {
  /** Tokens out (coin for a buy, quote for a sell). 0 means the program rejects with ZeroOutput. */
  out: bigint;
}

/** Input after the swap fee. The fee stays in the pool (G4). */
export const netOfFee = (amountIn: bigint, feeBps: number) =>
  (amountIn * (BPS - BigInt(feeBps))) / BPS;

/** Buy: quote in, coin out. */
export function buyOut(
  amountIn: bigint,
  r: Reserves,
  feeBps: number
): SwapQuote {
  const inNet = netOfFee(amountIn, feeBps);
  const out = (r.tokenReserve * inNet) / (r.quoteReserve + inNet);
  return {
    out,
    quoteReserve: r.quoteReserve + amountIn,
    tokenReserve: r.tokenReserve - out,
  };
}

/** Sell: coin in, quote out. */
export function sellOut(
  amountIn: bigint,
  r: Reserves,
  feeBps: number
): SwapQuote {
  const inNet = netOfFee(amountIn, feeBps);
  const out = (r.quoteReserve * inNet) / (r.tokenReserve + inNet);
  return {
    out,
    quoteReserve: r.quoteReserve - out,
    tokenReserve: r.tokenReserve + amountIn,
  };
}

export const swapQuote = (
  side: Side,
  amountIn: bigint,
  r: Reserves,
  feeBps: number
) =>
  side === "buy" ? buyOut(amountIn, r, feeBps) : sellOut(amountIn, r, feeBps);

/** `min_out` for a quote with `slippageBps` tolerance (UI default 100 = 1%). */
export const minOutWithSlippage = (out: bigint, slippageBps: number) =>
  (out * (BPS - BigInt(slippageBps))) / BPS;

/**
 * A player's value at settle (and the live "value if sold now"): quote balance plus the
 * fee-inclusive sell of the whole coin balance against the given reserves. Pure and
 * order-independent: each player is valued alone against the same reserves (I6).
 */
export function finalValue(
  quoteVault: bigint,
  coinVault: bigint,
  r: Reserves,
  feeBps: number
): bigint {
  return (
    quoteVault + (coinVault === 0n ? 0n : sellOut(coinVault, r, feeBps).out)
  );
}

/** `Duel.result`: 1 creator, 2 opponent, 3 tie (G7, G9). */
export const duelResult = (finalA: bigint, finalB: bigint): 1 | 2 | 3 =>
  finalA > finalB ? 1 : finalA < finalB ? 2 : 3;

export interface Payout {
  pot: bigint;
  rake: bigint;
  tip: bigint;
  /** Winner's payout; 0 on a tie. */
  prize: bigint;
  toCreator: bigint;
  toOpponent: bigint;
  toTreasury: bigint;
  toSettler: bigint;
}

/**
 * PRD §7 payout. Sum of all transfers equals `pot` exactly (I2).
 * Winner: rake (0 when entry is 0), then tip from what remains, rest to the winner.
 * Tie: entries back in full, no rake, tip from sponsored only, sponsored remainder split
 * with the odd lamport to the creator (G8, G15).
 */
export function payout(args: {
  entryLamports: bigint;
  sponsoredLamports: bigint;
  settlerTipLamports: bigint;
  rakeBps: number;
  result: 1 | 2 | 3;
}): Payout {
  const {
    entryLamports: E,
    sponsoredLamports: S,
    settlerTipLamports: T,
  } = args;
  const pot = 2n * E + S;
  const min = (a: bigint, b: bigint) => (a < b ? a : b);

  if (args.result === 3) {
    const tip = min(T, S);
    const rest = S - tip;
    return {
      pot,
      rake: 0n,
      tip,
      prize: 0n,
      toCreator: E + rest / 2n + (rest % 2n),
      toOpponent: E + rest / 2n,
      toTreasury: 0n,
      toSettler: tip,
    };
  }

  const rake = E === 0n ? 0n : (pot * BigInt(args.rakeBps)) / BPS;
  const tip = min(T, pot - rake);
  const prize = pot - rake - tip;
  return {
    pot,
    rake,
    tip,
    prize,
    toCreator: args.result === 1 ? prize : 0n,
    toOpponent: args.result === 2 ? prize : 0n,
    toTreasury: rake,
    toSettler: tip,
  };
}

// --- Display helpers (client only; never used for settlement) ---------------

/** Quote per coin at the current reserves, as a float for charts. */
export const spotPrice = (r: Reserves) =>
  Number(r.quoteReserve) / Number(r.tokenReserve);

/** PnL in basis points vs the starting bankroll (G7: the program compares values, not %). */
export const pnlBps = (value: bigint, bankroll: bigint) =>
  bankroll === 0n ? 0 : Number(((value - bankroll) * BPS) / bankroll);
