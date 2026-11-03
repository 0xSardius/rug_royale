import { readFileSync } from "fs";
import path from "path";
import { expect } from "chai";
import { v2 } from "@rug-royale/sdk";
import { rng } from "../scripts/lib/rng";
import {
  V2_MATH_VECTORS_PATH,
  generateV2MathVectors,
} from "../scripts/lib/math-vectors-v2";

// v2 PRD §7. The Rust side reproduces the committed vectors (programs/rug_royale_v2/src/math).
describe("v2 math", () => {
  describe("trade (§7.1)", () => {
    it("matches the hand-checked spike-01 prices", () => {
      const sol = v2.buyQuote(1_000_000_000n, 9_436_170_000n, 8, 10);
      expect([sol.fee, sol.qtyOut]).to.deep.equal([1_000_000n, 10_586_922n]);
      const bonk = v2.buyQuote(1_000_000_000n, 29_220n, 10, 0);
      expect(bonk.qtyOut).to.equal(342_231_348_391_512n);
    });

    it("buy then sell at the same price never gains (fees + rounding favor the protocol)", () => {
      const g = rng(7);
      for (let i = 0; i < 2_000; i++) {
        const e = g.pick([6, 8, 10, 12]);
        const price = g.big(1n, 10n ** 13n);
        const fee = g.pick([0, 10, 30, 1000]);
        const cash = g.big(1n, 10n ** 15n);
        let q: bigint;
        try {
          q = v2.buyQuote(cash, price, e, fee).qtyOut;
        } catch {
          continue; // MathOverflow on extreme inputs is the program's answer too
        }
        const back = v2.sellQuote(q, price, e, fee).cashOut;
        expect(back <= cash, `case ${i}`).to.equal(true);
      }
    });

    it("rejects a non-positive price", () => {
      expect(() => v2.buyQuote(1n, 0n, 8, 0)).to.throw("PriceInvalid");
      expect(() => v2.sellQuote(1n, -1n, 8, 0)).to.throw("PriceInvalid");
    });
  });

  describe("valuation (§7.2)", () => {
    it("skips unheld assets, whatever their mark", () => {
      expect(
        v2.portfolioValue(5n, [0n, 0n], [0n, 10n ** 13n], [8, 8])
      ).to.equal(5n);
    });
    it("result: 1 creator, 2 opponent, 3 tie", () => {
      expect([
        v2.matchResult(2n, 1n),
        v2.matchResult(1n, 2n),
        v2.matchResult(3n, 3n),
      ]).to.deep.equal([1, 2, 3]);
    });
  });

  describe("payout (§7.3, D1, Q1)", () => {
    it("I2: parts always sum to the pot", () => {
      const g = rng(11);
      for (let i = 0; i < 5_000; i++) {
        const entry = g.pick([0n, g.big(10_000_001n, 10n ** 11n)]);
        const matchFee = g.big(0n, 10_000_000n);
        const p = v2.payout({
          entry,
          sponsored: g.pick([0n, g.big(1n, 10n ** 11n)]),
          matchFee,
          feeShare: v2.feeShare(entry, matchFee),
          settlerTip: g.big(0n, 10_000_000n),
          rakeBps: g.int(0, 1000),
          result: g.pick([1, 2, 3] as const),
        });
        expect(
          p.toCreator + p.toOpponent + p.toTreasury + p.toSettler,
          `case ${i}`
        ).to.equal(p.pot);
        expect(p.toOpponent >= p.fee, `case ${i}: joiner reimbursed`).to.equal(
          true
        );
      }
    });

    it("Q1: free duels split the fee; paid duels take it off the pot", () => {
      expect(v2.feeShare(0n, 3_010_001n)).to.equal(1_505_001n);
      expect(v2.feeShare(10_000_001n, 3_010_001n)).to.equal(0n);
    });

    it("paid tie: no rake, tip only from sponsored, odd lamport to creator", () => {
      const p = v2.payout({
        entry: 50_000_000n,
        sponsored: 0n,
        matchFee: 3_010_001n,
        feeShare: 0n,
        settlerTip: 1_000_000n,
        rakeBps: 500,
        result: 3,
      });
      expect([p.rake, p.tip]).to.deep.equal([0n, 0n]);
      expect(p.toCreator - (p.toOpponent - p.fee)).to.equal(1n);
    });

    it("rejects a pending result", () => {
      expect(() =>
        v2.payout({
          entry: 1n,
          sponsored: 0n,
          matchFee: 0n,
          feeShare: 0n,
          settlerTip: 0n,
          rakeBps: 0,
          result: 0,
        })
      ).to.throw("MatchNotFinalized");
    });
  });

  describe("vectors", () => {
    it("committed vectors match v2/math.ts (run `pnpm math:vectors` after changing the math)", () => {
      const committed = JSON.parse(
        readFileSync(path.join(__dirname, "..", V2_MATH_VECTORS_PATH), "utf8")
      );
      expect(committed).to.deep.equal(
        JSON.parse(JSON.stringify(generateV2MathVectors()))
      );
    });
  });
});
