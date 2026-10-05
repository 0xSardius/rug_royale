import { readFileSync } from "fs";
import path from "path";
import { expect } from "chai";
import {
  buyOut,
  duelResult,
  finalValue,
  minOutWithSlippage,
  payout,
  sellOut,
  swapQuote,
} from "@rug-royale/sdk";
import { rng } from "../scripts/lib/rng";
import {
  MATH_VECTORS_PATH,
  generateMathVectors,
} from "../scripts/lib/math-vectors";

const U = 1_000_000n; // 6 decimals

describe("math (PRD §7)", () => {
  it("reproduces Yamin's opening-race example (fees off, seed 100/100, both buy 10)", () => {
    const fee = 0;
    let r = { quoteReserve: 100n * U, tokenReserve: 100n * U };
    const a = buyOut(10n * U, r, fee);
    r = a;
    const b = buyOut(10n * U, r, fee);
    r = b;
    // A gets ~9.091 coin, B ~7.576.
    expect(a.out).to.equal(9_090_909n);
    expect(b.out).to.equal(7_575_757n);
    const finalA = finalValue(90n * U, a.out, r, fee);
    const finalB = finalValue(90n * U, b.out, r, fee);
    // ~101.80 vs ~100.00 (rounded down at each step).
    expect(Number(finalA) / 1e6).to.be.closeTo(101.8, 0.01);
    expect(Number(finalB) / 1e6).to.be.closeTo(100.0, 0.01);
    expect(duelResult(finalA, finalB)).to.equal(1);
  });

  it("valuation is order-independent and does not mutate reserves (I6)", () => {
    const r = { quoteReserve: 120n * U, tokenReserve: 83n * U };
    const a1 = finalValue(5n * U, 9n * U, r, 30);
    const b1 = finalValue(7n * U, 3n * U, r, 30);
    const b2 = finalValue(7n * U, 3n * U, r, 30);
    const a2 = finalValue(5n * U, 9n * U, r, 30);
    expect([a1, b1]).to.deep.equal([a2, b2]);
    expect(r).to.deep.equal({ quoteReserve: 120n * U, tokenReserve: 83n * U });
  });

  it("k never decreases over random swap sequences, with or without fees (I4)", () => {
    const g = rng(4);
    for (const fee of [0, 30, 100]) {
      let r = { quoteReserve: 10_000n * U, tokenReserve: 10_000n * U };
      for (let i = 0; i < 200; i++) {
        const side = g.pick(["buy", "sell"] as const);
        const q = swapQuote(side, g.big(1n, 500n * U), r, fee);
        if (q.out === 0n) continue;
        expect(
          q.quoteReserve * q.tokenReserve >= r.quoteReserve * r.tokenReserve
        ).to.equal(true);
        r = q;
      }
    }
  });

  it("a buy then a full sell back never returns more than was spent", () => {
    const r0 = { quoteReserve: 10_000n * U, tokenReserve: 10_000n * U };
    const b = buyOut(1_000n * U, r0, 30);
    const s = sellOut(b.out, b, 30);
    expect(s.out < 1_000n * U).to.equal(true);
  });

  it("minOutWithSlippage rounds down", () => {
    expect(minOutWithSlippage(1_000_001n, 100)).to.equal(990_000n);
  });

  describe("payout", () => {
    const base = { settlerTipLamports: 1_000_000n, rakeBps: 250 };

    it("winner: rake, tip, prize sum to pot (scenario 1)", () => {
      const p = payout({
        ...base,
        entryLamports: 100_000_000n,
        sponsoredLamports: 0n,
        result: 2,
      });
      expect(p.pot).to.equal(200_000_000n);
      expect(p.rake).to.equal(5_000_000n);
      expect(p.tip).to.equal(1_000_000n);
      expect(p.toOpponent).to.equal(194_000_000n);
      expect(p.toCreator).to.equal(0n);
    });

    it("freeroll: no rake when entry is 0 (scenario 4)", () => {
      const p = payout({
        ...base,
        entryLamports: 0n,
        sponsoredLamports: 500_000_000n,
        result: 1,
      });
      expect(p.rake).to.equal(0n);
      expect(p.toCreator).to.equal(499_000_000n);
    });

    it("unranked: everything is zero (scenario 5)", () => {
      const p = payout({
        ...base,
        entryLamports: 0n,
        sponsoredLamports: 0n,
        result: 1,
      });
      expect([p.pot, p.rake, p.tip, p.prize]).to.deep.equal([0n, 0n, 0n, 0n]);
    });

    it("tie: entries back, tip from sponsored only, odd lamport to creator (scenario 3, G8)", () => {
      const p = payout({
        ...base,
        entryLamports: 100_000_000n,
        sponsoredLamports: 3_000_001n,
        result: 3,
      });
      expect(p.rake).to.equal(0n);
      expect(p.tip).to.equal(1_000_000n);
      expect(p.toCreator).to.equal(100_000_000n + 1_000_001n);
      expect(p.toOpponent).to.equal(100_000_000n + 1_000_000n);
    });

    it("tie with no sponsor pays no tip (P5)", () => {
      const p = payout({
        ...base,
        entryLamports: 100_000_000n,
        sponsoredLamports: 0n,
        result: 3,
      });
      expect(p.tip).to.equal(0n);
      expect(p.toCreator).to.equal(100_000_000n);
    });

    it("payouts always sum to the pot (I2), 2,000 random cases", () => {
      const g = rng(2);
      for (let i = 0; i < 2_000; i++) {
        const p = payout({
          entryLamports: g.pick([0n, g.big(1n, 1_000_000_000n)]),
          sponsoredLamports: g.pick([0n, g.big(1n, 2_000_000_000n)]),
          settlerTipLamports: g.big(0n, 5_000_000n),
          rakeBps: g.int(0, 1000),
          result: g.pick([1, 2, 3] as const),
        });
        expect(
          p.toCreator + p.toOpponent + p.toTreasury + p.toSettler
        ).to.equal(p.pot);
      }
    });
  });
});

describe("math vectors", () => {
  it("committed vectors match math.ts (run `pnpm math:vectors` after changing the math)", () => {
    const committed = JSON.parse(
      readFileSync(path.join(__dirname, "..", MATH_VECTORS_PATH), "utf8")
    );
    expect(committed).to.deep.equal(
      JSON.parse(JSON.stringify(generateMathVectors()))
    );
  });
});
