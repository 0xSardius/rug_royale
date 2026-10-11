// Devnet suite (Turbin3: "a complete set of tests passing on devnet").
//
//   pnpm test:devnet
//
// Runs real duels against the deployed program in real time. Four duels share the waits:
// A has entries and trades (a winner), B has entries and no trades (a tie), C is never
// joined and gets cancelled after its 70 s join deadline, and D is a freeroll (no entry,
// funded by a sponsor). Typed-error checks run while the windows are waiting to open or
// close. Fresh wallets are funded from KEYPAIR and swept back at the end.
import { expect } from "chai";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  COINS,
  DuelResult,
  DuelStatus,
  bnToBigInt,
  findConfig,
  findEscrow,
  finalValue,
  parseEvents,
  playerVaults,
  poolAccounts,
  type DuelRef,
} from "@rug-royale/sdk";
import { connection, loadKeypair, RPC_URL } from "../../scripts/lib/env";
import {
  cancelDuel,
  closeDuel,
  createDuel,
  expectError,
  expectOk,
  fetchConfig,
  fetchDuel,
  fetchPool,
  joinDuel,
  rpcCtx,
  settle,
  sponsorPrize,
  swap,
  tokenBalance,
  type Mints,
} from "../fixtures";

const ESCROW_SPACE = 9;
const ENTRY = 10_000_000n; // 0.01 SOL
const WINDOW = 30; // shortest configured window keeps the run short
const WALLET_SOL = 0.15;
const SPONSORED = 20_000_000n; // 0.02 SOL prize for freeroll duel D

// Host only: RPC_URL may carry an API key (e.g. Helius ?api-key=), and this title is screenshotted.
describe(`devnet: full duels against ${new URL(RPC_URL).host}`, function () {
  const faucet = loadKeypair();
  const ctx = rpcCtx(connection(), faucet);
  const mints: Mints = {
    quote: new PublicKey(COINS.quote.demoMint!),
    coins: COINS.coins.map((c) => new PublicKey(c.demoMint!)),
  };
  const wallets: Keypair[] = [];
  let treasury: PublicKey;
  let feeBps: number;
  let creatorA: Keypair,
    opponentA: Keypair,
    creatorB: Keypair,
    opponentB: Keypair,
    creatorC: Keypair;
  let creatorD: Keypair, opponentD: Keypair, sponsorD: Keypair;
  let settler: Keypair, outsider: Keypair;
  let duelA: DuelRef, duelB: DuelRef, duelC: DuelRef, duelD: DuelRef;
  let endTs: bigint;

  const wallet = async () => {
    const kp = Keypair.generate();
    wallets.push(kp); // before funding, so after() sweeps it even if funding errors
    await ctx.sender.fund(kp.publicKey, BigInt(WALLET_SOL * LAMPORTS_PER_SOL));
    return kp;
  };

  before(async () => {
    const config = await fetchConfig(ctx, findConfig(ctx.programId)[0]);
    treasury = config.treasury;
    feeBps = config.swapFeeBps;
    expect(config.windows, "Config must include the 30 s window").to.include(
      WINDOW
    );
    [creatorA, opponentA, creatorB, opponentB, creatorC, settler, outsider] = [
      await wallet(),
      await wallet(),
      await wallet(),
      await wallet(),
      await wallet(),
      await wallet(),
      await wallet(),
    ];
    [creatorD, opponentD, sponsorD] = [
      await wallet(),
      await wallet(),
      await wallet(),
    ];
  });

  after(async () => {
    // Sweep each test wallet back to the faucet (balance minus the transfer fee).
    for (const kp of wallets) {
      const bal = await ctx.sender.lamports(kp.publicKey);
      if (bal > 5_000n) {
        await ctx.sender.send(
          [
            SystemProgram.transfer({
              fromPubkey: kp.publicKey,
              toPubkey: faucet.publicKey,
              lamports: bal - 5_000n,
            }),
          ],
          kp
        );
      }
    }
  });

  describe("create_duel", () => {
    it("rejects bad params with typed errors (InvalidTier, InvalidWindow, DeadlineTooSoon, EntryTooHigh, OpponentNotAllowed)", async () => {
      const now = await ctx.sender.now();
      expectError(
        (await createDuel(ctx, { creator: creatorA, mints, tier: 3 })).res,
        "InvalidTier"
      );
      expectError(
        (await createDuel(ctx, { creator: creatorA, mints, windowSecs: 45 }))
          .res,
        "InvalidWindow"
      );
      expectError(
        (
          await createDuel(ctx, {
            creator: creatorA,
            mints,
            joinDeadline: now + 10n,
          })
        ).res,
        "DeadlineTooSoon"
      );
      expectError(
        (
          await createDuel(ctx, {
            creator: creatorA,
            mints,
            entryLamports: 2n * BigInt(LAMPORTS_PER_SOL),
          })
        ).res,
        "EntryTooHigh"
      );
      expectError(
        (
          await createDuel(ctx, {
            creator: creatorA,
            mints,
            allowedOpponent: creatorA.publicKey,
          })
        ).res,
        "OpponentNotAllowed"
      );
    });

    it("opens duels A, B, and C, escrowing each creator's entry", async () => {
      const a = await createDuel(ctx, {
        creator: creatorA,
        mints,
        windowSecs: WINDOW,
        entryLamports: ENTRY,
      });
      const b = await createDuel(ctx, {
        creator: creatorB,
        mints,
        windowSecs: WINDOW,
        entryLamports: ENTRY,
        coin: mints.coins[1],
      });
      const c = await createDuel(ctx, {
        creator: creatorC,
        mints,
        windowSecs: WINDOW,
        entryLamports: ENTRY,
        joinDeadline: (await ctx.sender.now()) + 70n,
      });
      expectOk(a.res);
      expectOk(b.res);
      expectOk(c.res);
      duelA = a.ref;
      duelB = b.ref;
      duelC = c.ref;
      const d = await fetchDuel(ctx, duelA.duel);
      expect(d.status).to.equal(DuelStatus.Open);
      const rent = await ctx.sender.rentExempt(ESCROW_SPACE);
      expect(
        await ctx.sender.lamports(findEscrow(ctx.programId, duelA.duel)[0])
      ).to.equal(rent + ENTRY);
      const pool = await fetchPool(ctx, poolAccounts(duelA).pool);
      expect(await tokenBalance(ctx, poolAccounts(duelA).quote)).to.equal(
        pool.quoteReserve
      );
    });
  });

  describe("sponsor_prize", () => {
    it("rejects a zero amount (ZeroAmount)", async () => {
      expectError(await sponsorPrize(ctx, duelA, sponsorD, 0n), "ZeroAmount");
    });

    it("funds freeroll duel D (entry 0): SOL into escrow, sponsor recorded, PrizeSponsored", async () => {
      const d = await createDuel(ctx, {
        creator: creatorD,
        mints,
        windowSecs: WINDOW,
        entryLamports: 0n,
        coin: mints.coins[2],
      });
      expectOk(d.res);
      duelD = d.ref;
      const escrow = findEscrow(ctx.programId, duelD.duel)[0];
      const rent = await ctx.sender.rentExempt(ESCROW_SPACE);
      expect(await ctx.sender.lamports(escrow)).to.equal(rent);

      const res = await sponsorPrize(ctx, duelD, sponsorD, SPONSORED);
      expectOk(res);
      expect(await ctx.sender.lamports(escrow)).to.equal(rent + SPONSORED); // I1
      const duel = await fetchDuel(ctx, duelD.duel);
      expect(duel.sponsoredLamports).to.equal(SPONSORED);
      expect(duel.sponsor?.toBase58()).to.equal(sponsorD.publicKey.toBase58());
      const ev = parseEvents(res.logs).find(
        (e) => e.name === "prizeSponsored"
      )!;
      expect(bnToBigInt(ev.data.total)).to.equal(SPONSORED);
    });

    it("rejects a second, different sponsor (SponsorMismatch)", async () => {
      expectError(
        await sponsorPrize(ctx, duelD, outsider, 1_000_000n),
        "SponsorMismatch"
      );
    });
  });

  describe("cancel_duel (before the deadline)", () => {
    it("rejects cancelling duel C before its join deadline (DeadlineNotReached)", async () => {
      expectError(await cancelDuel(ctx, duelC, settler), "DeadlineNotReached");
    });
  });

  describe("join_duel", () => {
    it("rejects the creator joining their own duel (CannotJoinOwnDuel)", async () => {
      expectError(
        (await joinDuel(ctx, duelA, creatorA)).res,
        "CannotJoinOwnDuel"
      );
    });

    it("seats both opponents: Active, 60 s start delay, equal bankrolls, both entries escrowed", async () => {
      const a = await joinDuel(ctx, duelA, opponentA);
      const b = await joinDuel(ctx, duelB, opponentB);
      expectOk(a.res);
      expectOk(b.res);
      duelA = a.ref;
      duelB = b.ref;
      const d = await fetchDuel(ctx, duelA.duel);
      expect(d.status).to.equal(DuelStatus.Active);
      expect(d.endTs - d.startTs).to.equal(BigInt(WINDOW));
      const endB = (await fetchDuel(ctx, duelB.duel)).endTs;
      endTs = endB > d.endTs ? endB : d.endTs;
      for (const p of [creatorA, opponentA]) {
        expect(
          await tokenBalance(ctx, playerVaults(duelA, p.publicKey).quote)
        ).to.equal(d.bankroll);
      }
      const rent = await ctx.sender.rentExempt(ESCROW_SPACE);
      expect(
        await ctx.sender.lamports(findEscrow(ctx.programId, duelA.duel)[0])
      ).to.equal(rent + 2n * ENTRY);
    });

    it("seats freeroll duel D's opponent (no entry); escrow still holds only the prize", async () => {
      const j = await joinDuel(ctx, duelD, opponentD);
      expectOk(j.res);
      duelD = j.ref;
      const d = await fetchDuel(ctx, duelD.duel);
      expect(d.status).to.equal(DuelStatus.Active);
      if (d.endTs > endTs) endTs = d.endTs;
      expect(
        await ctx.sender.lamports(findEscrow(ctx.programId, duelD.duel)[0])
      ).to.equal((await ctx.sender.rentExempt(ESCROW_SPACE)) + SPONSORED);
    });

    it("rejects sponsoring an Active duel (DuelNotOpen)", async () => {
      expectError(
        await sponsorPrize(ctx, duelD, sponsorD, 1_000_000n),
        "DuelNotOpen"
      );
    });

    it("rejects a third wallet once the duel is Active (DuelNotOpen)", async () => {
      expectError((await joinDuel(ctx, duelA, outsider)).res, "DuelNotOpen");
    });
  });

  describe("swap", () => {
    it("rejects a trade before the window opens (WindowNotStarted)", async () => {
      expectError(
        await swap(ctx, duelA, creatorA, "buy", 1_000_000n),
        "WindowNotStarted"
      );
    });

    it("rejects a non-participant (NotAParticipant)", async () => {
      const d = await fetchDuel(ctx, duelA.duel);
      await ctx.sender.waitUntil(d.startTs);
      // Give the outsider vault ATAs so the handler (not account validation) rejects it.
      const authority = playerVaults(duelA, outsider.publicKey).authority;
      expectOk(
        await ctx.sender.send(
          [duelA.quoteMint, duelA.coinMint].map((mint) =>
            createAssociatedTokenAccountIdempotentInstruction(
              outsider.publicKey,
              getAssociatedTokenAddressSync(
                mint,
                authority,
                true,
                TOKEN_2022_PROGRAM_ID
              ),
              authority,
              mint,
              TOKEN_2022_PROGRAM_ID
            )
          ),
          outsider
        )
      );
      expectError(
        await swap(ctx, duelA, outsider, "buy", 1_000_000n),
        "NotAParticipant"
      );
    });

    it("rejects a quote it can't meet (SlippageExceeded)", async () => {
      expectError(
        await swap(ctx, duelA, creatorA, "buy", 1_000_000n, 10n ** 15n),
        "SlippageExceeded"
      );
    });

    it("duel D: the opponent trades alone while the creator holds", async () => {
      const d = await fetchDuel(ctx, duelD.duel);
      await ctx.sender.waitUntil(d.startTs);
      expectOk(await swap(ctx, duelD, opponentD, "buy", d.bankroll / 10n));
    });

    it("both players trade duel A in the shared pool; reserves track the pool balances (I3)", async () => {
      const d = await fetchDuel(ctx, duelA.duel);
      const buy = d.bankroll / 5n;
      const r1 = await swap(ctx, duelA, creatorA, "buy", buy);
      expectOk(r1);
      expectOk(await swap(ctx, duelA, opponentA, "buy", buy / 2n));
      const coin = await tokenBalance(
        ctx,
        playerVaults(duelA, creatorA.publicKey).coin
      );
      expectOk(await swap(ctx, duelA, creatorA, "sell", coin / 2n));
      const pool = await fetchPool(ctx, poolAccounts(duelA).pool);
      expect(await tokenBalance(ctx, poolAccounts(duelA).quote)).to.equal(
        pool.quoteReserve
      );
      expect(await tokenBalance(ctx, poolAccounts(duelA).coin)).to.equal(
        pool.tokenReserve
      );
      expect(
        parseEvents(r1.logs).some((e) => e.name === "swapExecuted")
      ).to.equal(true);
    });
  });

  describe("settle", () => {
    it("rejects settling before the window ends (WindowNotEnded)", async () => {
      expectError(
        await settle(ctx, duelA, settler, treasury),
        "WindowNotEnded"
      );
    });

    it("duel A: winner paid pot - rake - tip; result matches client-side valuation; escrow back to rent", async () => {
      await ctx.sender.waitUntil(endTs);
      const d0 = await fetchDuel(ctx, duelA.duel);
      const pool = await fetchPool(ctx, poolAccounts(duelA).pool);
      const value = async (p: Keypair) => {
        const v = playerVaults(duelA, p.publicKey);
        return finalValue(
          await tokenBalance(ctx, v.quote),
          await tokenBalance(ctx, v.coin),
          pool,
          feeBps
        );
      };
      const [expectA, expectB] = [
        await value(creatorA),
        await value(opponentA),
      ];
      const before = {
        creator: await ctx.sender.lamports(creatorA.publicKey),
        opponent: await ctx.sender.lamports(opponentA.publicKey),
      };

      const res = await settle(ctx, duelA, settler, treasury);
      expectOk(res);
      const d = await fetchDuel(ctx, duelA.duel);
      expect(d.status).to.equal(DuelStatus.Settled);
      expect([d.finalA, d.finalB]).to.deep.equal([expectA, expectB]); // I12 on devnet
      expect(d.result).to.equal(
        expectA > expectB
          ? DuelResult.Creator
          : expectA < expectB
          ? DuelResult.Opponent
          : DuelResult.Tie
      );

      const ev = parseEvents(res.logs).find((e) => e.name === "duelSettled")!;
      const prize = bnToBigInt(ev.data.prize);
      const winnerIsCreator = d.result === DuelResult.Creator;
      const gainCreator =
        (await ctx.sender.lamports(creatorA.publicKey)) - before.creator;
      const gainOpponent =
        (await ctx.sender.lamports(opponentA.publicKey)) - before.opponent;
      expect(winnerIsCreator ? gainCreator : gainOpponent).to.equal(prize);
      expect(winnerIsCreator ? gainOpponent : gainCreator).to.equal(0n);
      expect(prize > 0n && prize < 2n * ENTRY).to.equal(true);
      expect(
        await ctx.sender.lamports(findEscrow(ctx.programId, duelA.duel)[0])
      ).to.equal(await ctx.sender.rentExempt(ESCROW_SPACE)); // I2
      expect(d0.status).to.equal(DuelStatus.Active);
    });

    it("duel B (nobody traded): a true tie, both entries returned, no rake", async () => {
      const before = {
        creator: await ctx.sender.lamports(creatorB.publicKey),
        opponent: await ctx.sender.lamports(opponentB.publicKey),
      };
      expectOk(await settle(ctx, duelB, settler, treasury));
      const d = await fetchDuel(ctx, duelB.duel);
      expect(d.result).to.equal(DuelResult.Tie);
      expect(d.finalA).to.equal(d.finalB);
      expect(
        (await ctx.sender.lamports(creatorB.publicKey)) - before.creator
      ).to.equal(ENTRY);
      expect(
        (await ctx.sender.lamports(opponentB.publicKey)) - before.opponent
      ).to.equal(ENTRY);
    });

    it("duel D (freeroll): the holder beats the lone trader and gets sponsored - tip; no rake", async () => {
      const config = await fetchConfig(ctx, findConfig(ctx.programId)[0]);
      const tip = config.settlerTipLamports;
      const before = {
        creator: await ctx.sender.lamports(creatorD.publicKey),
        opponent: await ctx.sender.lamports(opponentD.publicKey),
        treasury: await ctx.sender.lamports(treasury),
      };
      const res = await settle(ctx, duelD, settler, treasury);
      expectOk(res);
      const d = await fetchDuel(ctx, duelD.duel);
      expect(d.result).to.equal(DuelResult.Creator);
      const ev = parseEvents(res.logs).find((e) => e.name === "duelSettled")!;
      expect(bnToBigInt(ev.data.rake)).to.equal(0n);
      expect(bnToBigInt(ev.data.prize)).to.equal(SPONSORED - tip);
      expect(
        (await ctx.sender.lamports(creatorD.publicKey)) - before.creator
      ).to.equal(SPONSORED - tip);
      expect(
        (await ctx.sender.lamports(opponentD.publicKey)) - before.opponent
      ).to.equal(0n);
      expect((await ctx.sender.lamports(treasury)) - before.treasury).to.equal(
        0n
      );
      expect(
        await ctx.sender.lamports(findEscrow(ctx.programId, duelD.duel)[0])
      ).to.equal(await ctx.sender.rentExempt(ESCROW_SPACE)); // I2
    });

    it("rejects a second settle (DuelNotActive)", async () => {
      expectError(await settle(ctx, duelA, settler, treasury), "DuelNotActive");
    });
  });

  describe("cancel_duel", () => {
    it("cancels unjoined duel C after its deadline: entry back to the creator, not the caller", async () => {
      await ctx.sender.waitUntil(
        (
          await fetchDuel(ctx, duelC.duel)
        ).joinDeadline
      );
      const before = await ctx.sender.lamports(creatorC.publicKey);
      expectOk(await cancelDuel(ctx, duelC, settler));
      expect((await fetchDuel(ctx, duelC.duel)).status).to.equal(
        DuelStatus.Cancelled
      );
      expect((await ctx.sender.lamports(creatorC.publicKey)) - before).to.equal(
        ENTRY
      );
      expect(
        await ctx.sender.lamports(findEscrow(ctx.programId, duelC.duel)[0])
      ).to.equal(await ctx.sender.rentExempt(ESCROW_SPACE));
    });

    it("rejects cancelling a duel that isn't Open (DuelNotOpen)", async () => {
      expectError(await cancelDuel(ctx, duelA, settler), "DuelNotOpen");
    });
  });

  describe("close_duel", () => {
    it("closes duel A: token accounts, escrow, and pool gone; Duel kept with closed = true (I13)", async () => {
      expectOk(await closeDuel(ctx, duelA, settler));
      const p = poolAccounts(duelA);
      const gone = [
        findEscrow(ctx.programId, duelA.duel)[0],
        p.pool,
        p.quote,
        p.coin,
        ...[creatorA, opponentA].flatMap((w) => {
          const v = playerVaults(duelA, w.publicKey);
          return [v.quote, v.coin];
        }),
      ];
      for (const pk of gone)
        expect(await ctx.sender.accountData(pk), pk.toBase58()).to.equal(null);
      const d = await fetchDuel(ctx, duelA.duel);
      expect(d.closed).to.equal(true);
      expect(d.status).to.equal(DuelStatus.Settled);
    });

    it("closes duel B too", async () => {
      expectOk(await closeDuel(ctx, duelB, settler));
      expect((await fetchDuel(ctx, duelB.duel)).closed).to.equal(true);
    });

    it("closes freeroll duel D", async () => {
      expectOk(await closeDuel(ctx, duelD, settler));
      expect((await fetchDuel(ctx, duelD.duel)).closed).to.equal(true);
    });

    it("closes cancelled duel C (no opponent accounts)", async () => {
      expectOk(await closeDuel(ctx, duelC, settler));
      expect((await fetchDuel(ctx, duelC.duel)).closed).to.equal(true);
      expect(
        await ctx.sender.accountData(findEscrow(ctx.programId, duelC.duel)[0])
      ).to.equal(null);
    });
  });
});
