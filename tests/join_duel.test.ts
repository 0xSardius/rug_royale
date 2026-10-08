import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  DuelStatus,
  findEscrow,
  parseEvents,
  playerVaults,
} from "@rug-royale/sdk";
import {
  createDuel,
  expectError,
  expectOk,
  fetchDuel,
  joinDuel,
  liteCtx,
  newWallet,
  setupProtocol,
  tokenBalance,
  type CreateDuelParams,
} from "./fixtures";

// PRD §6.4, with real create_duel + join_duel (no injected state).
const ESCROW_SPACE = 9;
const START_DELAY = 60n;

describe("join_duel", () => {
  async function openDuel(p: Partial<CreateDuelParams> = {}) {
    const ctx = liteCtx();
    const { mints, configArgs } = await setupProtocol(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const now = await ctx.sender.now();
    const joinDeadline = p.joinDeadline ?? now + 3_600n;
    const { res, ref } = await createDuel(ctx, {
      creator,
      mints,
      joinDeadline,
      ...p,
    });
    expectOk(res);
    return { ctx, mints, configArgs, creator, opponent, ref, joinDeadline };
  }

  describe("happy path", () => {
    it("seats the opponent, starts the window in 60 s, and mints equal bankrolls", async () => {
      const entry = 50_000_000n;
      const { ctx, creator, opponent, ref } = await openDuel({
        entryLamports: entry,
        windowSecs: 120,
      });
      const now = await ctx.sender.now();
      const { res, ref: joined } = await joinDuel(ctx, ref, opponent);
      expectOk(res);
      console.log(`      join_duel CU: ${res.cu}`);

      const d = await fetchDuel(ctx, ref.duel);
      expect(d.status).to.equal(DuelStatus.Active);
      expect(d.opponent?.equals(opponent.publicKey)).to.equal(true);
      expect(d.startTs).to.equal(now + START_DELAY);
      expect(d.endTs).to.equal(now + START_DELAY + 120n);

      // Equal bankrolls in both quote vaults; the opponent's coin vault exists and is empty.
      const c = playerVaults(joined, creator.publicKey);
      const o = playerVaults(joined, opponent.publicKey);
      expect(await tokenBalance(ctx, c.quote)).to.equal(d.bankroll);
      expect(await tokenBalance(ctx, o.quote)).to.equal(d.bankroll);
      expect(await ctx.sender.accountData(o.coin)).to.not.equal(null);
      expect(await tokenBalance(ctx, o.coin)).to.equal(0n);

      // I1: escrow holds rent + both entries.
      const [escrow] = findEscrow(ctx.programId, ref.duel);
      expect(await ctx.sender.lamports(escrow)).to.equal(
        (await ctx.sender.rentExempt(ESCROW_SPACE)) + 2n * entry
      );

      const ev = parseEvents(res.logs).find((e) => e.name === "duelJoined");
      expect(ev, "DuelJoined event").to.not.equal(undefined);
      expect(ev!.data.opponent.equals(opponent.publicKey)).to.equal(true);
    });

    it("unranked duel: no lamports move into escrow", async () => {
      const { ctx, opponent, ref } = await openDuel({ entryLamports: 0n });
      expectOk((await joinDuel(ctx, ref, opponent)).res);
      const [escrow] = findEscrow(ctx.programId, ref.duel);
      expect(await ctx.sender.lamports(escrow)).to.equal(
        await ctx.sender.rentExempt(ESCROW_SPACE)
      );
    });

    it("the invited opponent can join an invite-only duel", async () => {
      const ctx = liteCtx();
      const { mints } = await setupProtocol(ctx);
      const creator = await newWallet(ctx);
      const invited = await newWallet(ctx);
      const { res, ref } = await createDuel(ctx, {
        creator,
        mints,
        allowedOpponent: invited.publicKey,
      });
      expectOk(res);
      expectOk((await joinDuel(ctx, ref, invited)).res);
    });
  });

  describe("griefing", () => {
    it("still joins if an attacker pre-created the opponent's vaults", async () => {
      const { ctx, opponent, ref } = await openDuel();
      const attacker = await newWallet(ctx);
      const o = playerVaults(ref, opponent.publicKey);
      expectOk(
        await ctx.sender.send(
          [ref.quoteMint, ref.coinMint].map((mint) =>
            createAssociatedTokenAccountIdempotentInstruction(
              attacker.publicKey,
              getAssociatedTokenAddressSync(
                mint,
                o.authority,
                true,
                TOKEN_2022_PROGRAM_ID
              ),
              o.authority,
              mint,
              TOKEN_2022_PROGRAM_ID
            )
          ),
          attacker
        )
      );
      expectOk((await joinDuel(ctx, ref, opponent)).res);
      const d = await fetchDuel(ctx, ref.duel);
      expect(await tokenBalance(ctx, o.quote)).to.equal(d.bankroll);
    });
  });

  describe("typed errors", () => {
    it("DuelNotOpen once someone has joined (including a repeat join)", async () => {
      const { ctx, opponent, ref } = await openDuel();
      expectOk((await joinDuel(ctx, ref, opponent)).res);
      const third = await newWallet(ctx);
      expectError((await joinDuel(ctx, ref, third)).res, "DuelNotOpen");
      expectError((await joinDuel(ctx, ref, opponent)).res, "DuelNotOpen");
    });

    it("JoinDeadlinePassed at exactly join_deadline (I8: join is valid until deadline - 1)", async () => {
      const { ctx, opponent, ref, joinDeadline } = await openDuel();
      ctx.sender.warpTo(joinDeadline);
      expectError(
        (await joinDuel(ctx, ref, opponent)).res,
        "JoinDeadlinePassed"
      );
      ctx.sender.warpTo(joinDeadline - 1n);
      expectOk((await joinDuel(ctx, ref, opponent)).res);
    });

    it("CannotJoinOwnDuel (not 'account already in use')", async () => {
      const { ctx, creator, ref } = await openDuel();
      expectError((await joinDuel(ctx, ref, creator)).res, "CannotJoinOwnDuel");
    });

    it("OpponentNotAllowed for anyone but the invited wallet", async () => {
      const invited = Keypair.generate().publicKey;
      const { ctx, opponent, ref } = await openDuel({
        allowedOpponent: invited,
      });
      expectError(
        (await joinDuel(ctx, ref, opponent)).res,
        "OpponentNotAllowed"
      );
    });

    it("checks run in PRD order: the first failing check wins", async () => {
      const invited = Keypair.generate().publicKey;
      const { ctx, creator, opponent, ref, joinDeadline } = await openDuel({
        allowedOpponent: invited,
      });
      ctx.sender.warpTo(joinDeadline);
      expectError(
        (await joinDuel(ctx, ref, creator)).res,
        "JoinDeadlinePassed"
      );
      ctx.sender.warpTo(joinDeadline - 10n);
      expectError((await joinDuel(ctx, ref, creator)).res, "CannotJoinOwnDuel");
      expectError(
        (await joinDuel(ctx, ref, opponent)).res,
        "OpponentNotAllowed"
      );
    });
  });
});
