import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  DuelStatus,
  findEscrow,
  parseEvents,
  poolAccounts,
} from "@rug-royale/sdk";
import {
  cancelDuel,
  closeDuel,
  createDuel,
  expectError,
  expectOk,
  fetchDuel,
  injectSponsor,
  joinDuel,
  liteCtx,
  newWallet,
  setupProtocol,
  type CreateDuelParams,
} from "./fixtures";

// PRD §6.7, with real create_duel (sponsored cases inject the deposit until sponsor_prize lands).
const ESCROW_SPACE = 9;
const ENTRY = 50_000_000n;

describe("cancel_duel", () => {
  async function openDuel(p: Partial<CreateDuelParams> = {}) {
    const ctx = liteCtx();
    const { mints } = await setupProtocol(ctx);
    const creator = await newWallet(ctx);
    const caller = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const joinDeadline = (await ctx.sender.now()) + 3_600n;
    const { res, ref } = await createDuel(ctx, {
      creator,
      mints,
      joinDeadline,
      entryLamports: ENTRY,
      ...p,
    });
    expectOk(res);
    return { ctx, creator, caller, opponent, ref, joinDeadline };
  }
  const escrowOf = (
    ctx: ReturnType<typeof liteCtx>,
    duel: Parameters<typeof findEscrow>[1]
  ) => findEscrow(ctx.programId, duel)[0];

  describe("happy path", () => {
    it("anyone can cancel after the deadline; the entry goes to the creator, not the caller", async () => {
      const { ctx, creator, caller, ref, joinDeadline } = await openDuel();
      ctx.sender.warpTo(joinDeadline);
      const before = {
        creator: await ctx.sender.lamports(creator.publicKey),
        caller: await ctx.sender.lamports(caller.publicKey),
      };
      const res = await cancelDuel(ctx, ref, caller);
      expectOk(res);
      console.log(`      cancel_duel CU: ${res.cu}`);

      expect((await fetchDuel(ctx, ref.duel)).status).to.equal(
        DuelStatus.Cancelled
      );
      expect(
        (await ctx.sender.lamports(creator.publicKey)) - before.creator
      ).to.equal(ENTRY);
      expect(
        (await ctx.sender.lamports(caller.publicKey)) <= before.caller
      ).to.equal(true);
      expect(await ctx.sender.lamports(escrowOf(ctx, ref.duel))).to.equal(
        await ctx.sender.rentExempt(ESCROW_SPACE)
      );
      const ev = parseEvents(res.logs).find((e) => e.name === "duelCancelled");
      expect(ev, "DuelCancelled event").to.not.equal(undefined);
      expect(ev!.data.refundedEntry.toString()).to.equal(ENTRY.toString());
    });

    it("unranked duel: cancels with nothing to refund", async () => {
      const { ctx, caller, ref, joinDeadline } = await openDuel({
        entryLamports: 0n,
      });
      ctx.sender.warpTo(joinDeadline);
      expectOk(await cancelDuel(ctx, ref, caller));
      expect(await ctx.sender.lamports(escrowOf(ctx, ref.duel))).to.equal(
        await ctx.sender.rentExempt(ESCROW_SPACE)
      );
    });

    it("sponsored duel: the sponsor gets the sponsored amount back, the creator the entry", async () => {
      const { ctx, creator, caller, ref, joinDeadline } = await openDuel();
      const sponsor = Keypair.generate().publicKey;
      const sponsored = 300_000_000n;
      await injectSponsor(ctx, ref, sponsor, sponsored);
      ctx.sender.warpTo(joinDeadline);
      const creatorBefore = await ctx.sender.lamports(creator.publicKey);
      expectOk(await cancelDuel(ctx, ref, caller, sponsor));
      expect(await ctx.sender.lamports(sponsor)).to.equal(sponsored);
      expect(
        (await ctx.sender.lamports(creator.publicKey)) - creatorBefore
      ).to.equal(ENTRY);
      expect(await ctx.sender.lamports(escrowOf(ctx, ref.duel))).to.equal(
        await ctx.sender.rentExempt(ESCROW_SPACE)
      );
    });

    it("a cancelled duel closes through the real path; only the Duel record remains", async () => {
      const { ctx, caller, ref, joinDeadline } = await openDuel();
      ctx.sender.warpTo(joinDeadline);
      expectOk(await cancelDuel(ctx, ref, caller));
      expectOk(await closeDuel(ctx, ref, caller));
      for (const pk of [escrowOf(ctx, ref.duel), poolAccounts(ref).pool]) {
        expect(await ctx.sender.accountData(pk)).to.equal(null);
      }
      expect((await fetchDuel(ctx, ref.duel)).closed).to.equal(true);
    });
  });

  describe("errors", () => {
    it("DeadlineNotReached before join_deadline", async () => {
      const { ctx, caller, ref, joinDeadline } = await openDuel();
      ctx.sender.warpTo(joinDeadline - 1n);
      expectError(await cancelDuel(ctx, ref, caller), "DeadlineNotReached");
    });

    it("DuelNotOpen once someone joined, and on a second cancel", async () => {
      const a = await openDuel();
      expectOk((await joinDuel(a.ctx, a.ref, a.opponent)).res);
      a.ctx.sender.warpTo(a.joinDeadline);
      expectError(await cancelDuel(a.ctx, a.ref, a.caller), "DuelNotOpen");

      const b = await openDuel();
      b.ctx.sender.warpTo(b.joinDeadline);
      expectOk(await cancelDuel(b.ctx, b.ref, b.caller));
      expectError(await cancelDuel(b.ctx, b.ref, b.caller), "DuelNotOpen");
    });

    it("checks run in PRD order: DuelNotOpen before DeadlineNotReached", async () => {
      const { ctx, caller, opponent, ref, joinDeadline } = await openDuel();
      expectOk((await joinDuel(ctx, ref, opponent)).res);
      ctx.sender.warpTo(joinDeadline - 1n);
      expectError(await cancelDuel(ctx, ref, caller), "DuelNotOpen");
    });

    it("a sponsored duel can't cancel without the sponsor account", async () => {
      const { ctx, caller, ref, joinDeadline } = await openDuel();
      await injectSponsor(ctx, ref, Keypair.generate().publicKey, 1_000_000n);
      ctx.sender.warpTo(joinDeadline);
      expectError(
        await cancelDuel(ctx, ref, caller, null),
        "AccountNotEnoughKeys"
      );
    });

    it("the sponsor refund can't be redirected (ConstraintAddress)", async () => {
      const { ctx, caller, ref, joinDeadline } = await openDuel();
      await injectSponsor(ctx, ref, Keypair.generate().publicKey, 1_000_000n);
      ctx.sender.warpTo(joinDeadline);
      expectError(
        await cancelDuel(ctx, ref, caller, caller.publicKey),
        "ConstraintAddress"
      );
    });
  });

  it("I8: exactly one of join and cancel is valid at deadline - 1 and at the deadline", async () => {
    const a = await openDuel();
    a.ctx.sender.warpTo(a.joinDeadline - 1n);
    expectError(await cancelDuel(a.ctx, a.ref, a.caller), "DeadlineNotReached");
    expectOk((await joinDuel(a.ctx, a.ref, a.opponent)).res);

    const b = await openDuel();
    b.ctx.sender.warpTo(b.joinDeadline);
    expectError(
      (await joinDuel(b.ctx, b.ref, b.opponent)).res,
      "JoinDeadlinePassed"
    );
    expectOk(await cancelDuel(b.ctx, b.ref, b.caller));
  });
});
