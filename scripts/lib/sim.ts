// PRD §10.5: simulate duels with the shared math to pick `pool_seed_ratio` and
// `swap_fee_bps` before Config is initialized on devnet (Config is permanent).
//
// Model: one pool seeded `bankroll × ratio` on both sides (opening price 1.0, G5). Two
// players, each with `bankroll` quote and no coin, take turns over `rounds` rounds; the
// order inside each round is random, which models the opening race (P2). At the end each
// player is valued with `finalValue` against the same end reserves, exactly as `settle`.
//
// Strategies (simple on purpose; they only need to span "never trade" to "race the open"):
//   hold      never trades, so it ends at exactly `bankroll`.
//   frontrun  buys its whole bankroll on its first turn, then holds.
//   scalp     buys 10-40% of its quote; sells all once the position is up 2% after fees.
//   fade      trades against the last move: price up >1% sells half its coin, down >1%
//             buys with 25% of its quote. Opens with a 10% buy so it has something to fade.
import {
  Reserves,
  buyOut,
  duelResult,
  finalValue,
  sellOut,
} from "@rug-royale/sdk";
import { rng } from "./rng";

export const STRATEGIES = ["hold", "frontrun", "scalp", "fade"] as const;
export type Strategy = (typeof STRATEGIES)[number];

interface Player {
  strategy: Strategy;
  quote: bigint;
  coin: bigint;
  /** Quote spent on the current coin position (scalp's cost basis). */
  cost: bigint;
  /** Pool price (quote per coin, scaled by PRICE_SCALE) at this player's last turn. */
  lastPrice: bigint | null;
  traded: boolean;
}

type Action = { side: "buy" | "sell"; amount: bigint } | null;

const PRICE_SCALE = 1_000_000_000n;
const price = (r: Reserves) => (r.quoteReserve * PRICE_SCALE) / r.tokenReserve;
const pct = (x: bigint, p: bigint) => (x * p) / 100n;

function decide(
  p: Player,
  r: Reserves,
  feeBps: number,
  rand: ReturnType<typeof rng>
): Action {
  const now = price(r);
  const moved =
    p.lastPrice === null
      ? 0n
      : ((now - p.lastPrice) * 100n * 100n) / p.lastPrice; // bps
  switch (p.strategy) {
    case "hold":
      return null;
    case "frontrun":
      return p.traded ? null : { side: "buy", amount: p.quote };
    case "scalp": {
      if (p.coin > 0n) {
        const value = sellOut(p.coin, r, feeBps).out;
        return value * 100n >= p.cost * 102n
          ? { side: "sell", amount: p.coin }
          : null;
      }
      return { side: "buy", amount: pct(p.quote, BigInt(rand.int(10, 40))) };
    }
    case "fade": {
      if (!p.traded) return { side: "buy", amount: pct(p.quote, 10n) };
      if (moved > 100n && p.coin > 0n)
        return { side: "sell", amount: p.coin / 2n };
      if (moved < -100n) return { side: "buy", amount: pct(p.quote, 25n) };
      return null;
    }
  }
}

export interface DuelParams {
  bankroll: bigint;
  ratio: bigint;
  feeBps: number;
  rounds: number;
  a: Strategy;
  b: Strategy;
}

export interface DuelOutcome {
  finalA: bigint;
  finalB: bigint;
  result: 1 | 2 | 3;
  /** 0 = creator (A) bought first, 1 = opponent (B), null = nobody bought. */
  firstBuyer: 0 | 1 | null;
  /** Both players made at least one trade (the opening race only exists then). */
  bothTraded: boolean;
}

export function simulateDuel(
  d: DuelParams,
  rand: ReturnType<typeof rng>
): DuelOutcome {
  const seed = d.bankroll * d.ratio;
  let r: Reserves = { quoteReserve: seed, tokenReserve: seed };
  const players: Player[] = [d.a, d.b].map((strategy) => ({
    strategy,
    quote: d.bankroll,
    coin: 0n,
    cost: 0n,
    lastPrice: null,
    traded: false,
  }));
  let firstBuyer: 0 | 1 | null = null;

  for (let round = 0; round < d.rounds; round++) {
    const order = rand.next() < 0.5 ? [0, 1] : [1, 0];
    for (const i of order) {
      const p = players[i];
      const act = decide(p, r, d.feeBps, rand);
      p.lastPrice = price(r);
      if (!act || act.amount <= 0n) continue;
      if (act.side === "buy") {
        const amount = act.amount > p.quote ? p.quote : act.amount;
        const q = buyOut(amount, r, d.feeBps);
        if (q.out === 0n) continue; // the program rejects with ZeroOutput
        r = q;
        p.quote -= amount;
        p.coin += q.out;
        p.cost += amount;
        if (firstBuyer === null) firstBuyer = i as 0 | 1;
      } else {
        const amount = act.amount > p.coin ? p.coin : act.amount;
        const q = sellOut(amount, r, d.feeBps);
        if (q.out === 0n) continue;
        r = q;
        p.cost = p.coin === amount ? 0n : p.cost - (p.cost * amount) / p.coin;
        p.coin -= amount;
        p.quote += q.out;
      }
      p.traded = true;
    }
  }

  const [a, b] = players;
  const finalA = finalValue(a.quote, a.coin, r, d.feeBps);
  const finalB = finalValue(b.quote, b.coin, r, d.feeBps);
  return {
    finalA,
    finalB,
    result: duelResult(finalA, finalB),
    firstBuyer,
    bothTraded: a.traded && b.traded,
  };
}

export interface ConfigReport {
  ratio: bigint;
  feeBps: number;
  duels: number;
  /**
   * Among duels where both players traded and nobody tied: share won by whoever bought
   * first. 50% means the opening race decides nothing; 100% means it decides everything.
   */
  firstBuyerWinRate: number;
  /** Same, restricted to frontrun vs frontrun: the pure opening race. */
  raceWinRate: number;
  tieRate: number;
  /** Final value as % of bankroll, all players: p10 / p50 / p90. */
  finalPct: { p10: number; p50: number; p90: number };
  /** Mean |final_a - final_b| as % of bankroll: how much the duel separates players. */
  meanGapPct: number;
  /** Win rate of the row strategy against the column strategy (ties count half). */
  matchups: Record<Strategy, Record<Strategy, number>>;
}

const quantile = (xs: number[], q: number) =>
  xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];

export function simulateConfig(args: {
  ratio: bigint;
  feeBps: number;
  duels: number;
  bankroll: bigint;
  rounds: number;
  seed: number;
}): ConfigReport {
  const rand = rng(args.seed);
  const bank = Number(args.bankroll);
  const finals: number[] = [];
  let decided = 0;
  let firstWins = 0;
  let races = 0;
  let raceWins = 0;
  let ties = 0;
  let gap = 0;
  const score: Record<string, { pts: number; n: number }> = {};

  for (let k = 0; k < args.duels; k++) {
    const a = rand.pick(STRATEGIES);
    const b = rand.pick(STRATEGIES);
    const o = simulateDuel(
      {
        bankroll: args.bankroll,
        ratio: args.ratio,
        feeBps: args.feeBps,
        rounds: args.rounds,
        a,
        b,
      },
      rand
    );
    finals.push(
      (Number(o.finalA) / bank) * 100,
      (Number(o.finalB) / bank) * 100
    );
    gap += (Math.abs(Number(o.finalA - o.finalB)) / bank) * 100;
    if (o.result === 3) ties++;
    else if (o.bothTraded && o.firstBuyer !== null) {
      const won =
        (o.result === 1 && o.firstBuyer === 0) ||
        (o.result === 2 && o.firstBuyer === 1);
      decided++;
      if (won) firstWins++;
      if (a === "frontrun" && b === "frontrun") {
        races++;
        if (won) raceWins++;
      }
    }
    const ptsA = o.result === 1 ? 1 : o.result === 3 ? 0.5 : 0;
    for (const [row, col, pts] of [
      [a, b, ptsA],
      [b, a, 1 - ptsA],
    ] as const) {
      const key = `${row}|${col}`;
      score[key] ??= { pts: 0, n: 0 };
      score[key].pts += pts;
      score[key].n++;
    }
  }

  finals.sort((x, y) => x - y);
  const matchups = Object.fromEntries(
    STRATEGIES.map((row) => [
      row,
      Object.fromEntries(
        STRATEGIES.map((col) => {
          const s = score[`${row}|${col}`];
          return [col, s ? s.pts / s.n : NaN];
        })
      ),
    ])
  ) as ConfigReport["matchups"];

  return {
    ratio: args.ratio,
    feeBps: args.feeBps,
    duels: args.duels,
    firstBuyerWinRate: decided ? firstWins / decided : NaN,
    raceWinRate: races ? raceWins / races : NaN,
    tieRate: ties / args.duels,
    finalPct: {
      p10: quantile(finals, 0.1),
      p50: quantile(finals, 0.5),
      p90: quantile(finals, 0.9),
    },
    meanGapPct: gap / args.duels,
    matchups,
  };
}
