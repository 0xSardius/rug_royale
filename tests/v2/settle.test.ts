import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import {
  PRICES,
  activeMatch,
  createMatch,
  defaultProtocolArgs,
  emptyWallet,
  expectError,
  expectOk,
  fetchMatch,
  fetchPot,
  fetchStats,
  finalizeMatch,
  ix,
  joinMatch,
  lazer,
  newWallet,
  setAllFeeds,
  setFeed,
  setOwner,
  setupAdmin,
  settle,
  sponsorMatch,
  trade,
  updateProtocol,
  v2Ctx,
  v2Events,
} from "./fixtures";

const USD = 1_000_000n;
const POT_SPACE = 8 + 258;
const TX_FEE = 5_000n;
const SOLI = ix("SOL");

// v2 PRD §6.2 settle + §7.3 payout. finalize_match runs locally with the Magic program
// stand-in, after which Match is owned by the program, as on base after the real commit.
describe("v2 settle", () => {
  /**
   * A finalized match. `winner`: creator buys SOL and SOL ends +10% (creator) or -10%
   * (opponent); "tie": nobody trades.
   */
  async function finalized(
    winner: "creator" | "opponent" | "tie",
    entry = 100_000_000n
  ) {
    const ctx = v2Ctx();
    const a = await activeMatch(ctx, { entryLamports: entry });
    if (winner !== "tie")
      expectOk(
        await trade(ctx, a.ref, a.creatorSession, {
          asset: SOLI,
          side: "buy",
          amount: 5_000n * USD,
        })
      );
    ctx.sender.warpTo(a.endTs);
    const mark =
      winner === "creator"
        ? (PRICES.SOL * 11n) / 10n
        : winner === "opponent"
        ? (PRICES.SOL * 9n) / 10n
        : PRICES.SOL;
    await setFeed(ctx, lazer("SOL"), { price: mark, publishTime: a.endTs });
    expectOk(await finalizeMatch(ctx, a.ref, await newWallet(ctx)));
    return { ctx, ...a };
  }

  /** A sponsored match (sponsor before join), played to a tie or a creator win, finalized. */
  async function finalizedSponsored(
    entry: bigint,
    sponsored: bigint,
    creatorWins: boolean
  ) {
    const ctx = v2Ctx();
    const admin = await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const { ref } = await createMatch(ctx, { creator, entryLamports: entry });
    expectOk(await sponsorMatch(ctx, ref, await newWallet(ctx), sponsored));
    expectOk(await joinMatch(ctx, ref, opponent));
    const m = await fetchMatch(ctx, ref.matchAccount);
    ctx.sender.warpTo(BigInt(m.startTs.toString()));
    await setAllFeeds(ctx);
    if (creatorWins)
      expectOk(
        await trade(ctx, ref, creator, {
          asset: SOLI,
          side: "buy",
          amount: 5_000n * USD,
        })
      );
    const end = BigInt(m.endTs.toString());
    ctx.sender.warpTo(end);
    await setFeed(ctx, lazer("SOL"), {
      price: (PRICES.SOL * 11n) / 10n,
      publishTime: end,
    });
    expectOk(await finalizeMatch(ctx, ref, await newWallet(ctx)));
    return { ctx, ref, creator, opponent, ...admin };
  }

  async function balances(ctx: any, keys: Record<string, any>) {
    const out: Record<string, bigint> = {};
    for (const [k, pk] of Object.entries(keys))
      out[k] = await ctx.sender.lamports(pk);
    return out;
  }

  describe("happy path (§7.3)", () => {
    it("paid duel, creator wins: prize, rake, match fee and tip exact; pot left at rent (I2); stats; MatchSettled", async () => {
      const { ctx, ref, creator, opponent, treasury } = await finalized(
        "creator"
      );
      const settler = await newWallet(ctx);
      const pot = await fetchPot(ctx, ref.pot);
      const want = v2.payout({
        entry: 100_000_000n,
        sponsored: 0n,
        matchFee: BigInt(pot.matchFeeLamports.toString()),
        feeShare: 0n,
        settlerTip: BigInt(pot.settlerTipLamports.toString()),
        rakeBps: pot.rakeBps,
        result: 1,
      });
      const keys = {
        creator: creator.publicKey,
        opponent: opponent.publicKey,
        treasury,
        settler: settler.publicKey,
      };
      const b0 = await balances(ctx, keys);
      const res = await settle(ctx, ref, settler);
      expectOk(res);
      console.log(`      settle CU: ${res.cu}`);
      const b1 = await balances(ctx, keys);
      expect(b1.creator - b0.creator).to.equal(want.prize);
      expect(b1.opponent - b0.opponent).to.equal(want.fee); // match-fee reimbursement only
      expect(b1.treasury - b0.treasury).to.equal(want.rake);
      expect(b1.settler - b0.settler).to.equal(want.tip - TX_FEE);
      expect(want.prize + want.rake + want.tip + want.fee).to.equal(
        200_000_000n
      );
      expect(await ctx.sender.lamports(ref.pot)).to.equal(
        await ctx.sender.rentExempt(POT_SPACE)
      );
      expect((await fetchPot(ctx, ref.pot)).status).to.deep.equal({
        settled: {},
      });
      expect((await fetchStats(ctx, creator.publicKey)).wins).to.equal(1);
      expect((await fetchStats(ctx, opponent.publicKey)).wins).to.equal(0);
      const ev = v2Events(res).find((e) => e.name === "matchSettled")!;
      expect([
        ev.data.result,
        ev.data.prize.toString(),
        ev.data.rake.toString(),
        ev.data.matchFee.toString(),
        ev.data.tip.toString(),
      ]).to.deep.equal([
        1,
        want.prize.toString(),
        want.rake.toString(),
        want.fee.toString(),
        want.tip.toString(),
      ]);
    });

    it("opponent wins: opponent receives the prize plus the match-fee reimbursement", async () => {
      const { ctx, ref, opponent } = await finalized("opponent");
      const b0 = await ctx.sender.lamports(opponent.publicKey);
      expectOk(await settle(ctx, ref, await newWallet(ctx)));
      const pot = await fetchPot(ctx, ref.pot);
      const want = v2.payout({
        entry: 100_000_000n,
        sponsored: 0n,
        matchFee: BigInt(pot.matchFeeLamports.toString()),
        feeShare: 0n,
        settlerTip: 1_000_000n,
        rakeBps: 500,
        result: 2,
      });
      expect((await ctx.sender.lamports(opponent.publicKey)) - b0).to.equal(
        want.fee + want.prize
      );
      expect((await fetchStats(ctx, opponent.publicKey)).wins).to.equal(1);
    });

    it("paid tie: no rake, entries back minus half the fee each, odd lamport to creator; ties counted", async () => {
      const { ctx, ref, creator, opponent, treasury } = await finalized("tie");
      const keys = {
        creator: creator.publicKey,
        opponent: opponent.publicKey,
        treasury,
      };
      const b0 = await balances(ctx, keys);
      expectOk(await settle(ctx, ref, await newWallet(ctx)));
      const b1 = await balances(ctx, keys);
      const want = v2.payout({
        entry: 100_000_000n,
        sponsored: 0n,
        matchFee: 3_010_000n,
        feeShare: 0n,
        settlerTip: 1_000_000n,
        rakeBps: 500,
        result: 3,
      });
      expect([
        b1.creator - b0.creator,
        b1.opponent - b0.opponent,
        b1.treasury - b0.treasury,
      ]).to.deep.equal([want.toCreator, want.toOpponent, 0n]);
      expect((await fetchStats(ctx, creator.publicKey)).ties).to.equal(1);
      expect((await fetchStats(ctx, opponent.publicKey)).ties).to.equal(1);
    });

    it("Q1 free duel: both fee shares reimburse the joiner; no rake", async () => {
      const { ctx, ref, opponent, treasury } = await finalized("creator", 0n);
      const b0 = await balances(ctx, {
        opponent: opponent.publicKey,
        treasury,
      });
      expectOk(await settle(ctx, ref, await newWallet(ctx)));
      const b1 = await balances(ctx, {
        opponent: opponent.publicKey,
        treasury,
      });
      expect(b1.opponent - b0.opponent).to.equal(3_010_000n);
      expect(b1.treasury - b0.treasury).to.equal(0n);
      expect(await ctx.sender.lamports(ref.pot)).to.equal(
        await ctx.sender.rentExempt(POT_SPACE)
      );
    });

    it("sponsored freeroll: the winner gets the sponsored prize minus the tip (fee came from deposits)", async () => {
      const { ctx, ref, creator } = await finalizedSponsored(
        0n,
        50_000_000n,
        true
      );
      const b0 = await ctx.sender.lamports(creator.publicKey);
      expectOk(await settle(ctx, ref, await newWallet(ctx)));
      const want = v2.payout({
        entry: 0n,
        sponsored: 50_000_000n,
        matchFee: 3_010_000n,
        feeShare: 1_505_000n,
        settlerTip: 1_000_000n,
        rakeBps: 500,
        result: 1,
      });
      expect((await ctx.sender.lamports(creator.publicKey)) - b0).to.equal(
        want.prize
      );
      expect(want.prize).to.equal(49_000_000n);
    });

    it("sponsored paid tie: the tip comes only from the sponsored amount", async () => {
      const { ctx, ref } = await finalizedSponsored(
        100_000_000n,
        20_000_000n,
        false
      );
      const settler = await newWallet(ctx);
      const b0 = await ctx.sender.lamports(settler.publicKey);
      expectOk(await settle(ctx, ref, settler));
      expect((await ctx.sender.lamports(settler.publicKey)) - b0).to.equal(
        1_000_000n - TX_FEE
      );
    });

    it("the winner can settle their own duel (Settle button): prize and tip both land", async () => {
      const { ctx, ref, creator } = await finalized("creator");
      const b0 = await ctx.sender.lamports(creator.publicKey);
      expectOk(await settle(ctx, ref, creator));
      const want = v2.payout({
        entry: 100_000_000n,
        sponsored: 0n,
        matchFee: 3_010_000n,
        feeShare: 0n,
        settlerTip: 1_000_000n,
        rakeBps: 500,
        result: 1,
      });
      expect((await ctx.sender.lamports(creator.publicKey)) - b0).to.equal(
        want.prize + want.tip - TX_FEE
      );
    });
  });

  describe("I11 / M1: an emptied wallet never blocks settle", () => {
    it("a sub-rent credit to an emptied wallet goes to the treasury; settle still succeeds", async () => {
      // Free duel, creator wins: the opponent's 3,010,000 fee is rent-exempt, so empty the
      // opponent and shrink the fee below rent via a tiny-fee protocol.
      const ctx = v2Ctx();
      const admin = await setupAdmin(ctx);
      expectOk(
        await updateProtocol(
          ctx,
          admin.admin,
          admin.treasury,
          admin.admin.publicKey,
          defaultProtocolArgs({ matchFeeLamports: new BN(400_000) })
        )
      );
      const creator = await newWallet(ctx);
      const opponent = await newWallet(ctx);
      const { ref } = await createMatch(ctx, { creator, entryLamports: 0n });
      expectOk(await joinMatch(ctx, ref, opponent));
      const m = await fetchMatch(ctx, ref.matchAccount);
      ctx.sender.warpTo(BigInt(m.endTs.toString()));
      await setAllFeeds(ctx);
      expectOk(await finalizeMatch(ctx, ref, creator));
      emptyWallet(ctx, opponent.publicKey);
      const t0 = await ctx.sender.lamports(admin.treasury);
      expectOk(await settle(ctx, ref, creator));
      expect(await ctx.sender.lamports(opponent.publicKey)).to.equal(0n);
      expect((await ctx.sender.lamports(admin.treasury)) - t0).to.equal(
        400_000n
      );
    });
  });

  describe("typed errors, in PRD order", () => {
    it("an Open pot can't be settled (no opponent, so no opponent stats: AccountNotInitialized)", async () => {
      const ctx = v2Ctx();
      await setupAdmin(ctx);
      const creator = await newWallet(ctx);
      const { ref } = await createMatch(ctx, { creator });
      expectError(await settle(ctx, ref, creator), "AccountNotInitialized");
    });

    it("PotNotActive for a second settle (I3: a pot pays exactly once)", async () => {
      const f = await finalized("creator");
      expectOk(await settle(f.ctx, f.ref, f.creator));
      expectError(await settle(f.ctx, f.ref, f.creator), "PotNotActive");
    });

    it("MatchStillDelegated while Match is owned by the Delegation Program (commit not landed)", async () => {
      const { ctx, ref, creator } = await finalized("creator");
      setOwner(ctx, ref.matchAccount, v2.DELEGATION_PROGRAM_ID);
      expectError(await settle(ctx, ref, creator), "MatchStillDelegated");
    });

    it("MatchNotFinalized for an Active, unfinalized match", async () => {
      const ctx = v2Ctx();
      const { ref, creator } = await activeMatch(ctx);
      expectError(await settle(ctx, ref, creator), "MatchNotFinalized");
    });

    it("the first failing check wins: PotNotActive beats MatchStillDelegated", async () => {
      const { ctx, ref, creator } = await finalized("creator");
      expectOk(await settle(ctx, ref, creator));
      setOwner(ctx, ref.matchAccount, v2.DELEGATION_PROGRAM_ID);
      expectError(await settle(ctx, ref, creator), "PotNotActive");
    });
  });

  describe("I8: payout accounts cannot be redirected", () => {
    for (const which of [
      "creator",
      "opponent",
      "treasury",
      "matchAccount",
    ] as const) {
      it(`wrong ${which} fails (ConstraintAddress)`, async () => {
        const { ctx, ref, creator } = await finalized("creator");
        expectError(
          await settle(ctx, ref, creator, {
            [which]: Keypair.generate().publicKey,
          }),
          "ConstraintAddress"
        );
      });
    }
  });
});
