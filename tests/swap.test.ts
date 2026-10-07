import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { BN } from "@anchor-lang/core";
import {
  DuelRef,
  Side,
  parseSwapEvents,
  playerVaults,
  poolAccounts,
  swapAccounts,
  swapQuote,
} from "@rug-royale/sdk";
import {
  ActiveDuelParams,
  Ctx,
  LiteSvmSender,
  expectError,
  expectOk,
  fetchPool,
  injectActiveDuel,
  liteCtx,
  newWallet,
  setupProtocol,
  swap,
  tokenBalance,
} from "./fixtures";

// PRD §6.5. Duels are injected as Active (see injectActiveDuel) until create_duel and
// join_duel have bodies.
type Lite = Ctx & { sender: LiteSvmSender };

async function activeDuel(
  opts: Partial<ActiveDuelParams> & { feeBps?: number } = {}
) {
  const ctx = liteCtx();
  const { mints, configArgs } = await setupProtocol(
    ctx,
    opts.feeBps === undefined ? {} : { swapFeeBps: opts.feeBps }
  );
  const creator = await newWallet(ctx);
  const opponent = await newWallet(ctx);
  const d = await injectActiveDuel(ctx, { creator, opponent, mints, ...opts });
  ctx.sender.warpTo(d.startTs);
  return {
    ctx,
    mints,
    creator,
    opponent,
    feeBps: configArgs.swapFeeBps as number,
    ...d,
  };
}

const balances = async (ctx: Ctx, ref: DuelRef, player: PublicKey) => {
  const v = playerVaults(ref, player);
  return {
    quote: await tokenBalance(ctx, v.quote),
    coin: await tokenBalance(ctx, v.coin),
  };
};

const reserves = async (ctx: Ctx, ref: DuelRef) => {
  const p = await fetchPool(ctx, poolAccounts(ref).pool);
  return { quoteReserve: p.quoteReserve, tokenReserve: p.tokenReserve };
};

/** Swap with a caller-supplied account map, for seed-mismatch tests. */
async function swapWith(
  ctx: Lite,
  accounts: ReturnType<typeof swapAccounts>,
  signer: Keypair,
  amountIn: bigint
) {
  const ix = await ctx.program.methods
    .swap({ buy: {} }, new BN(amountIn.toString()), new BN(0))
    .accountsStrict(accounts)
    .instruction();
  return ctx.sender.send([ix], signer);
}

describe("swap", () => {
  describe("happy path", () => {
    it("buy moves quote into the pool and pays the math.ts quote in coin", async () => {
      const { ctx, ref, creator, feeBps, bankroll } = await activeDuel();
      const before = await reserves(ctx, ref);
      const amount = 100_000_000n;
      const want = swapQuote("buy", amount, before, feeBps);

      const res = await swap(ctx, ref, creator, "buy", amount, want.out);
      expectOk(res);

      expect(await balances(ctx, ref, creator.publicKey)).to.deep.equal({
        quote: bankroll - amount,
        coin: want.out,
      });
      expect(await reserves(ctx, ref)).to.deep.equal({
        quoteReserve: want.quoteReserve,
        tokenReserve: want.tokenReserve,
      });
      const [ev] = parseSwapEvents(res.logs, ctx.programId);
      expect(ev.side).to.equal("buy");
      expect(ev.player.toBase58()).to.equal(creator.publicKey.toBase58());
      expect(ev.duel.toBase58()).to.equal(ref.duel.toBase58());
      expect([ev.amountIn, ev.amountOut]).to.deep.equal([amount, want.out]);
      expect([ev.quoteReserve, ev.tokenReserve]).to.deep.equal([
        want.quoteReserve,
        want.tokenReserve,
      ]);
    });

    it("sell returns coin to the pool and pays quote", async () => {
      const { ctx, ref, opponent, feeBps, bankroll } = await activeDuel();
      expectOk(await swap(ctx, ref, opponent, "buy", 200_000_000n));
      const { coin } = await balances(ctx, ref, opponent.publicKey);
      const before = await reserves(ctx, ref);
      const want = swapQuote("sell", coin, before, feeBps);

      expectOk(await swap(ctx, ref, opponent, "sell", coin));

      expect(await balances(ctx, ref, opponent.publicKey)).to.deep.equal({
        quote: bankroll - 200_000_000n + want.out,
        coin: 0n,
      });
      expect(await reserves(ctx, ref)).to.deep.equal({
        quoteReserve: want.quoteReserve,
        tokenReserve: want.tokenReserve,
      });
    });

    it("reproduces the PRD §7 example with fees off (9.091 then 7.576 coin)", async () => {
      const ONE = 1_000_000n;
      const { ctx, ref, creator, opponent } = await activeDuel({
        feeBps: 0,
        bankroll: 100n * ONE,
        poolSeed: 100n * ONE,
      });
      expectOk(await swap(ctx, ref, creator, "buy", 10n * ONE));
      expectOk(await swap(ctx, ref, opponent, "buy", 10n * ONE));
      expect((await balances(ctx, ref, creator.publicKey)).coin).to.equal(
        9_090_909n
      );
      expect((await balances(ctx, ref, opponent.publicKey)).coin).to.equal(
        7_575_757n
      );
    });
  });

  describe("errors, in PRD order", () => {
    it("DuelNotActive when the duel is not Active", async () => {
      const { ctx, ref, creator } = await activeDuel({ status: "settled" });
      expectError(
        await swap(ctx, ref, creator, "buy", 1_000_000n),
        "DuelNotActive"
      );
    });

    it("WindowNotStarted before start_ts", async () => {
      const { ctx, ref, creator, startTs } = await activeDuel();
      ctx.sender.warpTo(startTs - 1n);
      expectError(
        await swap(ctx, ref, creator, "buy", 1_000_000n),
        "WindowNotStarted"
      );
    });

    it("WindowEnded at end_ts", async () => {
      const { ctx, ref, creator, endTs } = await activeDuel();
      ctx.sender.warpTo(endTs);
      expectError(
        await swap(ctx, ref, creator, "buy", 1_000_000n),
        "WindowEnded"
      );
    });

    it("NotAParticipant for a third wallet with its own vaults", async () => {
      const { ctx, ref, mints } = await activeDuel();
      const stranger = await newWallet(ctx);
      const v = playerVaults(ref, stranger.publicKey);
      const ixs = [
        [v.quote, mints.quote],
        [v.coin, ref.coinMint],
      ].map(([ata, mint]) =>
        createAssociatedTokenAccountIdempotentInstruction(
          stranger.publicKey,
          ata,
          v.authority,
          mint,
          TOKEN_2022_PROGRAM_ID
        )
      );
      expectOk(await ctx.sender.send(ixs, stranger));
      expectError(
        await swap(ctx, ref, stranger, "buy", 1_000_000n),
        "NotAParticipant"
      );
    });

    it("ZeroAmount for amount_in = 0", async () => {
      const { ctx, ref, creator } = await activeDuel();
      expectError(await swap(ctx, ref, creator, "buy", 0n), "ZeroAmount");
    });

    it("InsufficientBankroll when amount_in exceeds the source vault", async () => {
      const { ctx, ref, creator, bankroll } = await activeDuel();
      expectError(
        await swap(ctx, ref, creator, "buy", bankroll + 1n),
        "InsufficientBankroll"
      );
      // Sell side checks the coin vault, which starts empty.
      expectError(
        await swap(ctx, ref, creator, "sell", 1n),
        "InsufficientBankroll"
      );
    });

    it("ZeroOutput when the fee rounds the input to nothing", async () => {
      const { ctx, ref, creator } = await activeDuel(); // 30 bps: 1 * 9970 / 10000 = 0
      expectError(await swap(ctx, ref, creator, "buy", 1n), "ZeroOutput");
    });

    it("SlippageExceeded when out < min_out", async () => {
      const { ctx, ref, creator, feeBps } = await activeDuel();
      const want = swapQuote(
        "buy",
        1_000_000n,
        await reserves(ctx, ref),
        feeBps
      );
      expectError(
        await swap(ctx, ref, creator, "buy", 1_000_000n, want.out + 1n),
        "SlippageExceeded"
      );
    });

    it("the first failing check wins", async () => {
      const { ctx, ref, mints, startTs } = await activeDuel();
      const stranger = await newWallet(ctx);
      // Not started, not a participant, zero amount: the window check comes first.
      ctx.sender.warpTo(startTs - 1n);
      const v = playerVaults(ref, stranger.publicKey);
      expectOk(
        await ctx.sender.send(
          [
            [v.quote, mints.quote],
            [v.coin, ref.coinMint],
          ].map(([ata, mint]) =>
            createAssociatedTokenAccountIdempotentInstruction(
              stranger.publicKey,
              ata,
              v.authority,
              mint,
              TOKEN_2022_PROGRAM_ID
            )
          ),
          stranger
        )
      );
      expectError(
        await swap(ctx, ref, stranger, "buy", 0n),
        "WindowNotStarted"
      );
      ctx.sender.warpTo(startTs);
      expectError(await swap(ctx, ref, stranger, "buy", 0n), "NotAParticipant");
    });
  });

  describe("account binding", () => {
    it("WrongPool: another duel's pool fails on seeds", async () => {
      const a = await activeDuel();
      const other = await injectActiveDuel(a.ctx, {
        creator: await newWallet(a.ctx),
        opponent: await newWallet(a.ctx),
        mints: a.mints,
        startTs: a.startTs,
      });
      const op = poolAccounts(other.ref);
      const accounts = {
        ...swapAccounts(a.ref, a.creator.publicKey),
        pool: op.pool,
        poolQuoteVault: op.quote,
        poolCoinVault: op.coin,
      };
      expectError(
        await swapWith(a.ctx, accounts, a.creator, 1_000_000n),
        "ConstraintSeeds"
      );
    });

    it("I10: a player cannot move the other player's vaults", async () => {
      const { ctx, ref, creator, opponent } = await activeDuel();
      const accounts = {
        ...swapAccounts(ref, opponent.publicKey),
        player: creator.publicKey,
      };
      expectError(
        await swapWith(ctx, accounts, creator, 1_000_000n),
        "ConstraintSeeds"
      );
    });
  });

  describe("invariants", () => {
    it("I9: the window is [start_ts, end_ts)", async () => {
      const { ctx, ref, creator, startTs, endTs } = await activeDuel();
      ctx.sender.warpTo(startTs - 1n);
      expectError(
        await swap(ctx, ref, creator, "buy", 1_000_000n),
        "WindowNotStarted"
      );
      ctx.sender.warpTo(startTs);
      expectOk(await swap(ctx, ref, creator, "buy", 1_000_000n));
      ctx.sender.warpTo(endTs - 1n);
      expectOk(await swap(ctx, ref, creator, "buy", 1_000_000n));
      ctx.sender.warpTo(endTs);
      expectError(
        await swap(ctx, ref, creator, "buy", 1_000_000n),
        "WindowEnded"
      );
    });

    it("I3, I4, I5, I12 over 200 random swaps", async () => {
      const { ctx, ref, creator, opponent, feeBps } = await activeDuel();
      const players = [creator, opponent];
      const pa = poolAccounts(ref);
      const accounts = [
        ...players.flatMap((p) => {
          const v = playerVaults(ref, p.publicKey);
          return [v.quote, v.coin];
        }),
        pa.quote,
        pa.coin,
      ];
      // [creator quote, creator coin, opponent quote, opponent coin, pool quote, pool coin]
      const snapshot = async () =>
        Promise.all(accounts.map((a) => tokenBalance(ctx, a)));
      const totals = (b: bigint[]) => ({
        quote: b[0] + b[2] + b[4],
        coin: b[1] + b[3] + b[5],
      });
      const start = totals(await snapshot());

      // Deterministic xorshift so a failure is reproducible.
      let seed = 0x2f6b_1d3an;
      const rand = (n: bigint) => {
        seed ^= (seed << 13n) & 0xffff_ffffn;
        seed ^= seed >> 17n;
        seed ^= (seed << 5n) & 0xffff_ffffn;
        return seed % n;
      };

      let ok = 0;
      for (let step = 0; step < 200; step++) {
        const i = Number(rand(2n));
        const player = players[i];
        const bal = await balances(ctx, ref, player.publicKey);
        const side: Side = bal.coin === 0n || rand(2n) === 0n ? "buy" : "sell";
        const source = side === "buy" ? bal.quote : bal.coin;
        if (source === 0n) continue;
        // Mostly real trades, sometimes dust that rounds to zero out.
        const amount =
          rand(10n) === 0n ? 1n + rand(3n) : 1n + rand(source / 4n + 1n);
        const r0 = await reserves(ctx, ref);
        const want = swapQuote(side, amount, r0, feeBps);

        const res = await swap(ctx, ref, player, side, amount);
        if (want.out === 0n) {
          expectError(res, "ZeroOutput");
          continue;
        }
        expectOk(res);
        ok++;

        // I12: on-chain amount_out equals the client quote.
        const [ev] = parseSwapEvents(res.logs, ctx.programId);
        expect(ev.amountOut, `step ${step}`).to.equal(want.out);

        const r1 = await reserves(ctx, ref);
        const b = await snapshot();
        // I3: Pool reserves equal the pool token balances.
        expect(
          [r1.quoteReserve, r1.tokenReserve],
          `step ${step}`
        ).to.deep.equal([b[4], b[5]]);
        // I4: k never decreases.
        expect(
          r1.quoteReserve * r1.tokenReserve >=
            r0.quoteReserve * r0.tokenReserve,
          `step ${step}: k decreased`
        ).to.equal(true);
        // I5: tokens are conserved across vaults + pool.
        expect(totals(b), `step ${step}`).to.deep.equal(start);
      }
      expect(ok).to.be.greaterThan(100);
    });
  });
});
