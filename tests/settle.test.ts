import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import {
  DuelRef,
  DuelResult,
  DuelStatus,
  bnToBigInt,
  finalValue,
  findEscrow,
  parseEvents,
  payout,
  playerVaults,
  poolAccounts,
  settleAccounts,
} from "@rug-royale/sdk";
import {
  ConfigArgs,
  LiteSvmSender,
  Ctx,
  createDuel,
  expectError,
  expectOk,
  fetchDuel,
  fetchPool,
  joinDuel,
  liteCtx,
  newWallet,
  settle,
  setupProtocol,
  sponsorPrize,
  swap,
  tokenBalance,
} from "./fixtures";

// PRD §6.6 with real create_duel, sponsor_prize and join_duel.
type Lite = Ctx & { sender: LiteSvmSender };
const SOL = 1_000_000_000n;
const TX_FEE = 5_000n; // LiteSVM default, one signature
const U = 1_000_000n; // 6 decimals

async function activeDuel(
  opts: { entry?: bigint; sponsor?: bigint; config?: Partial<ConfigArgs> } = {}
) {
  const ctx = liteCtx();
  const { mints, treasury, configArgs } = await setupProtocol(ctx, opts.config);
  const creator = await newWallet(ctx);
  const opponent = await newWallet(ctx);
  const settler = await newWallet(ctx);
  const created = await createDuel(ctx, {
    creator,
    mints,
    entryLamports: opts.entry ?? 0n,
    windowSecs: 120,
  });
  expectOk(created.res);
  if (opts.sponsor) {
    const sponsor = await newWallet(ctx);
    expectOk(await sponsorPrize(ctx, created.ref, sponsor, opts.sponsor));
  }
  const joined = await joinDuel(ctx, created.ref, opponent);
  expectOk(joined.res);
  const ref = joined.ref;
  const d = await fetchDuel(ctx, ref.duel);
  ctx.sender.warpTo(d.startTs);
  return {
    ctx,
    ref,
    creator,
    opponent,
    settler,
    treasury,
    configArgs,
    startTs: d.startTs,
    endTs: d.endTs,
  };
}

/** What settle should compute, from the live vaults and pool, using the SDK math. */
async function expected(ctx: Lite, ref: DuelRef, configArgs: ConfigArgs) {
  const fee = configArgs.swapFeeBps as number;
  const pool = await fetchPool(ctx, poolAccounts(ref).pool);
  const r = {
    quoteReserve: pool.quoteReserve,
    tokenReserve: pool.tokenReserve,
  };
  const value = async (player: PublicKey) => {
    const v = playerVaults(ref, player);
    return finalValue(
      await tokenBalance(ctx, v.quote),
      await tokenBalance(ctx, v.coin),
      r,
      fee
    );
  };
  const finalA = await value(ref.creator);
  const finalB = await value(ref.opponent!);
  const d = await fetchDuel(ctx, ref.duel);
  const result = finalA > finalB ? 1 : finalA < finalB ? 2 : 3;
  const p = payout({
    entryLamports: d.entryLamports,
    sponsoredLamports: d.sponsoredLamports,
    settlerTipLamports: BigInt(configArgs.settlerTipLamports.toString()),
    rakeBps: configArgs.rakeBps as number,
    result,
  });
  return { finalA, finalB, result, p };
}

async function lamportsOf(ctx: Ctx, keys: Record<string, PublicKey>) {
  const out: Record<string, bigint> = {};
  for (const [k, pk] of Object.entries(keys))
    out[k] = await ctx.sender.lamports(pk);
  return out;
}

const escrowRent = (ctx: Ctx) => ctx.sender.rentExempt(9);

describe("settle", () => {
  describe("happy path", () => {
    it("scenario 1: pays the winner, rake and tip exactly; escrow keeps only rent (I2)", async () => {
      const entry = SOL / 10n;
      const {
        ctx,
        ref,
        creator,
        opponent,
        settler,
        treasury,
        configArgs,
        endTs,
      } = await activeDuel({ entry });
      // Creator buys, opponent's bigger buy lifts the price, creator sells into it.
      expectOk(await swap(ctx, ref, creator, "buy", 100n * U));
      expectOk(await swap(ctx, ref, opponent, "buy", 300n * U));
      const coin = await tokenBalance(
        ctx,
        playerVaults(ref, creator.publicKey).coin
      );
      expectOk(await swap(ctx, ref, creator, "sell", coin));
      ctx.sender.warpTo(endTs);

      const want = await expected(ctx, ref, configArgs);
      expect(want.result).to.equal(1);
      const [escrow] = findEscrow(ctx.programId, ref.duel);
      const keys = {
        creator: creator.publicKey,
        opponent: opponent.publicKey,
        settler: settler.publicKey,
        treasury,
        escrow,
      };
      const before = await lamportsOf(ctx, keys);

      const res = await settle(ctx, ref, settler, treasury);
      expectOk(res);
      console.log(`      settle CU: ${res.cu}`);

      const after = await lamportsOf(ctx, keys);
      expect(after.creator - before.creator).to.equal(want.p.prize);
      expect(after.opponent - before.opponent).to.equal(0n);
      expect(after.treasury - before.treasury).to.equal(want.p.rake);
      expect(after.settler - before.settler).to.equal(want.p.tip - TX_FEE);
      expect(after.escrow).to.equal(await escrowRent(ctx));
      expect(want.p.prize + want.p.rake + want.p.tip).to.equal(2n * entry);

      const d = await fetchDuel(ctx, ref.duel);
      expect(d.status).to.equal(DuelStatus.Settled);
      expect([d.finalA, d.finalB, d.result]).to.deep.equal([
        want.finalA,
        want.finalB,
        DuelResult.Creator,
      ]);

      const ev = parseEvents(res.logs, ctx.programId).find(
        (e) => e.name === "duelSettled"
      )!;
      expect(ev.data.duel.toBase58()).to.equal(ref.duel.toBase58());
      expect(ev.data.result).to.equal(1);
      for (const [k, v] of [
        ["finalA", want.finalA],
        ["finalB", want.finalB],
        ["prize", want.p.prize],
        ["rake", want.p.rake],
        ["tip", want.p.tip],
      ] as const)
        expect(bnToBigInt(ev.data[k]), k).to.equal(v);
    });

    it("scenario 2: the PRD §7 example on-chain (fees off): 101.80 beats 100.00", async () => {
      const { ctx, ref, creator, opponent, settler, treasury, endTs } =
        await activeDuel({
          config: {
            swapFeeBps: 0,
            poolSeedRatio: new BN(1),
            tiers: [new BN((100n * U).toString()), new BN(1), new BN(1)],
          },
        });
      expectOk(await swap(ctx, ref, creator, "buy", 10n * U));
      expectOk(await swap(ctx, ref, opponent, "buy", 10n * U));
      ctx.sender.warpTo(endTs);
      expectOk(await settle(ctx, ref, settler, treasury));
      const d = await fetchDuel(ctx, ref.duel);
      expect([d.finalA, d.finalB, d.result]).to.deep.equal([
        101_803_278n,
        99_999_999n,
        DuelResult.Creator,
      ]);
    });

    it("scenario 3: tie returns entries, tips from sponsored only, odd lamport to creator", async () => {
      const entry = SOL / 20n;
      const sponsored = 3_000_001n; // tip 1,000,000 leaves an odd 2,000,001
      const {
        ctx,
        ref,
        creator,
        opponent,
        settler,
        treasury,
        configArgs,
        endTs,
      } = await activeDuel({ entry, sponsor: sponsored });
      ctx.sender.warpTo(endTs); // nobody trades
      const [escrow] = findEscrow(ctx.programId, ref.duel);
      const keys = {
        creator: creator.publicKey,
        opponent: opponent.publicKey,
        settler: settler.publicKey,
        treasury,
        escrow,
      };
      const before = await lamportsOf(ctx, keys);

      expectOk(await settle(ctx, ref, settler, treasury));

      const after = await lamportsOf(ctx, keys);
      const tip = BigInt(configArgs.settlerTipLamports.toString());
      const rest = sponsored - tip;
      expect(after.creator - before.creator).to.equal(entry + rest / 2n + 1n);
      expect(after.opponent - before.opponent).to.equal(entry + rest / 2n);
      expect(after.treasury - before.treasury).to.equal(0n);
      expect(after.settler - before.settler).to.equal(tip - TX_FEE);
      expect(after.escrow).to.equal(await escrowRent(ctx));
      expect((await fetchDuel(ctx, ref.duel)).result).to.equal(DuelResult.Tie);
    });

    it("scenario 4: freeroll (entry 0, sponsored 0.5 SOL) pays no rake", async () => {
      const {
        ctx,
        ref,
        creator,
        opponent,
        settler,
        treasury,
        configArgs,
        endTs,
      } = await activeDuel({ sponsor: SOL / 2n });
      // A lone trader loses to a holder (fee + rounding), so the creator wins.
      expectOk(await swap(ctx, ref, opponent, "buy", 50n * U));
      ctx.sender.warpTo(endTs);
      const tip = BigInt(configArgs.settlerTipLamports.toString());
      const before = await lamportsOf(ctx, {
        creator: creator.publicKey,
        treasury,
      });

      expectOk(await settle(ctx, ref, settler, treasury));

      const after = await lamportsOf(ctx, {
        creator: creator.publicKey,
        treasury,
      });
      expect(after.creator - before.creator).to.equal(SOL / 2n - tip);
      expect(after.treasury - before.treasury).to.equal(0n);
      expect((await fetchDuel(ctx, ref.duel)).result).to.equal(
        DuelResult.Creator
      );
    });

    it("scenario 5: unranked (no entry, no sponsor) pays nothing and settles", async () => {
      const { ctx, ref, creator, settler, treasury, endTs } =
        await activeDuel();
      expectOk(await swap(ctx, ref, creator, "buy", 10n * U));
      ctx.sender.warpTo(endTs);
      const before = await ctx.sender.lamports(settler.publicKey);
      expectOk(await settle(ctx, ref, settler, treasury));
      expect(await ctx.sender.lamports(settler.publicKey)).to.equal(
        before - TX_FEE
      );
      const d = await fetchDuel(ctx, ref.duel);
      expect([d.status, d.result]).to.deep.equal([
        DuelStatus.Settled,
        DuelResult.Opponent,
      ]);
    });

    it("the winner can settle (Settle button): prize and tip both land", async () => {
      const entry = SOL / 10n;
      const { ctx, ref, creator, opponent, treasury, configArgs, endTs } =
        await activeDuel({ entry });
      expectOk(await swap(ctx, ref, opponent, "buy", 20n * U));
      ctx.sender.warpTo(endTs);
      const want = await expected(ctx, ref, configArgs);
      expect(want.result).to.equal(1);
      const before = await ctx.sender.lamports(creator.publicKey);
      expectOk(await settle(ctx, ref, creator, treasury));
      expect(await ctx.sender.lamports(creator.publicKey)).to.equal(
        before + want.p.prize + want.p.tip - TX_FEE
      );
    });
  });

  describe("errors, in PRD order", () => {
    it("WindowNotEnded before end_ts; settles at exactly end_ts", async () => {
      const { ctx, ref, settler, treasury, endTs } = await activeDuel();
      ctx.sender.warpTo(endTs - 1n);
      expectError(await settle(ctx, ref, settler, treasury), "WindowNotEnded");
      ctx.sender.warpTo(endTs);
      expectOk(await settle(ctx, ref, settler, treasury));
    });

    it("DuelNotActive on a second settle (and it beats the window check)", async () => {
      const { ctx, ref, settler, treasury, endTs } = await activeDuel({
        entry: SOL / 10n,
      });
      ctx.sender.warpTo(endTs);
      expectOk(await settle(ctx, ref, settler, treasury));
      expectError(await settle(ctx, ref, settler, treasury), "DuelNotActive");
      // Back before end_ts: both checks fail, and the status check comes first.
      ctx.sender.warpTo(endTs - 1n);
      expectError(await settle(ctx, ref, settler, treasury), "DuelNotActive");
    });
  });

  describe("invariants", () => {
    it("I11: treasury, creator and opponent cannot be redirected", async () => {
      const { ctx, ref, settler, treasury, endTs } = await activeDuel({
        entry: SOL / 10n,
      });
      ctx.sender.warpTo(endTs);
      const thief = Keypair.generate().publicKey;
      for (const field of ["treasury", "creator", "opponent"] as const) {
        const accounts = {
          ...settleAccounts(ref, settler.publicKey, treasury),
          [field]: thief,
        };
        const ix = await ctx.program.methods
          .settle()
          .accountsStrict(accounts)
          .instruction();
        expectError(await ctx.sender.send([ix], settler), "ConstraintAddress");
      }
      expectOk(await settle(ctx, ref, settler, treasury));
    });

    it("I7: a settle 30 days late gives the same result and payouts", async () => {
      const run = async (lateBy: bigint) => {
        const { ctx, ref, creator, opponent, settler, treasury, endTs } =
          await activeDuel({ entry: SOL / 10n });
        expectOk(await swap(ctx, ref, creator, "buy", 40n * U));
        expectOk(await swap(ctx, ref, opponent, "buy", 70n * U));
        ctx.sender.warpTo(endTs + lateBy);
        const before = await ctx.sender.lamports(creator.publicKey);
        const res = await settle(ctx, ref, settler, treasury);
        expectOk(res);
        const d = await fetchDuel(ctx, ref.duel);
        return {
          finals: [d.finalA, d.finalB, d.result],
          creatorGain: (await ctx.sender.lamports(creator.publicKey)) - before,
        };
      };
      expect(await run(30n * 86_400n)).to.deep.equal(await run(0n));
    });
  });
});
