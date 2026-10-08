// PRD §10.5: report first-buyer win rate and the spread of final values for
// pool_seed_ratio in {5, 10, 20} × swap_fee_bps in {0, 30, 100}.
//
//   pnpm sim [--duels 10000] [--rounds 12] [--seed 1]
//
// Model and strategies: scripts/lib/sim.ts.
import { STRATEGIES, simulateConfig } from "./lib/sim";

const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};

const duels = arg("duels", 10_000);
const rounds = arg("rounds", 12); // a 120 s window with one decision every 10 s
const seed = arg("seed", 1);
const bankroll = 1_000n * 1_000_000n; // tier 0: 1,000 tokens, 6 decimals

const RATIOS = [5n, 10n, 20n];
const FEES = [0, 30, 100];

const f1 = (x: number) => x.toFixed(1);
console.log(
  `${duels} duels per config, ${rounds} rounds, seed ${seed}, strategies ${STRATEGIES.join(
    "/"
  )}\n`
);
console.log(
  "ratio  fee   first-buyer wins  pure race  ties    final % of bankroll (p10 / p50 / p90)  mean gap %"
);

const reports = [];
for (const ratio of RATIOS)
  for (const feeBps of FEES) {
    const r = simulateConfig({ ratio, feeBps, duels, bankroll, rounds, seed });
    reports.push(r);
    const cols = [
      String(ratio).padStart(5),
      String(feeBps).padStart(3),
      (f1(r.firstBuyerWinRate * 100) + "%").padStart(16),
      (f1(r.raceWinRate * 100) + "%").padStart(9),
      (f1(r.tieRate * 100) + "%").padStart(5),
      `${f1(r.finalPct.p10).padStart(10)} / ${f1(r.finalPct.p50).padStart(
        5
      )} / ${f1(r.finalPct.p90).padStart(5)}`,
      f1(r.meanGapPct).padStart(14),
    ];
    console.log(cols.join("  "));
  }

for (const r of reports.filter((x) => x.ratio === 10n && x.feeBps === 30)) {
  console.log(
    `\nStrategy win rate, ratio ${r.ratio}, fee ${r.feeBps} bps (row vs column, ties = ½):`
  );
  console.log("          " + STRATEGIES.map((s) => s.padStart(9)).join(""));
  for (const row of STRATEGIES)
    console.log(
      row.padEnd(10) +
        STRATEGIES.map((col) =>
          (f1(r.matchups[row][col] * 100) + "%").padStart(9)
        ).join("")
    );
}
