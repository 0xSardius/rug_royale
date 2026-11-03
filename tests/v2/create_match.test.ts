import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import {
  CreateMatchParams,
  VALIDATORS,
  createMatch,
  defaultArenaArgs,
  defaultProtocolArgs,
  expectError,
  expectOk,
  fetchMatch,
  fetchPot,
  fetchStats,
  newWallet,
  setupAdmin,
  updateArena,
  updateProtocol,
  v2Ctx,
  v2Events,
} from "./fixtures";

const SOL = 1_000_000_000n;
const POT_SPACE = 8 + 258; // discriminator + Pot::INIT_SPACE

// v2 PRD §6.2 create_match.
describe("v2 create_match", () => {
  async function ready() {
    const ctx = v2Ctx();
    const admin = await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const create = (p: Partial<CreateMatchParams> = {}) =>
      createMatch(ctx, { creator, ...p });
    return { ctx, creator, create, ...admin };
  }

  describe("happy path", () => {
    it("writes Pot (Open) and Match (seat 0 funded with the bankroll), escrows the entry, emits MatchCreated", async () => {
      const { ctx, creator, create } = await ready();
      const session = Keypair.generate().publicKey;
      const before = await ctx.sender.lamports(creator.publicKey);
      const { res, ref } = await create({
        entryLamports: SOL / 10n,
        windowSecs: 900,
        sessionKey: session,
        validator: VALIDATORS.eu,
      });
      expectOk(res);
      console.log(`      create_match CU: ${res.cu}`);

      const pot = await fetchPot(ctx, ref.pot);
      expect(pot.status).to.deep.equal({ open: {} });
      expect([pot.arenaId, pot.windowSecs, pot.rakeBps]).to.deep.equal([
        1, 900, 500,
      ]);
      expect(pot.entryLamports.toString()).to.equal((SOL / 10n).toString());
      expect([
        pot.feeShareLamports.toString(),
        pot.matchFeeLamports.toString(),
        pot.settlerTipLamports.toString(),
      ]).to.deep.equal(["0", "3010000", "1000000"]);
      expect(pot.creator.equals(creator.publicKey)).to.equal(true);
      expect(pot.opponent.equals(PublicKey.default)).to.equal(true);
      expect(pot.validator.equals(VALIDATORS.eu)).to.equal(true);
      expect(pot.matchAccount.equals(ref.matchAccount)).to.equal(true);

      const m = await fetchMatch(ctx, ref.matchAccount);
      expect(m.status).to.deep.equal({ open: {} });
      expect([
        m.assetCount,
        m.arenaId,
        m.tradeFeeBps,
        m.maxPriceAgeS,
        m.result,
      ]).to.deep.equal([10, 1, 10, 5, 0]);
      expect(m.pot.equals(ref.pot)).to.equal(true);
      expect(m.seats[0].player.equals(creator.publicKey)).to.equal(true);
      expect(m.seats[0].sessionKey.equals(session)).to.equal(true);
      expect(m.seats[0].cash.toString()).to.equal("10000000000");
      expect(m.seats[1].player.equals(PublicKey.default)).to.equal(true);

      // I1: pot lamports = rent + entry; creator paid entry + rent for 3 accounts.
      const rent = await ctx.sender.rentExempt(POT_SPACE);
      expect(await ctx.sender.lamports(ref.pot)).to.equal(rent + SOL / 10n);
      expect(
        before - (await ctx.sender.lamports(creator.publicKey)) > SOL / 10n
      ).to.equal(true);

      const stats = await fetchStats(ctx, creator.publicKey);
      expect(stats.wallet.equals(creator.publicKey)).to.equal(true);
      expect(stats.matches).to.equal(0); // counted at join

      const ev = v2Events(res).find((e) => e.name === "matchCreated")!;
      expect(ev.data.matchAccount.equals(ref.matchAccount)).to.equal(true);
      expect(ev.data.validator.equals(VALIDATORS.eu)).to.equal(true);
    });

    it("Q1: a free duel deposits ceil(match_fee / 2) as the creator's fee share", async () => {
      const { ctx, admin, treasury, create } = await ready();
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs({ matchFeeLamports: new BN(3_010_001) })
        )
      );
      const { res, ref } = await create({ entryLamports: 0n });
      expectOk(res);
      const pot = await fetchPot(ctx, ref.pot);
      expect(pot.feeShareLamports.toString()).to.equal("1505001");
      expect(await ctx.sender.lamports(ref.pot)).to.equal(
        (await ctx.sender.rentExempt(POT_SPACE)) + 1_505_001n
      );
    });

    it("I9: the match snapshots trade fee and price age; later arena edits don't change it", async () => {
      const { ctx, admin, create } = await ready();
      const { ref } = await create();
      expectOk(
        await updateArena(
          ctx,
          admin,
          1,
          defaultArenaArgs({ tradeFeeBps: 99, maxPriceAgeS: 60, rakeBps: 1000 })
        )
      );
      const m = await fetchMatch(ctx, ref.matchAccount);
      expect([m.tradeFeeBps, m.maxPriceAgeS]).to.deep.equal([10, 5]);
      expect((await fetchPot(ctx, ref.pot)).rakeBps).to.equal(500);
    });

    it("a second match reuses the creator's PlayerStats (init_if_needed)", async () => {
      const { create } = await ready();
      expectOk((await create()).res);
      expectOk((await create()).res);
    });

    it("the same nonce cannot be reused", async () => {
      const { create } = await ready();
      expectOk((await create({ nonce: 77n })).res);
      expect((await create({ nonce: 77n })).res.ok).to.equal(false);
    });
  });

  describe("typed errors, in PRD order", () => {
    it("Paused when the protocol is paused", async () => {
      const { ctx, admin, treasury, create } = await ready();
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs({ paused: true })
        )
      );
      expectError((await create()).res, "Paused");
    });
    it("Paused when the arena is paused", async () => {
      const { ctx, admin, create } = await ready();
      expectOk(
        await updateArena(ctx, admin, 1, defaultArenaArgs({ paused: true }))
      );
      expectError((await create()).res, "Paused");
    });
    it("InvalidWindow for a window the arena doesn't offer, and for 0", async () => {
      const { create } = await ready();
      expectError((await create({ windowSecs: 120 })).res, "InvalidWindow");
      expectError((await create({ windowSecs: 0 })).res, "InvalidWindow");
    });
    it("EntryOutOfRange below the arena minimum, above its maximum, and above the protocol cap", async () => {
      const { ctx, admin, treasury, create } = await ready();
      expectError(
        (await create({ entryLamports: 9_999_999n })).res,
        "EntryOutOfRange"
      );
      expectError(
        (await create({ entryLamports: SOL + 1n })).res,
        "EntryOutOfRange"
      );
      // Protocol cap lowered below the arena's max (Stage 2: free only).
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs({ maxEntryLamports: new BN(0) })
        )
      );
      expectError(
        (await create({ entryLamports: 10_000_000n })).res,
        "EntryOutOfRange"
      );
      expectOk((await create({ entryLamports: 0n })).res);
    });
    it("EntryOutOfRange for a paid entry in a free-only arena", async () => {
      const { ctx, admin, create } = await ready();
      expectOk(
        await updateArena(
          ctx,
          admin,
          1,
          defaultArenaArgs({
            minEntryLamports: new BN(0),
            maxEntryLamports: new BN(0),
          })
        )
      );
      expectError(
        (await create({ entryLamports: 10_000_000n })).res,
        "EntryOutOfRange"
      );
    });
    it("DeadlineTooSoon / DeadlineTooFar at the boundaries", async () => {
      const { ctx, create } = await ready();
      const now = await ctx.sender.now();
      expectError(
        (await create({ joinDeadline: now + 59n })).res,
        "DeadlineTooSoon"
      );
      expectOk((await create({ joinDeadline: now + 60n })).res);
      expectOk((await create({ joinDeadline: now + 86_400n })).res);
      expectError(
        (await create({ joinDeadline: now + 86_401n })).res,
        "DeadlineTooFar"
      );
    });
    it("CannotJoinOwnMatch when inviting yourself", async () => {
      const { creator, create } = await ready();
      expectError(
        (await create({ allowedOpponent: creator.publicKey })).res,
        "CannotJoinOwnMatch"
      );
    });
    it("InvalidValidator for an unset region", async () => {
      const { create } = await ready();
      expectError(
        (await create({ validator: PublicKey.default })).res,
        "InvalidValidator"
      );
    });
    it("the first failing check wins", async () => {
      const { ctx, admin, creator, create } = await ready();
      const now = await ctx.sender.now();
      const bad: Partial<CreateMatchParams> = {
        windowSecs: 1,
        entryLamports: 1n,
        joinDeadline: now,
        allowedOpponent: creator.publicKey,
        validator: PublicKey.default,
      };
      expectOk(
        await updateArena(ctx, admin, 1, defaultArenaArgs({ paused: true }))
      );
      expectError((await create(bad)).res, "Paused");
      expectOk(await updateArena(ctx, admin, 1, defaultArenaArgs()));
      const steps: [string, Partial<CreateMatchParams>][] = [
        ["InvalidWindow", { windowSecs: 300 }],
        ["EntryOutOfRange", { entryLamports: 0n }],
        ["DeadlineTooSoon", { joinDeadline: now + 3600n }],
        ["CannotJoinOwnMatch", { allowedOpponent: PublicKey.default }],
        ["InvalidValidator", { validator: VALIDATORS.us }],
      ];
      let p = bad;
      for (const [err, fix] of steps) {
        expectError((await create(p)).res, err);
        p = { ...p, ...fix };
      }
      expectOk((await create(p)).res);
    });
  });

  it("SDK lobby offsets: Pot status/arena/creator are where the filters expect", async () => {
    const { ctx, creator, create } = await ready();
    const { ref } = await create();
    const data = (await ctx.sender.accountData(ref.pot))!;
    expect(data[8]).to.equal(0); // status Open
    expect(data.readUInt16LE(10)).to.equal(1); // arena_id
    expect(
      new PublicKey(data.subarray(106, 138)).equals(creator.publicKey)
    ).to.equal(true);
    void v2;
  });
});
