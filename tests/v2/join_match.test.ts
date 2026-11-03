import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import {
  CreateMatchParams,
  createMatch,
  defaultArenaArgs,
  defaultProtocolArgs,
  expectError,
  expectOk,
  fetchMatch,
  fetchPot,
  fetchStats,
  joinMatch,
  newWallet,
  setupAdmin,
  sponsorMatch,
  updateArena,
  updateProtocol,
  v2Ctx,
  v2Events,
} from "./fixtures";

const SOL = 1_000_000_000n;
const POT_SPACE = 8 + 258;
const DAY = 86_400n;

// v2 PRD §6.2 join_match.
describe("v2 join_match", () => {
  async function ready() {
    const ctx = v2Ctx();
    const admin = await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const open = async (p: Partial<CreateMatchParams> = {}) => {
      const { res, ref } = await createMatch(ctx, { creator, ...p });
      expectOk(res);
      return ref;
    };
    return { ctx, creator, opponent, open, ...admin };
  }

  /** Opens a sponsored freeroll between `creator` and `opponent` and joins it. */
  async function playFreeroll(
    r: Awaited<ReturnType<typeof ready>>,
    opponent = r.opponent
  ) {
    const ref = await r.open({ entryLamports: 0n });
    expectOk(
      await sponsorMatch(r.ctx, ref, await newWallet(r.ctx), 10_000_000n)
    );
    return { ref, res: await joinMatch(r.ctx, ref, opponent) };
  }

  describe("happy path", () => {
    it("activates Pot and Match, fills seat 1, sets the clock, escrows the entry, emits MatchJoined", async () => {
      const { ctx, creator, opponent, open } = await ready();
      const ref = await open({ entryLamports: SOL / 10n, windowSecs: 900 });
      const session = Keypair.generate().publicKey;
      const now = await ctx.sender.now();
      const res = await joinMatch(ctx, ref, opponent, session);
      expectOk(res);
      console.log(`      join_match CU: ${res.cu}`);

      const pot = await fetchPot(ctx, ref.pot);
      expect(pot.status).to.deep.equal({ active: {} });
      expect(pot.opponent.equals(opponent.publicKey)).to.equal(true);
      const m = await fetchMatch(ctx, ref.matchAccount);
      expect(m.status).to.deep.equal({ active: {} });
      expect(m.startTs.toString()).to.equal((now + 20n).toString()); // start_delay_secs = 20 (Q2)
      expect(m.endTs.toString()).to.equal((now + 20n + 900n).toString());
      expect(pot.endTs.toString()).to.equal(m.endTs.toString());
      expect(m.seats[1].player.equals(opponent.publicKey)).to.equal(true);
      expect(m.seats[1].sessionKey.equals(session)).to.equal(true);
      expect(m.seats[1].cash.toString()).to.equal(m.seats[0].cash.toString());
      // I1: pot = rent + both entries.
      expect(await ctx.sender.lamports(ref.pot)).to.equal(
        (await ctx.sender.rentExempt(POT_SPACE)) + SOL / 5n
      );
      expect((await fetchStats(ctx, creator.publicKey)).matches).to.equal(1);
      expect((await fetchStats(ctx, opponent.publicKey)).matches).to.equal(1);
      const ev = v2Events(res).find((e) => e.name === "matchJoined")!;
      expect(ev.data.opponent.equals(opponent.publicKey)).to.equal(true);
      expect(ev.data.endTs.toString()).to.equal(m.endTs.toString());
    });

    it("Q1: a free duel takes the joiner's fee share too", async () => {
      const { ctx, opponent, open } = await ready();
      const ref = await open({ entryLamports: 0n });
      expectOk(await joinMatch(ctx, ref, opponent));
      expect(await ctx.sender.lamports(ref.pot)).to.equal(
        (await ctx.sender.rentExempt(POT_SPACE)) + 2n * 1_505_000n
      );
    });

    it("both bankrolls stay equal even if the arena bankroll changed after create", async () => {
      const { ctx, admin, opponent, open } = await ready();
      const ref = await open();
      expectOk(
        await updateArena(
          ctx,
          admin,
          1,
          defaultArenaArgs({ bankroll: new BN(1) })
        )
      );
      expectOk(await joinMatch(ctx, ref, opponent));
      const m = await fetchMatch(ctx, ref.matchAccount);
      expect([
        m.seats[0].cash.toString(),
        m.seats[1].cash.toString(),
      ]).to.deep.equal(["10000000000", "10000000000"]);
    });

    it("an invited opponent can join", async () => {
      const { ctx, opponent, open } = await ready();
      const ref = await open({ allowedOpponent: opponent.publicKey });
      expectOk(await joinMatch(ctx, ref, opponent));
    });
  });

  describe("freeroll cap (V9, D4: 3 per wallet per day)", () => {
    it("counts sponsored freerolls for both players; the 4th in a day fails; a new day resets", async () => {
      const r = await ready();
      for (let i = 0; i < 3; i++) expectOk((await playFreeroll(r)).res);
      const s = await fetchStats(r.ctx, r.creator.publicKey);
      expect(s.freerollsToday).to.equal(3);
      expectError((await playFreeroll(r)).res, "FreerollCapReached");
      r.ctx.sender.warpTo((await r.ctx.sender.now()) + DAY);
      expectOk((await playFreeroll(r)).res);
      expect(
        (await fetchStats(r.ctx, r.creator.publicKey)).freerollsToday
      ).to.equal(1);
    });

    it("either player at the cap blocks the join (here: the opponent)", async () => {
      const r = await ready();
      for (let i = 0; i < 3; i++) expectOk((await playFreeroll(r)).res);
      // A fresh creator, same capped opponent.
      const creator2 = await newWallet(r.ctx);
      const { res, ref } = await createMatch(r.ctx, {
        creator: creator2,
        entryLamports: 0n,
      });
      expectOk(res);
      expectOk(
        await sponsorMatch(r.ctx, ref, await newWallet(r.ctx), 10_000_000n)
      );
      expectError(
        await joinMatch(r.ctx, ref, r.opponent),
        "FreerollCapReached"
      );
    });

    it("paid duels and unsponsored free duels don't count", async () => {
      const r = await ready();
      for (let i = 0; i < 4; i++) {
        expectOk(
          await joinMatch(
            r.ctx,
            await r.open({ entryLamports: 10_000_000n }),
            r.opponent
          )
        );
        expectOk(
          await joinMatch(
            r.ctx,
            await r.open({ entryLamports: 0n }),
            r.opponent
          )
        );
      }
      const s = await fetchStats(r.ctx, r.opponent.publicKey);
      expect([s.freerollsToday, s.matches]).to.deep.equal([0, 8]);
    });

    it("a cap of 0 disables sponsored freerolls in that arena", async () => {
      const r = await ready();
      expectOk(
        await updateArena(
          r.ctx,
          r.admin,
          1,
          defaultArenaArgs({ freerollDailyCap: 0 })
        )
      );
      expectError((await playFreeroll(r)).res, "FreerollCapReached");
    });
  });

  describe("typed errors, in PRD order", () => {
    it("Paused (protocol, then arena)", async () => {
      const { ctx, admin, treasury, opponent, open } = await ready();
      const ref = await open();
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs({ paused: true })
        )
      );
      expectError(await joinMatch(ctx, ref, opponent), "Paused");
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs()
        )
      );
      expectOk(
        await updateArena(ctx, admin, 1, defaultArenaArgs({ paused: true }))
      );
      expectError(await joinMatch(ctx, ref, opponent), "Paused");
    });
    it("MatchNotOpen for a second joiner", async () => {
      const { ctx, opponent, open } = await ready();
      const ref = await open();
      expectOk(await joinMatch(ctx, ref, opponent));
      expectError(
        await joinMatch(ctx, ref, await newWallet(ctx)),
        "MatchNotOpen"
      );
    });
    it("JoinDeadlinePassed at exactly join_deadline (I4 boundary)", async () => {
      const { ctx, opponent, open } = await ready();
      const deadline = (await ctx.sender.now()) + 120n;
      const ref = await open({ joinDeadline: deadline });
      ctx.sender.warpTo(deadline);
      expectError(await joinMatch(ctx, ref, opponent), "JoinDeadlinePassed");
    });
    it("joins at join_deadline - 1", async () => {
      const { ctx, opponent, open } = await ready();
      const deadline = (await ctx.sender.now()) + 120n;
      const ref = await open({ joinDeadline: deadline });
      ctx.sender.warpTo(deadline - 1n);
      expectOk(await joinMatch(ctx, ref, opponent));
    });
    it("the creator cannot join their own match (Anchor rejects the duplicate stats account first)", async () => {
      // creator_stats and opponent_stats are the same PDA, so Anchor's duplicate-mutable
      // check fires before the handler's CannotJoinOwnMatch (kept as defense in depth).
      const { ctx, creator, open } = await ready();
      expectError(
        await joinMatch(ctx, await open(), creator),
        "ConstraintDuplicateMutableAccount"
      );
    });
    it("OpponentNotAllowed for an uninvited wallet", async () => {
      const { ctx, opponent, open } = await ready();
      const ref = await open({ allowedOpponent: Keypair.generate().publicKey });
      expectError(await joinMatch(ctx, ref, opponent), "OpponentNotAllowed");
    });
    it("the first failing check wins", async () => {
      const r = await ready();
      const deadline = (await r.ctx.sender.now()) + 120n;
      // An uninvited wallet that is also at its freeroll cap.
      for (let i = 0; i < 3; i++) expectOk((await playFreeroll(r)).res);
      const ref = await r.open({
        joinDeadline: deadline,
        entryLamports: 0n,
        allowedOpponent: Keypair.generate().publicKey,
      });
      expectOk(
        await sponsorMatch(r.ctx, ref, await newWallet(r.ctx), 10_000_000n)
      );
      expectError(
        await joinMatch(r.ctx, ref, r.opponent),
        "OpponentNotAllowed"
      ); // beats FreerollCapReached
      r.ctx.sender.warpTo(deadline);
      expectError(
        await joinMatch(r.ctx, ref, r.opponent),
        "JoinDeadlinePassed"
      ); // beats OpponentNotAllowed
      expectOk(
        await updateProtocol(
          r.ctx,
          r.admin,
          r.treasury,
          r.admin.publicKey,
          defaultProtocolArgs({ paused: true })
        )
      );
      expectError(await joinMatch(r.ctx, ref, r.opponent), "Paused"); // beats everything
      void PublicKey;
    });
  });
});
