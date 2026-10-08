import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  createInitializeAccount3Instruction,
} from "@solana/spl-token";
import { closeDuelAccounts, findEscrow, playerVaults } from "@rug-royale/sdk";
import {
  closeDuel,
  createDuel,
  expectError,
  expectOk,
  injectActiveDuel,
  joinDuel,
  liteCtx,
  newWallet,
  setupProtocol,
} from "./fixtures";

// close_duel validates token accounts with `token::` constraints (stack budget), then
// `verify_ata_addresses` enforces the canonical ATAs. These tests pin that guarantee;
// the full close_duel suite (burn + close, PRD §6.8) comes with the handler.
describe("close_duel account validation", () => {
  async function settledDuel() {
    const ctx = liteCtx();
    const { mints } = await setupProtocol(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const { ref } = await injectActiveDuel(ctx, {
      creator,
      opponent,
      mints,
      status: "settled",
    });
    return { ctx, ref, creator, mints };
  }

  it("rejects a decoy token account with the right mint and owner", async () => {
    const { ctx, ref, creator, mints } = await settledDuel();
    // A non-ATA token account owned by the creator's vault authority, same mint.
    const decoy = Keypair.generate();
    const authority = playerVaults(ref, ref.creator).authority;
    const rent = Number(await ctx.sender.rentExempt(ACCOUNT_SIZE));
    expectOk(
      await ctx.sender.send(
        [
          SystemProgram.createAccount({
            fromPubkey: creator.publicKey,
            newAccountPubkey: decoy.publicKey,
            lamports: rent,
            space: ACCOUNT_SIZE,
            programId: TOKEN_2022_PROGRAM_ID,
          }),
          createInitializeAccount3Instruction(
            decoy.publicKey,
            mints.quote,
            authority,
            TOKEN_2022_PROGRAM_ID
          ),
        ],
        creator,
        [decoy]
      )
    );

    const accounts = {
      ...closeDuelAccounts(ref, creator.publicKey),
      creatorQuoteVault: decoy.publicKey,
    };
    const ix = await ctx.program.methods
      .closeDuel()
      .accountsStrict(accounts)
      .instruction();
    expectError(
      await ctx.sender.send([ix], creator),
      "AccountNotAssociatedTokenAccount"
    );
  });

  it("accepts the canonical ATAs", async () => {
    const { ctx, ref, creator } = await settledDuel();
    const ix = await ctx.program.methods
      .closeDuel()
      .accountsStrict(closeDuelAccounts(ref, creator.publicKey))
      .instruction();
    expectOk(await ctx.sender.send([ix], creator));
  });

  describe("guards (PRD §6.8), live before settle/cancel exist", () => {
    it("DuelStillLive on an Active duel: the creator can't take the opponent's entry", async () => {
      const ctx = liteCtx();
      const { mints } = await setupProtocol(ctx);
      const creator = await newWallet(ctx);
      const opponent = await newWallet(ctx);
      const entry = 100_000_000n;
      const created = await createDuel(ctx, {
        creator,
        mints,
        entryLamports: entry,
      });
      expectOk(created.res);
      const { ref } = await joinDuel(ctx, created.ref, opponent);
      const [escrow] = findEscrow(ctx.programId, ref.duel);
      const before = await ctx.sender.lamports(escrow);

      expectError(await closeDuel(ctx, ref, creator), "DuelStillLive");
      expect(await ctx.sender.lamports(escrow)).to.equal(before);
      expect(before - (await ctx.sender.rentExempt(9))).to.equal(2n * entry);
    });

    it("DuelStillLive on an Open duel", async () => {
      const ctx = liteCtx();
      const { mints } = await setupProtocol(ctx);
      const creator = await newWallet(ctx);
      const { res, ref } = await createDuel(ctx, {
        creator,
        mints,
        entryLamports: 50_000_000n,
      });
      expectOk(res);
      expectError(await closeDuel(ctx, ref, creator), "DuelStillLive");
    });
  });
});
