import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  DuelResult,
  DuelStatus,
  createDemoMintIxs,
  findEscrow,
  parseEvents,
  playerVaults,
  poolAccounts,
} from "@rug-royale/sdk";
import {
  createDuel,
  expectError,
  expectOk,
  fetchDuel,
  fetchPool,
  liteCtx,
  newWallet,
  setupProtocol,
  tokenBalance,
  type CreateDuelParams,
} from "./fixtures";

// PRD §6.2. Escrow space is 8 (discriminator) + 1 (bump).
const ESCROW_SPACE = 9;
const SOL = 1_000_000_000n;

describe("create_duel", () => {
  async function setup() {
    const ctx = liteCtx();
    const protocol = await setupProtocol(ctx);
    const creator = await newWallet(ctx);
    const create = (p: Partial<CreateDuelParams> = {}) =>
      createDuel(ctx, { creator, mints: protocol.mints, ...p });
    return { ctx, creator, create, ...protocol };
  }

  describe("happy path", () => {
    it("writes the Open duel, escrows the entry, and seeds the pool 1:1", async () => {
      const { ctx, creator, create, mints, configArgs } = await setup();
      const opponent = Keypair.generate().publicKey;
      const joinDeadline = (await ctx.sender.now()) + 3_600n;
      const entry = SOL / 20n; // 0.05 SOL
      const before = await ctx.sender.lamports(creator.publicKey);

      const { res, ref } = await create({
        tier: 1,
        windowSecs: 300,
        entryLamports: entry,
        allowedOpponent: opponent,
        joinDeadline,
        coin: mints.coins[3],
      });
      expectOk(res);
      console.log(`      create_duel CU: ${res.cu}`);

      const bankroll = BigInt(configArgs.tiers[1].toString());
      const seed = bankroll * BigInt(configArgs.poolSeedRatio.toString());
      const d = await fetchDuel(ctx, ref.duel);
      expect(d.status).to.equal(DuelStatus.Open);
      expect(d.result).to.equal(DuelResult.Pending);
      expect(d.tier).to.equal(1);
      expect(d.windowSecs).to.equal(300);
      expect(d.entryLamports).to.equal(entry);
      expect(d.sponsoredLamports).to.equal(0n);
      expect(d.bankroll).to.equal(bankroll);
      expect(d.joinDeadline).to.equal(joinDeadline);
      expect([d.startTs, d.endTs, d.finalA, d.finalB]).to.deep.equal([
        0n,
        0n,
        0n,
        0n,
      ]);
      expect(d.creator.equals(creator.publicKey)).to.equal(true);
      expect(d.opponent).to.equal(null);
      expect(d.allowedOpponent?.equals(opponent)).to.equal(true);
      expect(d.sponsor).to.equal(null);
      expect(d.coin.equals(mints.coins[3])).to.equal(true);
      expect(d.quoteMint.equals(mints.quote)).to.equal(true);
      expect(d.closed).to.equal(false);

      // I1: escrow holds rent + the creator's entry.
      const [escrow] = findEscrow(ctx.programId, ref.duel);
      expect(await ctx.sender.lamports(escrow)).to.equal(
        (await ctx.sender.rentExempt(ESCROW_SPACE)) + entry
      );
      // The creator paid at least the entry (plus rent for 7 accounts and the fee).
      expect(
        before - (await ctx.sender.lamports(creator.publicKey)) > entry
      ).to.equal(true);

      // Pool reserves equal the pool token balances, both at bankroll × ratio (G5).
      const pool = await fetchPool(ctx, poolAccounts(ref).pool);
      expect([pool.quoteReserve, pool.tokenReserve]).to.deep.equal([
        seed,
        seed,
      ]);
      expect(pool.duel.equals(ref.duel)).to.equal(true);
      expect(await tokenBalance(ctx, poolAccounts(ref).quote)).to.equal(seed);
      expect(await tokenBalance(ctx, poolAccounts(ref).coin)).to.equal(seed);

      // Creator vaults exist and are empty until join mints the bankroll.
      const v = playerVaults(ref, creator.publicKey);
      expect(await tokenBalance(ctx, v.quote)).to.equal(0n);
      expect(await ctx.sender.accountData(v.coin)).to.not.equal(null);

      const ev = parseEvents(res.logs).find((e) => e.name === "duelCreated");
      expect(ev, "DuelCreated event").to.not.equal(undefined);
      expect(ev!.data.duel.equals(ref.duel)).to.equal(true);
      expect(ev!.data.tier).to.equal(1);
    });

    it("unranked duel (entry 0): escrow holds only rent", async () => {
      const { ctx, create } = await setup();
      const { res, ref } = await create({ entryLamports: 0n });
      expectOk(res);
      const [escrow] = findEscrow(ctx.programId, ref.duel);
      expect(await ctx.sender.lamports(escrow)).to.equal(
        await ctx.sender.rentExempt(ESCROW_SPACE)
      );
    });

    it("accepts the deadline boundaries now + 60 and now + 86,400", async () => {
      const { ctx, create } = await setup();
      const now = await ctx.sender.now();
      expectOk((await create({ joinDeadline: now + 60n })).res);
      expectOk((await create({ joinDeadline: now + 86_400n })).res);
    });

    it("accepts the max entry", async () => {
      const { create, configArgs } = await setup();
      expectOk(
        (
          await create({
            entryLamports: BigInt(configArgs.maxEntryLamports.toString()),
          })
        ).res
      );
    });
  });

  describe("typed errors", () => {
    it("InvalidTier", async () => {
      const { create } = await setup();
      expectError((await create({ tier: 3 })).res, "InvalidTier");
    });

    it("InvalidWindow", async () => {
      const { create } = await setup();
      expectError((await create({ windowSecs: 45 })).res, "InvalidWindow");
    });

    it("MintNotAllowed", async () => {
      const { ctx, creator, create } = await setup();
      const stray = Keypair.generate();
      const rent = Number(await ctx.sender.rentExempt(82));
      expectOk(
        await ctx.sender.send(
          createDemoMintIxs({
            programId: ctx.programId,
            payer: creator.publicKey,
            mint: stray.publicKey,
            rentLamports: rent,
          }),
          creator,
          [stray]
        )
      );
      expectError(
        (await create({ coin: stray.publicKey })).res,
        "MintNotAllowed"
      );
    });

    it("DeadlineTooSoon", async () => {
      const { ctx, create } = await setup();
      expectError(
        (await create({ joinDeadline: (await ctx.sender.now()) + 59n })).res,
        "DeadlineTooSoon"
      );
    });

    it("DeadlineTooFar", async () => {
      const { ctx, create } = await setup();
      expectError(
        (await create({ joinDeadline: (await ctx.sender.now()) + 86_401n }))
          .res,
        "DeadlineTooFar"
      );
    });

    it("EntryTooHigh", async () => {
      const { create, configArgs } = await setup();
      const max = BigInt(configArgs.maxEntryLamports.toString());
      expectError(
        (await create({ entryLamports: max + 1n })).res,
        "EntryTooHigh"
      );
    });

    it("checks run in PRD order: the first failing check wins", async () => {
      const { ctx, create, configArgs } = await setup();
      const now = await ctx.sender.now();
      const tooHigh = BigInt(configArgs.maxEntryLamports.toString()) + 1n;
      const bad = {
        tier: 3,
        windowSecs: 45,
        joinDeadline: now,
        entryLamports: tooHigh,
      };
      expectError((await create(bad)).res, "InvalidTier");
      expectError((await create({ ...bad, tier: 0 })).res, "InvalidWindow");
      expectError(
        (await create({ ...bad, tier: 0, windowSecs: 120 })).res,
        "DeadlineTooSoon"
      );
      expectError(
        (
          await create({
            ...bad,
            tier: 0,
            windowSecs: 120,
            joinDeadline: now + 600n,
          })
        ).res,
        "EntryTooHigh"
      );
    });

    it("a nonce can't be reused by the same creator", async () => {
      const { create } = await setup();
      expectOk((await create({ nonce: 42n })).res);
      const again = await create({ nonce: 42n });
      expect(again.res.ok).to.equal(false);
    });
  });
});
