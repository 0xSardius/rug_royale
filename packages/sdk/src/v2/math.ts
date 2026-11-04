// v2 PRD §7 math, mirrored exactly by programs/rug_royale_v2/src/math (invariant I12).
// bigint throughout; every division rounds down (toward the protocol), as u128 integer
// division does in Rust. Any value that would not fit the program's u64 throws
// "MathOverflow", as the program returns RugRoyaleV2Error::MathOverflow.
// Do not change a formula here without changing the Rust in the same PR, then run
// `pnpm math:vectors`.

export const BPS = 10_000n;
export const U64_MAX = 2n ** 64n - 1n;

export const RESULT_PENDING = 0;
export const RESULT_CREATOR = 1;
export const RESULT_OPPONENT = 2;
export const RESULT_TIE = 3;
export type MatchResultCode = 0 | 1 | 2 | 3;

const u64 = (v: bigint): bigint => {
  if (v < 0n || v > U64_MAX) throw new Error("MathOverflow");
  return v;
};
const pow10 = (e: number) => 10n ** BigInt(e);

/** §7.1 Buy: `amount` micro-USD in, quantity (1e-6 token units) out. 0 out = ZeroOutput. */
export function buyQuote(
  amount: bigint,
  price: bigint,
  exponent: number,
  feeBps: number
): { fee: bigint; qtyOut: bigint } {
  if (price <= 0n) throw new Error("PriceInvalid");
  const fee = (amount * BigInt(feeBps)) / BPS;
  const net = amount - fee;
  const qtyOut = u64((net * pow10(exponent)) / price);
  return { fee, qtyOut };
}

/** §7.1 Sell: `amount` quantity in, micro-USD out after the fee. 0 out = ZeroOutput. */
export function sellQuote(
  amount: bigint,
  price: bigint,
  exponent: number,
  feeBps: number
): { gross: bigint; fee: bigint; cashOut: bigint } {
  if (price <= 0n) throw new Error("PriceInvalid");
  const gross = (amount * price) / pow10(exponent);
  const fee = (gross * BigInt(feeBps)) / BPS;
  return { gross: u64(gross), fee, cashOut: u64(gross - fee) };
}

/** §7.2 Portfolio value in micro-USD; assets with qty 0 are skipped (their mark may be 0). */
export function portfolioValue(
  cash: bigint,
  qty: bigint[],
  marks: bigint[],
  exponents: number[]
): bigint {
  let v = cash;
  for (let a = 0; a < qty.length; a++) {
    if (qty[a] === 0n) continue;
    v += (qty[a] * marks[a]) / pow10(exponents[a]);
  }
  return u64(v);
}

export const matchResult = (v0: bigint, v1: bigint): MatchResultCode =>
  v0 > v1 ? RESULT_CREATOR : v0 < v1 ? RESULT_OPPONENT : RESULT_TIE;

/** V7 / Q1: each player's match-fee deposit. Only free duels (entry 0) deposit. */
export const feeShare = (entry: bigint, matchFee: bigint) =>
  entry === 0n ? (matchFee + 1n) / 2n : 0n;

export interface PayoutInput {
  entry: bigint;
  sponsored: bigint;
  matchFee: bigint;
  feeShare: bigint;
  settlerTip: bigint;
  rakeBps: number;
  result: MatchResultCode;
}

export interface Payout {
  pot: bigint;
  fee: bigint;
  rake: bigint;
  tip: bigint;
  prize: bigint;
  toCreator: bigint;
  toOpponent: bigint;
  toTreasury: bigint;
  toSettler: bigint;
}

const min = (...xs: bigint[]) => xs.reduce((a, b) => (b < a ? b : a));

/** §7.3 Payout at settle. The parts always sum to `pot` exactly (I2). */
export function payout(i: PayoutInput): Payout {
  if (i.result === RESULT_PENDING) throw new Error("MatchNotFinalized");
  const pot = u64(2n * i.entry + i.sponsored + 2n * i.feeShare);
  const fee = min(i.matchFee, pot); // -> opponent (reimburses delegation)
  const rest = pot - fee;
  if (i.result === RESULT_TIE) {
    const tip = min(i.settlerTip, i.sponsored, rest);
    const share = rest - tip;
    return {
      pot,
      fee,
      rake: 0n,
      tip,
      prize: 0n,
      toCreator: share / 2n + (share % 2n),
      toOpponent: share / 2n + fee,
      toTreasury: 0n,
      toSettler: tip,
    };
  }
  const rake = i.entry === 0n ? 0n : (rest * BigInt(i.rakeBps)) / BPS;
  const tip = min(i.settlerTip, rest - rake);
  const prize = rest - rake - tip;
  const creatorWins = i.result === RESULT_CREATOR;
  return {
    pot,
    fee,
    rake,
    tip,
    prize,
    toCreator: creatorWins ? prize : 0n,
    toOpponent: fee + (creatorWins ? 0n : prize),
    toTreasury: rake,
    toSettler: tip,
  };
}
