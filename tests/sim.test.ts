import { expect } from "chai";
import { rng } from "../scripts/lib/rng";
import { simulateConfig, simulateDuel } from "../scripts/lib/sim";

// PRD §10.5 sim. Guards the model's basic properties; the numbers themselves are a report.
describe("sim (PRD §10.5)", () => {
  const base = { bankroll: 1_000_000_000n, ratio: 10n, feeBps: 30, rounds: 12 };

  it("is deterministic for a seed", () => {
    const args = { ...base, duels: 200, seed: 3 };
    expect(simulateConfig(args)).to.deep.equal(simulateConfig(args));
  });

  it("hold vs hold ties at exactly the bankroll", () => {
    const o = simulateDuel({ ...base, a: "hold", b: "hold" }, rng(1));
    expect([o.finalA, o.finalB, o.result]).to.deep.equal([
      base.bankroll,
      base.bankroll,
      3,
    ]);
  });

  it("a lone trader cannot beat hold: its round trip only pays fee and rounding", () => {
    for (const s of ["frontrun", "scalp", "fade"] as const) {
      const o = simulateDuel({ ...base, a: "hold", b: s }, rng(2));
      expect(o.finalA).to.equal(base.bankroll);
      expect(o.result, s).to.equal(1);
    }
  });

  it("frontrun vs frontrun: whoever buys first wins (the P2 opening race)", () => {
    for (let seed = 0; seed < 20; seed++) {
      const o = simulateDuel(
        { ...base, a: "frontrun", b: "frontrun" },
        rng(seed)
      );
      expect(o.result).to.equal(o.firstBuyer === 0 ? 1 : 2);
    }
  });
});
