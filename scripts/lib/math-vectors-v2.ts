// Deterministic v2 PRD §7 test vectors from packages/sdk/src/v2/math.ts, for the Rust math
// unit tests in programs/rug_royale_v2 to load and match exactly (invariant I12).
// Values are decimal strings; "overflow" marks cases where the program must return
// MathOverflow.
import { v2 } from "@rug-royale/sdk";
import { rng } from "./rng";

export const V2_VECTORS_SEED = 21;
export const V2_MATH_VECTORS_PATH =
  "programs/rug_royale_v2/tests/vectors/math.json";
const U64_MAX = 2n ** 64n - 1n;
const s = (v: bigint) => v.toString();
const orOverflow = <T>(
  f: () => T,
  map: (t: T) => [string, string]
): [string, string] => {
  try {
    return map(f());
  } catch (e) {
    if ((e as Error).message === "MathOverflow") return ["overflow", "0"];
    throw e;
  }
};

export function generateV2MathVectors() {
  const g = rng(V2_VECTORS_SEED);

  // Realistic feed prices per exponent (spike 01), plus extremes.
  // Raw prices are independent of the exponent in practice (BONK ~29,220 at e=10, SOL
  // ~9.4e9 at e=8, BTC ~7.8e12 at e=8), so sample across that whole range.
  const priceFor = (_e: number) =>
    g.pick([
      g.big(1n, 100_000n),
      g.big(1_000_000n, 10n ** 10n),
      g.big(10n ** 11n, 10n ** 13n),
    ]);
  const exps = [6, 8, 10, 12] as const;

  const trades = [];
  for (let i = 0; i < 600; i++) {
    const side = g.pick(["buy", "sell"] as const);
    const e = g.pick(exps);
    const price = priceFor(e);
    const feeBps = g.pick([0, 10, 30, 1000]);
    // Buys: cash up to $1e9 bankrolls; sells: quantities across the whole u64 range.
    const amount =
      side === "buy"
        ? g.pick([g.big(1n, 1_000_000n), g.big(1_000_000n, 10n ** 15n)])
        : g.pick([
            g.big(1n, 10n ** 9n),
            g.big(10n ** 9n, 10n ** 16n),
            g.big(10n ** 16n, U64_MAX),
          ]);
    const [out, fee] =
      side === "buy"
        ? orOverflow(
            () => v2.buyQuote(amount, price, e, feeBps),
            (q) => [s(q.qtyOut), s(q.fee)]
          )
        : orOverflow(
            () => v2.sellQuote(amount, price, e, feeBps),
            (q) => [s(q.cashOut), s(q.fee)]
          );
    trades.push({
      side,
      amount: s(amount),
      price: s(price),
      exponent: e,
      fee_bps: feeBps,
      out,
      fee,
    });
  }
  // Edges: dust that rounds to 0 (ZeroOutput), buy overflow (tiny price, e=18), max sell.
  const edges: ["buy" | "sell", bigint, bigint, number, number][] = [
    ["buy", 1n, 10n ** 13n, 8, 10],
    ["sell", 1n, 1n, 10, 0],
    ["buy", 9_999n, 1n, 6, 1000],
    ["buy", 10n ** 15n, 1n, 18, 0],
    ["sell", U64_MAX, 10n ** 13n, 6, 0],
    ["sell", U64_MAX, 1n, 18, 30],
  ];
  for (const [side, amount, price, e, feeBps] of edges) {
    const [out, fee] =
      side === "buy"
        ? orOverflow(
            () => v2.buyQuote(amount, price, e, feeBps),
            (q) => [s(q.qtyOut), s(q.fee)]
          )
        : orOverflow(
            () => v2.sellQuote(amount, price, e, feeBps),
            (q) => [s(q.cashOut), s(q.fee)]
          );
    trades.push({
      side,
      amount: s(amount),
      price: s(price),
      exponent: e,
      fee_bps: feeBps,
      out,
      fee,
    });
  }

  const valuations = [];
  for (let i = 0; i < 300; i++) {
    const n = g.int(1, 10);
    const exponents = Array.from({ length: n }, () => g.pick(exps));
    const qty = Array.from({ length: n }, () =>
      g.next() < 0.3 ? 0n : g.big(1n, 10n ** 16n)
    );
    const marks = exponents.map((e, a) =>
      qty[a] === 0n && g.next() < 0.5 ? 0n : priceFor(e)
    );
    const cash = g.big(0n, 10n ** 13n);
    const [value] = orOverflow(
      () => v2.portfolioValue(cash, qty, marks, exponents),
      (v) => [s(v), "0"]
    );
    valuations.push({
      cash: s(cash),
      qty: qty.map(s),
      marks: marks.map(s),
      exponents,
      value,
    });
  }

  const payouts = [];
  const F = 3_010_000n;
  for (let i = 0; i < 400; i++) {
    const entry = g.pick([0n, 0n, g.big(10_000_001n, 10n ** 10n)]);
    const sponsored = g.pick([0n, g.big(10_000_000n, 10n ** 10n)]);
    const matchFee = g.pick([F, F + 1n, g.big(0n, 10_000_000n)]);
    const share = v2.feeShare(entry, matchFee);
    const tip = g.pick([0n, 1_000_000n, g.big(0n, 10_000_000n)]);
    const rakeBps = g.pick([0, 250, 500, 1000]);
    const result = g.pick([1, 2, 3] as const);
    const p = v2.payout({
      entry,
      sponsored,
      matchFee,
      feeShare: share,
      settlerTip: tip,
      rakeBps,
      result,
    });
    payouts.push({
      entry: s(entry),
      sponsored: s(sponsored),
      match_fee: s(matchFee),
      fee_share: s(share),
      settler_tip: s(tip),
      rake_bps: rakeBps,
      result,
      pot: s(p.pot),
      fee: s(p.fee),
      rake: s(p.rake),
      tip: s(p.tip),
      prize: s(p.prize),
      to_creator: s(p.toCreator),
      to_opponent: s(p.toOpponent),
      to_treasury: s(p.toTreasury),
      to_settler: s(p.toSettler),
    });
  }
  return { trades, valuations, payouts };
}
