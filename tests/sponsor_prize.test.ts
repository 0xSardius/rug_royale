import { expect } from "chai";
import { bnToBigInt, findEscrow, parseEvents } from "@rug-royale/sdk";
import {
  CreateDuelParams,
  cancelDuel,
  createDuel,
  expectError,
  expectOk,
  fetchDuel,
  joinDuel,
  liteCtx,
  newWallet,
  setupProtocol,
  sponsorPrize,
} from "./fixtures";

// PRD §6.3 with real create_duel / join_duel / cancel_duel.
const ESCROW_SPACE = 9;
const TX_FEE = 5_000n;
const ENTRY = 100_000_000n;

describe("sponsor_prize", () => {
  async function openDuel(p: Partial<CreateDuelParams> = {}) {
    const ctx = liteCtx();
    const { mints } = await setupProtocol(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const sponsor = await newWallet(ctx);
    const { res, ref } = await createDuel(ctx, {
      creator,
      mints,
      entryLamports: ENTRY,
      ...p,
    });
    expectOk(res);
    const [escrow] = findEscrow(ctx.programId, ref.duel);
    return { ctx, ref, creator, opponent, sponsor, escrow };
  }

  describe("happy path", () => {
    it("moves the amount into escrow, records the sponsor, emits PrizeSponsored", async () => {
      const { ctx, ref, sponsor, escrow } = await openDuel();
      const amount = 250_000_000n;
      const before = {
        sponsor: await ctx.sender.lamports(sponsor.publicKey),
        escrow: await ctx.sender.lamports(escrow),
      };

      const res = await sponsorPrize(ctx, ref, sponsor, amount);
      expectOk(res);
      console.log(`      sponsor_prize CU: ${res.cu}`);

      expect(await ctx.sender.lamports(sponsor.publicKey)).to.equal(
        before.sponsor - amount - TX_FEE
      );
      expect(await ctx.sender.lamports(escrow)).to.equal(
        before.escrow + amount
      );
      const d = await fetchDuel(ctx, ref.duel);
      expect(d.sponsoredLamports).to.equal(amount);
      expect(d.sponsor?.toBase58()).to.equal(sponsor.publicKey.toBase58());

      const ev = parseEvents(res.logs, ctx.programId).find(
        (e) => e.name === "prizeSponsored"
      )!;
      expect(ev.data.duel.toBase58()).to.equal(ref.duel.toBase58());
      expect(ev.data.sponsor.toBase58()).to.equal(sponsor.publicKey.toBase58());
      expect(bnToBigInt(ev.data.amount)).to.equal(amount);
      expect(bnToBigInt(ev.data.total)).to.equal(amount);
    });

    it("the same sponsor can top up; total accumulates", async () => {
      const { ctx, ref, sponsor } = await openDuel();
      expectOk(await sponsorPrize(ctx, ref, sponsor, 100n));
      const res = await sponsorPrize(ctx, ref, sponsor, 250n);
      expectOk(res);
      expect((await fetchDuel(ctx, ref.duel)).sponsoredLamports).to.equal(350n);
      const ev = parseEvents(res.logs, ctx.programId).find(
        (e) => e.name === "prizeSponsored"
      )!;
      expect([
        bnToBigInt(ev.data.amount),
        bnToBigInt(ev.data.total),
      ]).to.deep.equal([250n, 350n]);
    });

    it("I1: escrow = rent + entries + sponsored after create, sponsor and join", async () => {
      const { ctx, ref, opponent, sponsor, escrow } = await openDuel();
      const rent = await ctx.sender.rentExempt(ESCROW_SPACE);
      expect(await ctx.sender.lamports(escrow)).to.equal(rent + ENTRY);
      expectOk(await sponsorPrize(ctx, ref, sponsor, 7n));
      expect(await ctx.sender.lamports(escrow)).to.equal(rent + ENTRY + 7n);
      expectOk((await joinDuel(ctx, ref, opponent)).res);
      expect(await ctx.sender.lamports(escrow)).to.equal(
        rent + 2n * ENTRY + 7n
      );
    });
  });

  describe("errors, in PRD order", () => {
    it("DuelNotOpen once someone joined, and after a cancel", async () => {
      const a = await openDuel();
      expectOk((await joinDuel(a.ctx, a.ref, a.opponent)).res);
      expectError(
        await sponsorPrize(a.ctx, a.ref, a.sponsor, 1n),
        "DuelNotOpen"
      );

      const b = await openDuel();
      const d = await fetchDuel(b.ctx, b.ref.duel);
      b.ctx.sender.warpTo(d.joinDeadline);
      expectOk(await cancelDuel(b.ctx, b.ref, b.creator));
      expectError(
        await sponsorPrize(b.ctx, b.ref, b.sponsor, 1n),
        "DuelNotOpen"
      );
    });

    it("ZeroAmount for amount = 0", async () => {
      const { ctx, ref, sponsor } = await openDuel();
      expectError(await sponsorPrize(ctx, ref, sponsor, 0n), "ZeroAmount");
    });

    it("SponsorMismatch for a second, different sponsor", async () => {
      const { ctx, ref, sponsor } = await openDuel();
      expectOk(await sponsorPrize(ctx, ref, sponsor, 10n));
      const other = await newWallet(ctx);
      expectError(await sponsorPrize(ctx, ref, other, 10n), "SponsorMismatch");
    });

    it("the first failing check wins", async () => {
      // Joined + zero amount: DuelNotOpen comes before ZeroAmount.
      const a = await openDuel();
      expectOk((await joinDuel(a.ctx, a.ref, a.opponent)).res);
      expectError(
        await sponsorPrize(a.ctx, a.ref, a.sponsor, 0n),
        "DuelNotOpen"
      );
      // Wrong sponsor + zero amount: ZeroAmount comes before SponsorMismatch.
      const b = await openDuel();
      expectOk(await sponsorPrize(b.ctx, b.ref, b.sponsor, 10n));
      expectError(
        await sponsorPrize(b.ctx, b.ref, await newWallet(b.ctx), 0n),
        "ZeroAmount"
      );
    });
  });
});
