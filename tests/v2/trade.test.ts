import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import {
  PRICES,
  activeMatch,
  createMatch,
  defaultArenaArgs,
  expectError,
  expectOk,
  fetchMatch,
  ix,
  joinMatch,
  lazer,
  newWallet,
  setAllFeeds,
  setFeed,
  setupAdmin,
  trade,
  updateArena,
  v2Ctx,
  v2Events,
} from "./fixtures";

const USD = 1_000_000n; // micro-USD
const SOL = ix("SOL");
const BONK = ix("BONK");

// v2 PRD §6.3 trade. LiteSVM runs it on base against an undelegated Match, which is exactly
// the account state the ER sees after delegation (Match owned by the program).
describe("v2 trade", () => {
  describe("happy path", () => {
    it("buy: cash -> SOL at the oracle price, fee from the match snapshot, matches the SDK quote; emits Traded", async () => {
      const ctx = v2Ctx();
      const { ref, creatorSession } = await activeMatch(ctx);
      const res = await trade(ctx, ref, creatorSession, {
        asset: SOL,
        side: "buy",
        amount: 1_000n * USD,
      });
      expectOk(res);
      console.log(`      trade CU: ${res.cu}`);
      const want = v2.buyQuote(1_000n * USD, PRICES.SOL, 8, 10);
      const m = await fetchMatch(ctx, ref.matchAccount);
      expect(m.seats[0].cash.toString()).to.equal(
        (10_000n * USD - 1_000n * USD).toString()
      );
      expect(m.seats[0].qty[SOL].toString()).to.equal(want.qtyOut.toString()); // 10.586922 SOL
      expect(want.qtyOut).to.equal(10_586_922n);
      expect(m.seats[0].trades).to.equal(1);
      expect(m.seats[1].cash.toString()).to.equal((10_000n * USD).toString()); // other seat untouched
      const ev = v2Events(res).find((e) => e.name === "traded")!;
      expect([ev.data.seat, ev.data.assetIndex, ev.data.side]).to.deep.equal([
        0,
        SOL,
        0,
      ]);
      expect(ev.data.amountOut.toString()).to.equal(want.qtyOut.toString());
      expect(ev.data.price.toString()).to.equal(PRICES.SOL.toString());
    });

    it("sell: SOL -> cash; a round trip at the same price never gains", async () => {
      const ctx = v2Ctx();
      const { ref, opponentSession } = await activeMatch(ctx);
      expectOk(
        await trade(ctx, ref, opponentSession, {
          asset: SOL,
          side: "buy",
          amount: 2_500n * USD,
        })
      );
      const q = BigInt(
        (await fetchMatch(ctx, ref.matchAccount)).seats[1].qty[SOL].toString()
      );
      expectOk(
        await trade(ctx, ref, opponentSession, {
          asset: SOL,
          side: "sell",
          amount: q,
        })
      );
      const m = await fetchMatch(ctx, ref.matchAccount);
      const want = 7_500n * USD + v2.sellQuote(q, PRICES.SOL, 8, 10).cashOut;
      expect(m.seats[1].cash.toString()).to.equal(want.toString());
      expect(BigInt(m.seats[1].cash.toString()) < 10_000n * USD).to.equal(true);
      expect(m.seats[1].qty[SOL].toString()).to.equal("0");
      expect(m.seats[1].trades).to.equal(2);
    });

    it("prices move: buy SOL at $94, sell at $104 for a ~10% gain minus fees", async () => {
      const ctx = v2Ctx();
      const { ref, creatorSession } = await activeMatch(ctx);
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: 10_000n * USD,
        })
      );
      const q = BigInt(
        (await fetchMatch(ctx, ref.matchAccount)).seats[0].qty[SOL].toString()
      );
      await setFeed(ctx, lazer("SOL"), { price: 10_436_170_000n }); // $104.3617
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "sell",
          amount: q,
        })
      );
      const cash = BigInt(
        (await fetchMatch(ctx, ref.matchAccount)).seats[0].cash.toString()
      );
      expect(
        cash > 11_000n * USD && cash < 11_060n * USD,
        `cash ${cash}`
      ).to.equal(true);
    });

    it("V3: uses the arena's exponent (BONK e=10), ignoring the feed's own exponent field (8)", async () => {
      const ctx = v2Ctx();
      const { ref, creatorSession } = await activeMatch(ctx);
      await setFeed(ctx, lazer("BONK"), {
        price: PRICES.BONK,
        exponentField: 8,
      });
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: BONK,
          side: "buy",
          amount: 1_000n * USD,
        })
      );
      const q = (await fetchMatch(ctx, ref.matchAccount)).seats[0].qty[
        BONK
      ].toString();
      expect(q).to.equal(
        v2.buyQuote(1_000n * USD, PRICES.BONK, 10, 10).qtyOut.toString()
      ); // ~342M BONK
      expect(q).to.not.equal(
        v2.buyQuote(1_000n * USD, PRICES.BONK, 8, 10).qtyOut.toString()
      );
    });

    it("parses feeds with Partial verification (message shifted by one byte)", async () => {
      const ctx = v2Ctx();
      const { ref, creatorSession } = await activeMatch(ctx);
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        verification: "partial",
      });
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: 100n * USD,
        })
      );
    });

    it("I9: the trade fee comes from the match snapshot, not the arena's current value", async () => {
      const ctx = v2Ctx();
      const { ref, admin, creatorSession } = await activeMatch(ctx);
      expectOk(
        await updateArena(
          ctx,
          admin,
          1,
          defaultArenaArgs({ tradeFeeBps: 1000, maxPriceAgeS: 0 })
        )
      );
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: 1_000n * USD,
        })
      );
      const q = (await fetchMatch(ctx, ref.matchAccount)).seats[0].qty[
        SOL
      ].toString();
      expect(q).to.equal(
        v2.buyQuote(1_000n * USD, PRICES.SOL, 8, 10).qtyOut.toString()
      );
    });
  });

  describe("I6: who may trade which seat", () => {
    it("each wallet and each session key trades only its own seat", async () => {
      const ctx = v2Ctx();
      const { ref, creator, opponent, creatorSession, opponentSession } =
        await activeMatch(ctx);
      const buy = { asset: SOL, side: "buy" as const, amount: 100n * USD };
      expectOk(await trade(ctx, ref, creator, buy));
      expectOk(await trade(ctx, ref, creatorSession, buy));
      expectOk(await trade(ctx, ref, opponent, buy));
      expectOk(await trade(ctx, ref, opponentSession, buy));
      const m = await fetchMatch(ctx, ref.matchAccount);
      expect([m.seats[0].trades, m.seats[1].trades]).to.deep.equal([2, 2]);
    });

    it("a session key with 0 SOL can sign (ER fees are zero; in LiteSVM the wallet pays the fee)", async () => {
      const ctx = v2Ctx();
      await setupAdmin(ctx);
      const creator = await newWallet(ctx);
      const broke = Keypair.generate(); // never funded
      const { ref } = await createMatch(ctx, {
        creator,
        sessionKey: broke.publicKey,
      });
      expectOk(await joinMatch(ctx, ref, await newWallet(ctx)));
      ctx.sender.warpTo(
        BigInt((await fetchMatch(ctx, ref.matchAccount)).startTs.toString())
      );
      await setAllFeeds(ctx);
      expectOk(
        await trade(
          ctx,
          ref,
          broke,
          { asset: SOL, side: "buy", amount: USD },
          creator
        )
      );
      expect(await ctx.sender.lamports(broke.publicKey)).to.equal(0n);
      expect(
        (await fetchMatch(ctx, ref.matchAccount)).seats[0].trades
      ).to.equal(1);
    });
  });

  describe("typed errors, in PRD order", () => {
    async function ready() {
      const ctx = v2Ctx();
      return { ctx, ...(await activeMatch(ctx)) };
    }

    it("NotAParticipant: a stranger, and another match's session key", async () => {
      const { ctx, ref } = await ready();
      expectError(
        await trade(ctx, ref, await newWallet(ctx), {
          asset: SOL,
          side: "buy",
          amount: USD,
        }),
        "NotAParticipant"
      );
      const otherSession = await newWallet(ctx, 1);
      const { ref: other } = await createMatch(ctx, {
        creator: await newWallet(ctx),
        sessionKey: otherSession.publicKey,
      });
      expectOk(await joinMatch(ctx, other, await newWallet(ctx)));
      expectError(
        await trade(ctx, ref, otherSession, {
          asset: SOL,
          side: "buy",
          amount: USD,
        }),
        "NotAParticipant"
      );
    });

    it("MatchNotActive on an Open (unjoined) match", async () => {
      const ctx = v2Ctx();
      await setupAdmin(ctx);
      const creator = await newWallet(ctx);
      const { ref } = await createMatch(ctx, { creator });
      expectError(
        await trade(ctx, ref, creator, {
          asset: SOL,
          side: "buy",
          amount: USD,
        }),
        "MatchNotActive"
      );
    });

    it("I5: WindowNotStarted before start_ts, WindowEnded at end_ts; start_ts and end_ts - 1 trade", async () => {
      const { ctx, ref, creatorSession, startTs, endTs } = await ready();
      const buy = { asset: SOL, side: "buy" as const, amount: USD };
      ctx.sender.warpTo(startTs - 1n);
      expectError(
        await trade(ctx, ref, creatorSession, buy),
        "WindowNotStarted"
      );
      ctx.sender.warpTo(startTs);
      await setFeed(ctx, lazer("SOL"), { price: PRICES.SOL });
      expectOk(await trade(ctx, ref, creatorSession, buy));
      ctx.sender.warpTo(endTs - 1n);
      await setFeed(ctx, lazer("SOL"), { price: PRICES.SOL });
      expectOk(
        await trade(ctx, ref, creatorSession, { ...buy, amount: USD + 1n })
      );
      ctx.sender.warpTo(endTs);
      await setFeed(ctx, lazer("SOL"), { price: PRICES.SOL });
      expectError(await trade(ctx, ref, creatorSession, buy), "WindowEnded");
    });

    it("InvalidAsset for an index at or past asset_count", async () => {
      const { ctx, ref, creatorSession } = await ready();
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: 10,
          side: "buy",
          amount: USD,
          priceFeed: v2.findPriceFeed(6)[0],
        }),
        "InvalidAsset"
      );
    });

    it("AssetDisabled blocks buys; I10: sells of a disabled asset still work", async () => {
      const { ctx, ref, admin, creatorSession } = await ready();
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: 100n * USD,
        })
      );
      const assets = defaultArenaArgs().assets.map((a, i) =>
        i === SOL ? { ...a, enabled: false } : a
      );
      expectOk(await updateArena(ctx, admin, 1, defaultArenaArgs({ assets })));
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: USD,
        }),
        "AssetDisabled"
      );
      const q = BigInt(
        (await fetchMatch(ctx, ref.matchAccount)).seats[0].qty[SOL].toString()
      );
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "sell",
          amount: q,
        })
      );
    });

    it("WrongPriceFeed for another asset's feed", async () => {
      const { ctx, ref, creatorSession } = await ready();
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: USD,
          priceFeed: v2.findPriceFeed(lazer("BONK"))[0],
        }),
        "WrongPriceFeed"
      );
    });

    for (const [label, f] of [
      ["zero price", { price: 0n }],
      ["negative price", { price: -5n }],
      ["never posted (posted_slot 0)", { price: PRICES.SOL, postedSlot: 0n }],
      [
        "not owned by the oracle program",
        { price: PRICES.SOL, owner: Keypair.generate().publicKey },
      ],
    ] as [string, Parameters<typeof setFeed>[2]][]) {
      it(`PriceInvalid: ${label}`, async () => {
        const { ctx, ref, creatorSession } = await ready();
        await setFeed(ctx, lazer("SOL"), f);
        expectError(
          await trade(ctx, ref, creatorSession, {
            asset: SOL,
            side: "buy",
            amount: USD,
          }),
          "PriceInvalid"
        );
      });
    }

    it("PriceStale beyond max_price_age_s (5 s); exactly 5 s old is accepted", async () => {
      const { ctx, ref, creatorSession } = await ready();
      const now = await ctx.sender.now();
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: now - 6n,
      });
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: USD,
        }),
        "PriceStale"
      );
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: now - 5n,
      });
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: USD,
        })
      );
      // A dead feed (AI16Z-style, months old) is stale too.
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: now - 26_000_000n,
      });
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: USD,
        }),
        "PriceStale"
      );
    });

    it("ZeroAmount for 0", async () => {
      const { ctx, ref, creatorSession } = await ready();
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: 0n,
        }),
        "ZeroAmount"
      );
    });

    it("LimitPriceExceeded: buy above the limit, sell below it", async () => {
      const { ctx, ref, creatorSession } = await ready();
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: USD,
          limitPrice: PRICES.SOL - 1n,
        }),
        "LimitPriceExceeded"
      );
      expectOk(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: 10n * USD,
          limitPrice: PRICES.SOL,
        })
      );
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "sell",
          amount: 1n,
          limitPrice: PRICES.SOL + 1n,
        }),
        "LimitPriceExceeded"
      );
    });

    it("InsufficientCash / InsufficientQty", async () => {
      const { ctx, ref, creatorSession } = await ready();
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: 10_000n * USD + 1n,
        }),
        "InsufficientCash"
      );
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "sell",
          amount: 1n,
        }),
        "InsufficientQty"
      );
    });

    it("ZeroOutput for dust", async () => {
      const { ctx, ref, creatorSession } = await ready();
      expectError(
        await trade(ctx, ref, creatorSession, {
          asset: SOL,
          side: "buy",
          amount: 1n,
        }),
        "ZeroOutput"
      );
    });

    it("the first failing check wins", async () => {
      const { ctx, ref, creatorSession, startTs } = await ready();
      const now = await ctx.sender.now();
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: now - 60n,
      }); // stale
      const bad = {
        asset: SOL,
        side: "buy" as const,
        amount: 0n,
        limitPrice: 0n,
      };
      expectError(
        await trade(ctx, ref, await newWallet(ctx), bad),
        "NotAParticipant"
      );
      ctx.sender.warpTo(startTs - 1n);
      expectError(
        await trade(ctx, ref, creatorSession, bad),
        "WindowNotStarted"
      );
      ctx.sender.warpTo(startTs);
      expectError(
        await trade(ctx, ref, creatorSession, {
          ...bad,
          priceFeed: v2.findPriceFeed(lazer("JUP"))[0],
        }),
        "WrongPriceFeed"
      );
      expectError(await trade(ctx, ref, creatorSession, bad), "PriceStale"); // beats ZeroAmount
      await setFeed(ctx, lazer("SOL"), { price: PRICES.SOL });
      expectError(await trade(ctx, ref, creatorSession, bad), "ZeroAmount"); // beats the limit
      expectError(
        await trade(ctx, ref, creatorSession, { ...bad, amount: USD }),
        "LimitPriceExceeded"
      );
    });
  });
});
