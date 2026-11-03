import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import {
  CreateMatchParams,
  cancelMatch,
  createMatch,
  defaultProtocolArgs,
  emptyWallet,
  expectError,
  expectOk,
  fetchPot,
  joinMatch,
  newWallet,
  setupAdmin,
  sponsorMatch,
  updateProtocol,
  v2Ctx,
  v2Events,
} from "./fixtures";

const SOL = 1_000_000_000n;
const POT_SPACE = 8 + 258;
const TX_FEE = 5_000n;

// v2 PRD §6.2 cancel_match.
describe("v2 cancel_match", () => {
  async function ready(p: Partial<CreateMatchParams> = {}) {
    const ctx = v2Ctx();
    const admin = await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const caller = await newWallet(ctx);
    const deadline = (await ctx.sender.now()) + 120n;
    const { res, ref } = await createMatch(ctx, {
      creator,
      joinDeadline: deadline,
      ...p,
    });
    expectOk(res);
    return { ctx, ref, creator, caller, deadline, ...admin };
  }

  describe("happy path", () => {
    it("refunds the creator's entry and the sponsor, leaves the pot at rent, emits MatchCancelled", async () => {
      const { ctx, ref, creator, caller, deadline } = await ready({
        entryLamports: SOL / 10n,
      });
      const sponsor = await newWallet(ctx);
      expectOk(await sponsorMatch(ctx, ref, sponsor, 30_000_000n));
      ctx.sender.warpTo(deadline);
      const before = {
        creator: await ctx.sender.lamports(creator.publicKey),
        sponsor: await ctx.sender.lamports(sponsor.publicKey),
      };
      const res = await cancelMatch(ctx, ref, caller); // permissionless
      expectOk(res);
      console.log(`      cancel_match CU: ${res.cu}`);
      expect(
        (await ctx.sender.lamports(creator.publicKey)) - before.creator
      ).to.equal(SOL / 10n);
      expect(
        (await ctx.sender.lamports(sponsor.publicKey)) - before.sponsor
      ).to.equal(30_000_000n);
      expect(await ctx.sender.lamports(ref.pot)).to.equal(
        await ctx.sender.rentExempt(POT_SPACE)
      ); // I2
      expect((await fetchPot(ctx, ref.pot)).status).to.deep.equal({
        cancelled: {},
      });
      const ev = v2Events(res).find((e) => e.name === "matchCancelled")!;
      expect([
        ev.data.refundedEntry.toString(),
        ev.data.refundedSponsored.toString(),
      ]).to.deep.equal(["100000000", "30000000"]);
    });

    it("Q1: a free duel refunds the creator's fee share", async () => {
      const { ctx, ref, creator, deadline } = await ready({
        entryLamports: 0n,
      });
      ctx.sender.warpTo(deadline);
      const before = await ctx.sender.lamports(creator.publicKey);
      expectOk(await cancelMatch(ctx, ref, creator));
      expect((await ctx.sender.lamports(creator.publicKey)) - before).to.equal(
        1_505_000n - TX_FEE
      );
      expect(await ctx.sender.lamports(ref.pot)).to.equal(
        await ctx.sender.rentExempt(POT_SPACE)
      );
    });

    it("works with no sponsor (optional account omitted)", async () => {
      const { ctx, ref, caller, deadline } = await ready({
        entryLamports: SOL / 100n,
      });
      ctx.sender.warpTo(deadline);
      expectOk(await cancelMatch(ctx, ref, caller));
    });
  });

  describe("I4: exactly one of join and cancel is valid", () => {
    it("at join_deadline - 1: join works, cancel fails; at join_deadline: the reverse", async () => {
      const a = await ready();
      a.ctx.sender.warpTo(a.deadline - 1n);
      expectError(
        await cancelMatch(a.ctx, a.ref, a.caller),
        "DeadlineNotReached"
      );
      expectOk(await joinMatch(a.ctx, a.ref, await newWallet(a.ctx)));

      const b = await ready();
      b.ctx.sender.warpTo(b.deadline);
      expectError(
        await joinMatch(b.ctx, b.ref, await newWallet(b.ctx)),
        "JoinDeadlinePassed"
      );
      expectOk(await cancelMatch(b.ctx, b.ref, b.caller));
    });
  });

  describe("I11 / M1: an emptied wallet never blocks cancel", () => {
    it("a sub-rent refund to an emptied creator goes to the treasury", async () => {
      // Match fee 1,000,000 -> free-duel share 500,000, below the 890,880 rent minimum.
      const ctx = v2Ctx();
      const { admin, treasury } = await setupAdmin(ctx);
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs({ matchFeeLamports: new BN(1_000_000) })
        )
      );
      const creator = await newWallet(ctx);
      const deadline = (await ctx.sender.now()) + 120n;
      const { ref } = await createMatch(ctx, {
        creator,
        joinDeadline: deadline,
        entryLamports: 0n,
      });
      ctx.sender.warpTo(deadline);
      emptyWallet(ctx, creator.publicKey);
      const t0 = await ctx.sender.lamports(treasury);
      expectOk(await cancelMatch(ctx, ref, await newWallet(ctx)));
      expect(await ctx.sender.lamports(creator.publicKey)).to.equal(0n);
      expect((await ctx.sender.lamports(treasury)) - t0).to.equal(500_000n);
      expect(await ctx.sender.lamports(ref.pot)).to.equal(
        await ctx.sender.rentExempt(POT_SPACE)
      );
    });

    it("a refund big enough to be rent-exempt still reaches an emptied creator", async () => {
      const { ctx, ref, creator, caller, deadline } = await ready({
        entryLamports: SOL / 100n,
      });
      ctx.sender.warpTo(deadline);
      emptyWallet(ctx, creator.publicKey);
      expectOk(await cancelMatch(ctx, ref, caller));
      expect(await ctx.sender.lamports(creator.publicKey)).to.equal(SOL / 100n);
    });
  });

  describe("typed errors, in PRD order", () => {
    it("MatchNotOpen once joined, and on a second cancel", async () => {
      const a = await ready();
      expectOk(await joinMatch(a.ctx, a.ref, await newWallet(a.ctx)));
      a.ctx.sender.warpTo(a.deadline);
      expectError(await cancelMatch(a.ctx, a.ref, a.caller), "MatchNotOpen");

      const b = await ready();
      b.ctx.sender.warpTo(b.deadline);
      expectOk(await cancelMatch(b.ctx, b.ref, b.caller));
      expectError(await cancelMatch(b.ctx, b.ref, b.caller), "MatchNotOpen");
    });
    it("DeadlineNotReached before the deadline", async () => {
      const { ctx, ref, caller } = await ready();
      expectError(await cancelMatch(ctx, ref, caller), "DeadlineNotReached");
    });
    it("a sponsored pot can't cancel without the sponsor account (AccountNotEnoughKeys)", async () => {
      const { ctx, ref, caller, deadline } = await ready();
      expectOk(await sponsorMatch(ctx, ref, await newWallet(ctx), 10_000_000n));
      ctx.sender.warpTo(deadline);
      expectError(
        await cancelMatch(ctx, ref, caller, { sponsor: null }),
        "AccountNotEnoughKeys"
      );
    });
    it("MatchNotOpen beats DeadlineNotReached", async () => {
      const { ctx, ref, caller } = await ready();
      expectOk(await joinMatch(ctx, ref, await newWallet(ctx)));
      expectError(await cancelMatch(ctx, ref, caller), "MatchNotOpen");
    });
  });

  describe("I8: refund accounts cannot be redirected", () => {
    for (const which of ["creator", "sponsor", "treasury"] as const) {
      it(`wrong ${which} fails (ConstraintAddress)`, async () => {
        const { ctx, ref, caller, deadline } = await ready({
          entryLamports: SOL / 100n,
        });
        expectOk(
          await sponsorMatch(ctx, ref, await newWallet(ctx), 10_000_000n)
        );
        ctx.sender.warpTo(deadline);
        expectError(
          await cancelMatch(ctx, ref, caller, {
            [which]: Keypair.generate().publicKey,
          }),
          "ConstraintAddress"
        );
      });
    }
  });
});
