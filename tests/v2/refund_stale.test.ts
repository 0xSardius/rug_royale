import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import {
  PRICES,
  STALE_AFTER_SECS,
  activeMatch,
  createMatch,
  defaultProtocolArgs,
  emptyWallet,
  expectError,
  expectOk,
  fetchMatch,
  fetchPot,
  finalizeMatch,
  joinMatch,
  lazer,
  newWallet,
  refundStale,
  setFeed,
  setOwner,
  setupAdmin,
  settle,
  sponsorMatch,
  updateProtocol,
  v2Ctx,
  v2Events,
} from "./fixtures";

const POT_SPACE = 8 + 258;

// v2 PRD §6.2 refund_stale.
describe("v2 refund_stale", () => {
  /** A joined match whose finalize never happened; clock at end_ts + STALE_AFTER_SECS. */
  async function stale(entry = 100_000_000n, sponsored = 0n) {
    const ctx = v2Ctx();
    const admin = await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const { ref } = await createMatch(ctx, { creator, entryLamports: entry });
    let sponsor: Keypair | null = null;
    if (sponsored > 0n) {
      sponsor = await newWallet(ctx);
      expectOk(await sponsorMatch(ctx, ref, sponsor, sponsored));
    }
    expectOk(await joinMatch(ctx, ref, opponent));
    const endTs = BigInt(
      (await fetchMatch(ctx, ref.matchAccount)).endTs.toString()
    );
    ctx.sender.warpTo(endTs + STALE_AFTER_SECS);
    return { ctx, ref, creator, opponent, sponsor, endTs, ...admin };
  }

  it("refunds each player's entry and the sponsor in full; pot at rent; Refunded; MatchRefunded", async () => {
    const { ctx, ref, creator, opponent, sponsor } = await stale(
      100_000_000n,
      20_000_000n
    );
    const caller = await newWallet(ctx);
    const b0 = [
      await ctx.sender.lamports(creator.publicKey),
      await ctx.sender.lamports(opponent.publicKey),
      await ctx.sender.lamports(sponsor!.publicKey),
    ];
    const res = await refundStale(ctx, ref, caller);
    expectOk(res);
    console.log(`      refund_stale CU: ${res.cu}`);
    const b1 = [
      await ctx.sender.lamports(creator.publicKey),
      await ctx.sender.lamports(opponent.publicKey),
      await ctx.sender.lamports(sponsor!.publicKey),
    ];
    expect(b1.map((b, i) => b - b0[i])).to.deep.equal([
      100_000_000n,
      100_000_000n,
      20_000_000n,
    ]);
    expect(await ctx.sender.lamports(ref.pot)).to.equal(
      await ctx.sender.rentExempt(POT_SPACE)
    );
    expect((await fetchPot(ctx, ref.pot)).status).to.deep.equal({
      refunded: {},
    });
    const ev = v2Events(res).find((e) => e.name === "matchRefunded")!;
    expect([
      ev.data.refundedEach.toString(),
      ev.data.refundedSponsored.toString(),
    ]).to.deep.equal(["100000000", "20000000"]);
  });

  it("Q1: a free duel refunds each player's fee share", async () => {
    const { ctx, ref, creator, opponent } = await stale(0n);
    const b0 = [
      await ctx.sender.lamports(creator.publicKey),
      await ctx.sender.lamports(opponent.publicKey),
    ];
    expectOk(await refundStale(ctx, ref, await newWallet(ctx)));
    expect([
      (await ctx.sender.lamports(creator.publicKey)) - b0[0],
      (await ctx.sender.lamports(opponent.publicKey)) - b0[1],
    ]).to.deep.equal([1_505_000n, 1_505_000n]);
  });

  it("works while Match is still stuck in the ER (never reads Match)", async () => {
    const { ctx, ref } = await stale();
    setOwner(ctx, ref.matchAccount, v2.DELEGATION_PROGRAM_ID);
    expectOk(await refundStale(ctx, ref, await newWallet(ctx)));
  });

  it("M1: a sub-rent refund to an emptied wallet goes to the treasury", async () => {
    const ctx = v2Ctx();
    const { admin, treasury } = await setupAdmin(ctx);
    expectOk(
      await updateProtocol(
        ctx,
        admin,
        treasury,
        admin.publicKey,
        defaultProtocolArgs({ matchFeeLamports: new BN(400_000) })
      )
    );
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const { ref } = await createMatch(ctx, { creator, entryLamports: 0n });
    expectOk(await joinMatch(ctx, ref, opponent));
    ctx.sender.warpTo(
      BigInt((await fetchMatch(ctx, ref.matchAccount)).endTs.toString()) +
        STALE_AFTER_SECS
    );
    emptyWallet(ctx, opponent.publicKey);
    const t0 = await ctx.sender.lamports(treasury);
    expectOk(await refundStale(ctx, ref, creator));
    expect(await ctx.sender.lamports(opponent.publicKey)).to.equal(0n);
    expect((await ctx.sender.lamports(treasury)) - t0).to.equal(200_000n);
  });

  describe("I3: exactly one of settle and refund_stale can pay", () => {
    it("after refund_stale, a late finalize + settle is rejected", async () => {
      const ctx = v2Ctx();
      const a = await activeMatch(ctx, { entryLamports: 100_000_000n });
      ctx.sender.warpTo(a.endTs + STALE_AFTER_SECS);
      expectOk(await refundStale(ctx, a.ref, a.creator));
      // The ER comes back and someone finalizes with a (hypothetical) in-window mark.
      ctx.sender.warpTo(a.endTs);
      await setFeed(ctx, lazer("SOL"), {
        price: PRICES.SOL,
        publishTime: a.endTs,
      });
      expectOk(await finalizeMatch(ctx, a.ref, a.creator));
      expectError(await settle(ctx, a.ref, a.creator), "PotNotActive");
    });

    it("after settle, refund_stale is rejected", async () => {
      const ctx = v2Ctx();
      const a = await activeMatch(ctx, { entryLamports: 100_000_000n });
      ctx.sender.warpTo(a.endTs);
      expectOk(await finalizeMatch(ctx, a.ref, a.creator));
      expectOk(await settle(ctx, a.ref, a.creator));
      ctx.sender.warpTo(a.endTs + STALE_AFTER_SECS);
      expectError(await refundStale(ctx, a.ref, a.creator), "PotNotActive");
    });
  });

  describe("typed errors, in PRD order", () => {
    it("PotNotActive for a refunded pot (second refund)", async () => {
      const { ctx, ref, creator } = await stale();
      expectOk(await refundStale(ctx, ref, creator));
      expectError(await refundStale(ctx, ref, creator), "PotNotActive");
    });
    it("NotStaleYet at end_ts + STALE_AFTER_SECS - 1", async () => {
      const { ctx, ref, creator, endTs } = await stale();
      ctx.sender.warpTo(endTs + STALE_AFTER_SECS - 1n);
      expectError(await refundStale(ctx, ref, creator), "NotStaleYet");
    });
    it("a sponsored pot needs the sponsor account (AccountNotEnoughKeys)", async () => {
      const { ctx, ref, creator } = await stale(100_000_000n, 10_000_000n);
      expectError(
        await refundStale(ctx, ref, creator, { sponsor: null }),
        "AccountNotEnoughKeys"
      );
    });
    it("the first failing check wins: PotNotActive beats NotStaleYet", async () => {
      const { ctx, ref, creator, endTs } = await stale();
      expectOk(await refundStale(ctx, ref, creator));
      ctx.sender.warpTo(endTs);
      expectError(await refundStale(ctx, ref, creator), "PotNotActive");
    });
  });

  describe("I8: refund accounts cannot be redirected", () => {
    for (const which of [
      "creator",
      "opponent",
      "sponsor",
      "treasury",
    ] as const) {
      it(`wrong ${which} fails (ConstraintAddress)`, async () => {
        const { ctx, ref, creator } = await stale(100_000_000n, 10_000_000n);
        expectError(
          await refundStale(ctx, ref, creator, {
            [which]: Keypair.generate().publicKey,
          }),
          "ConstraintAddress"
        );
      });
    }
  });
});
