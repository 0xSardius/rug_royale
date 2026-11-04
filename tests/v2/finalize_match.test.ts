import { expect } from "chai";
import { v2 } from "@rug-royale/sdk";
import {
  PRICES,
  SOLANA_ARENA,
  activeMatch,
  createMatch,
  expectError,
  expectOk,
  fetchMatch,
  finalizeMatch,
  ix,
  lazer,
  newWallet,
  setFeed,
  setupAdmin,
  trade,
  v2Ctx,
  v2Events,
} from "./fixtures";

const USD = 1_000_000n;
const SOL = ix("SOL");
const BONK = ix("BONK");
const ALL_FEEDS = SOLANA_ARENA.map(([, id]) => v2.findPriceFeed(id)[0]);

// v2 PRD §6.3 finalize_match. In LiteSVM the Magic program is a no-op stand-in, so the
// commit + undelegate CPI succeeds and Match stays owned by the program; the real commit
// is verified on devnet (`pnpm v2:smoke-duel`).
describe("v2 finalize_match", () => {
  /** Creator buys SOL, opponent buys BONK; clock moved to end_ts with fresh end-of-window marks. */
  async function played(solMark = PRICES.SOL, bonkMark = PRICES.BONK) {
    const ctx = v2Ctx();
    const a = await activeMatch(ctx);
    expectOk(
      await trade(ctx, a.ref, a.creatorSession, {
        asset: SOL,
        side: "buy",
        amount: 4_000n * USD,
      })
    );
    expectOk(
      await trade(ctx, a.ref, a.opponentSession, {
        asset: BONK,
        side: "buy",
        amount: 4_000n * USD,
      })
    );
    ctx.sender.warpTo(a.endTs);
    await setFeed(ctx, lazer("SOL"), { price: solMark, publishTime: a.endTs });
    await setFeed(ctx, lazer("BONK"), {
      price: bonkMark,
      publishTime: a.endTs + 1n,
    });
    const caller = await newWallet(ctx);
    return { ctx, caller, ...a };
  }

  function expected(m: any, marks: bigint[]) {
    const exps = SOLANA_ARENA.map(([, , e]) => e);
    const val = (s: any) =>
      v2.portfolioValue(
        BigInt(s.cash.toString()),
        s.qty.map((q: any) => BigInt(q.toString())),
        marks,
        exps
      );
    return [val(m.seats[0]), val(m.seats[1])];
  }

  describe("happy path", () => {
    it("marks held assets at end_ts prices, writes values + result, Finalized; emits MatchFinalized", async () => {
      // SOL +10% at the end, BONK -10%: the creator (SOL) wins.
      const sol = (PRICES.SOL * 11n) / 10n;
      const bonk = (PRICES.BONK * 9n) / 10n;
      const { ctx, ref, caller, endTs } = await played(sol, bonk);
      const before = await fetchMatch(ctx, ref.matchAccount);
      const res = await finalizeMatch(ctx, ref, caller);
      expectOk(res);
      console.log(`      finalize_match CU: ${res.cu}`);

      const m = await fetchMatch(ctx, ref.matchAccount);
      const marks = SOLANA_ARENA.map((_, i) =>
        i === SOL ? sol : i === BONK ? bonk : 0n
      );
      const [v0, v1] = expected(before, marks);
      expect(m.status).to.deep.equal({ finalized: {} });
      expect(m.finalValues.map((v: any) => v.toString())).to.deep.equal([
        v0.toString(),
        v1.toString(),
      ]);
      expect(v0 > v1).to.equal(true);
      expect(m.result).to.equal(1);
      expect(m.markPrices.map((p: any) => p.toString())).to.deep.equal(
        marks.map(String)
      ); // unheld = 0
      expect(m.markPublishTime.toString()).to.equal(endTs.toString()); // oldest mark used
      const ev = v2Events(res).find((e) => e.name === "matchFinalized")!;
      expect(ev.data.result).to.equal(1);
      expect(ev.data.finalValues.map((v: any) => v.toString())).to.deep.equal([
        v0.toString(),
        v1.toString(),
      ]);
    });

    it("the opponent wins when their asset outperforms", async () => {
      const { ctx, ref, caller } = await played(PRICES.SOL, PRICES.BONK * 2n);
      expectOk(await finalizeMatch(ctx, ref, caller));
      expect((await fetchMatch(ctx, ref.matchAccount)).result).to.equal(2);
    });

    it("all cash on both sides: a tie at the bankroll; no marks needed, even with dead feeds", async () => {
      const ctx = v2Ctx();
      const { ref, endTs } = await activeMatch(ctx);
      ctx.sender.warpTo(endTs + 3n);
      for (const [, id] of SOLANA_ARENA)
        await setFeed(ctx, id, { price: 0n, postedSlot: 0n }); // all invalid
      expectOk(await finalizeMatch(ctx, ref, await newWallet(ctx)));
      const m = await fetchMatch(ctx, ref.matchAccount);
      expect([
        m.result,
        m.finalValues[0].toString(),
        m.finalValues[1].toString(),
      ]).to.deep.equal([3, "10000000000", "10000000000"]);
      expect(m.markPublishTime.toString()).to.equal(endTs.toString());
    });

    it("only held assets need a valid mark: a stale feed for an unheld asset is ignored", async () => {
      const { ctx, ref, caller, endTs } = await played();
      await setFeed(ctx, lazer("JUP"), {
        price: PRICES.JUP,
        publishTime: endTs - 10_000n,
      });
      expectOk(await finalizeMatch(ctx, ref, caller));
    });

    it("anyone can finalize (permissionless crank); trading is closed afterwards", async () => {
      const { ctx, ref, caller, creatorSession } = await played();
      expectOk(await finalizeMatch(ctx, ref, caller));
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: USD,
        }),
        "MatchNotActive"
      );
    });
  });

  describe("I7: marks must come from [end_ts, end_ts + 5 s]", () => {
    it("MarkWindowMissed for a price published before end_ts (a pre-close quote)", async () => {
      const { ctx, ref, caller, endTs } = await played();
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: endTs - 1n,
      });
      expectError(await finalizeMatch(ctx, ref, caller), "MarkWindowMissed");
    });

    it("end_ts + 5 is the last valid mark; end_ts + 6 is too late (refund_stale takes over)", async () => {
      const { ctx, ref, caller, endTs } = await played();
      ctx.sender.warpTo(endTs + 6n);
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: endTs + 6n,
      });
      await setFeed(ctx, lazer("BONK"), {
        price: PRICES.BONK,
        publishTime: endTs + 5n,
      });
      expectError(await finalizeMatch(ctx, ref, caller), "MarkWindowMissed");
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: endTs + 5n,
      });
      expectOk(await finalizeMatch(ctx, ref, caller));
    });
  });

  describe("typed errors, in PRD order", () => {
    it("MatchNotActive for an Open match and for a second finalize", async () => {
      const ctx = v2Ctx();
      await setupAdmin(ctx);
      const creator = await newWallet(ctx);
      const { ref: open } = await createMatch(ctx, { creator });
      expectError(await finalizeMatch(ctx, open, creator), "MatchNotActive");

      const p = await played();
      expectOk(await finalizeMatch(p.ctx, p.ref, p.caller));
      expectError(
        await finalizeMatch(p.ctx, p.ref, p.caller),
        "MatchNotActive"
      );
    });

    it("WindowNotEnded at end_ts - 1", async () => {
      const { ctx, ref, caller, endTs } = await played();
      ctx.sender.warpTo(endTs - 1n);
      expectError(await finalizeMatch(ctx, ref, caller), "WindowNotEnded");
    });

    for (const [label, feeds] of [
      ["a feed missing", ALL_FEEDS.slice(0, 9)],
      ["an extra feed", [...ALL_FEEDS, v2.findPriceFeed(1)[0]]],
      [
        "feeds out of order",
        [ALL_FEEDS[1], ALL_FEEDS[0], ...ALL_FEEDS.slice(2)],
      ],
      [
        "a foreign feed (BTC) in SOL's slot",
        [v2.findPriceFeed(1)[0], ...ALL_FEEDS.slice(1)],
      ],
    ] as [string, typeof ALL_FEEDS][]) {
      it(`WrongPriceFeed: ${label}`, async () => {
        const { ctx, ref, caller } = await played();
        expectError(
          await finalizeMatch(ctx, ref, caller, feeds),
          "WrongPriceFeed"
        );
      });
    }

    it("PriceInvalid for a held asset's broken feed", async () => {
      const { ctx, ref, caller, endTs } = await played();
      await setFeed(ctx, lazer("BONK"), { price: 0n, publishTime: endTs });
      expectError(await finalizeMatch(ctx, ref, caller), "PriceInvalid");
    });

    it("the first failing check wins", async () => {
      const { ctx, ref, caller, endTs } = await played();
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: endTs - 100n,
      });
      ctx.sender.warpTo(endTs - 1n);
      expectError(
        await finalizeMatch(ctx, ref, caller, ALL_FEEDS.slice(0, 3)),
        "WindowNotEnded"
      );
      ctx.sender.warpTo(endTs);
      expectError(
        await finalizeMatch(ctx, ref, caller, ALL_FEEDS.slice(0, 3)),
        "WrongPriceFeed"
      );
      expectError(await finalizeMatch(ctx, ref, caller), "MarkWindowMissed");
    });
  });
});
