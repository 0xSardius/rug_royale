import { expect } from "chai";
import { v2 } from "@rug-royale/sdk";
import {
  MAX_DEVIATION_BPS,
  allPass,
  checkCoin,
} from "../scripts/lib/arena-check";

// v2 PRD §10.2: an arena coin is only listed when its live feed agrees with a reference price.
describe("arena feed check", () => {
  const now = 1_800_000_000n;
  const feed = (price: bigint, age = 0n, postedSlot = 1n): v2.PriceFeed => ({
    price,
    publishTime: now - age,
    postedSlot,
    exponentField: 8,
    verification: "full",
  });
  const bonk = { symbol: "BONK", exponent: 10 };

  it("ok: BONK at the list exponent (10) matches the reference", () => {
    const c = checkCoin(bonk, feed(29_220n), 0.000002922, now);
    expect([c.status, c.deviationBps]).to.deep.equal(["ok", 0]);
  });

  it("mismatch: the feed's own wrong exponent (8) would be 100x off (spike 01)", () => {
    expect(
      checkCoin(
        { symbol: "BONK", exponent: 8 },
        feed(29_220n),
        0.000002922,
        now
      ).status
    ).to.equal("mismatch");
  });

  it("2% is the limit", () => {
    const sol = { symbol: "SOL", exponent: 8 };
    expect(checkCoin(sol, feed(10_200_000_000n), 100, now).status).to.equal(
      "ok"
    );
    expect(checkCoin(sol, feed(10_201_000_000n), 100, now).status).to.equal(
      "mismatch"
    );
    expect(MAX_DEVIATION_BPS).to.equal(200);
  });

  it("stale: a dead feed (AI16Z-style, months old) fails regardless of price", () => {
    expect(
      checkCoin(bonk, feed(29_220n, 26_000_000n), 0.000002922, now).status
    ).to.equal("stale");
    expect(
      checkCoin(bonk, feed(29_220n, 60n), 0.000002922, now).status
    ).to.equal("ok");
    expect(
      checkCoin(bonk, feed(29_220n, 61n), 0.000002922, now).status
    ).to.equal("stale");
  });

  it("missing: no account, zero price, or never posted", () => {
    expect(checkCoin(bonk, null, 1, now).status).to.equal("missing");
    expect(checkCoin(bonk, feed(0n), 1, now).status).to.equal("missing");
    expect(checkCoin(bonk, feed(29_220n, 0n, 0n), 1, now).status).to.equal(
      "missing"
    );
  });

  it("no-reference fails allPass unless explicitly allowed", () => {
    const c = checkCoin(bonk, feed(29_220n), null, now);
    expect(c.status).to.equal("no-reference");
    expect(allPass([c])).to.equal(false);
    expect(allPass([c], true)).to.equal(true);
  });
});
