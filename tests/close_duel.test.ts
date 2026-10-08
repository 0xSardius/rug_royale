import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import {
  DuelRef,
  closeDuelAccounts,
  findEscrow,
  parseEvents,
  playerVaults,
  poolAccounts,
} from "@rug-royale/sdk";
import {
  Ctx,
  closeDuel,
  createDuel,
  expectError,
  expectOk,
  fetchDuel,
  joinDuel,
  liteCtx,
  newWallet,
  patchDuel,
  settle,
  setupProtocol,
  swap,
  tokenBalance,
} from "./fixtures";

// PRD §6.8 effects: burn every balance, close every token account with rent to its payer,
// close escrow + pool to the creator, keep Duel with closed = true (I13). Settled duels go
// through the real settle; Cancelled ones are patched until cancel_duel has a body.
const SOL = 1_000_000_000n;
const TX_FEE = 5_000n;
const U = 1_000_000n;

async function settledDuel() {
  const ctx = liteCtx();
  const { mints, treasury } = await setupProtocol(ctx);
  const creator = await newWallet(ctx);
  const opponent = await newWallet(ctx);
  const caller = await newWallet(ctx);
  const created = await createDuel(ctx, {
    creator,
    mints,
    entryLamports: SOL / 10n,
  });
  expectOk(created.res);
  const joined = await joinDuel(ctx, created.ref, opponent);
  expectOk(joined.res);
  const ref = joined.ref;
  const d = await fetchDuel(ctx, ref.duel);
  ctx.sender.warpTo(d.startTs);
  expectOk(await swap(ctx, ref, creator, "buy", 40n * U));
  expectOk(await swap(ctx, ref, opponent, "buy", 70n * U));
  ctx.sender.warpTo(d.endTs);
  expectOk(await settle(ctx, ref, caller, treasury));
  return { ctx, ref, mints, creator, opponent, caller };
}

const duelAccounts = (ctx: Ctx, ref: DuelRef) => {
  const c = playerVaults(ref, ref.creator);
  const p = poolAccounts(ref);
  const creatorPaid = [
    findEscrow(ctx.programId, ref.duel)[0],
    p.pool,
    c.quote,
    c.coin,
    p.quote,
    p.coin,
  ];
  const o = ref.opponent ? playerVaults(ref, ref.opponent) : null;
  const opponentPaid = o ? [o.quote, o.coin] : [];
  return { creatorPaid, opponentPaid };
};

const sumLamports = async (ctx: Ctx, keys: PublicKey[]) => {
  let total = 0n;
  for (const k of keys) total += await ctx.sender.lamports(k);
  return total;
};

const supply = async (ctx: Ctx, mint: PublicKey) => {
  const data = (await ctx.sender.accountData(mint))!;
  return unpackMint(
    mint,
    { data, owner: TOKEN_2022_PROGRAM_ID, lamports: 0, executable: false },
    TOKEN_2022_PROGRAM_ID
  ).supply;
};

describe("close_duel", () => {
  it("I13: after settle, closes everything but Duel; rent to payers; balances burned", async () => {
    const { ctx, ref, mints, creator, opponent, caller } = await settledDuel();
    const { creatorPaid, opponentPaid } = duelAccounts(ctx, ref);
    const tokenAccounts = [...creatorPaid.slice(2), ...opponentPaid];
    const rentToCreator = await sumLamports(ctx, creatorPaid);
    const rentToOpponent = await sumLamports(ctx, opponentPaid);
    let burnQuote = 0n;
    let burnCoin = 0n;
    for (const [i, ata] of tokenAccounts.entries()) {
      const bal = await tokenBalance(ctx, ata);
      // creatorPaid.slice(2) = [c.quote, c.coin, p.quote, p.coin]; then [o.quote, o.coin]
      if (i % 2 === 0) burnQuote += bal;
      else burnCoin += bal;
    }
    expect(burnQuote > 0n && burnCoin > 0n).to.equal(true);
    const supplyBefore = [
      await supply(ctx, mints.quote),
      await supply(ctx, ref.coinMint),
    ];
    const before = {
      creator: await ctx.sender.lamports(creator.publicKey),
      opponent: await ctx.sender.lamports(opponent.publicKey),
      caller: await ctx.sender.lamports(caller.publicKey),
    };

    const res = await closeDuel(ctx, ref, caller);
    expectOk(res);
    console.log(`      close_duel CU: ${res.cu}`);

    for (const pk of [...creatorPaid, ...opponentPaid])
      expect(await ctx.sender.accountData(pk), pk.toBase58()).to.equal(null);
    const d = await fetchDuel(ctx, ref.duel);
    expect(d.closed).to.equal(true);

    expect(await ctx.sender.lamports(creator.publicKey)).to.equal(
      before.creator + rentToCreator
    );
    expect(await ctx.sender.lamports(opponent.publicKey)).to.equal(
      before.opponent + rentToOpponent
    );
    expect(await ctx.sender.lamports(caller.publicKey)).to.equal(
      before.caller - TX_FEE
    );
    expect([
      await supply(ctx, mints.quote),
      await supply(ctx, ref.coinMint),
    ]).to.deep.equal([supplyBefore[0] - burnQuote, supplyBefore[1] - burnCoin]);

    const ev = parseEvents(res.logs, ctx.programId).find(
      (e) => e.name === "duelClosed"
    )!;
    expect(ev.data.duel.toBase58()).to.equal(ref.duel.toBase58());
  });

  it("a second close fails (escrow and pool no longer exist)", async () => {
    const { ctx, ref, caller } = await settledDuel();
    expectOk(await closeDuel(ctx, ref, caller));
    expectError(await closeDuel(ctx, ref, caller), "AccountNotInitialized");
  });

  it("closes a Cancelled duel with no opponent: four token accounts, all rent to the creator", async () => {
    const ctx = liteCtx();
    const { mints } = await setupProtocol(ctx);
    const creator = await newWallet(ctx);
    const caller = await newWallet(ctx);
    const { res, ref } = await createDuel(ctx, { creator, mints });
    expectOk(res);
    await patchDuel(ctx, ref, { status: { cancelled: {} } });
    const { creatorPaid } = duelAccounts(ctx, ref);
    const rent = await sumLamports(ctx, creatorPaid);
    const before = await ctx.sender.lamports(creator.publicKey);

    expectOk(await closeDuel(ctx, ref, caller));

    for (const pk of creatorPaid)
      expect(await ctx.sender.accountData(pk)).to.equal(null);
    expect(await ctx.sender.lamports(creator.publicKey)).to.equal(
      before + rent
    );
    expect((await fetchDuel(ctx, ref.duel)).closed).to.equal(true);
  });

  it("requires all opponent accounts once someone joined (review finding 3)", async () => {
    const { ctx, ref, caller } = await settledDuel();
    const full = closeDuelAccounts(ref, caller.publicKey);
    // The vault authority is referenced by the vaults' `token::authority`, so Anchor
    // rejects its absence first; the other three hit the handler's check.
    for (const [omit, error] of [
      ["opponent", "AccountNotEnoughKeys"],
      ["opponentVaultAuthority", "ConstraintAccountIsNone"],
      ["opponentQuoteVault", "AccountNotEnoughKeys"],
      ["opponentCoinVault", "AccountNotEnoughKeys"],
    ] as const) {
      const ix = await ctx.program.methods
        .closeDuel()
        .accountsStrict({ ...full, [omit]: null })
        .instruction();
      expectError(await ctx.sender.send([ix], caller), error);
    }
    expectOk(await closeDuel(ctx, ref, caller));
  });

  it("dust sent to escrow no longer blocks close; it goes to the creator (review finding 2)", async () => {
    const { ctx, ref, creator, caller } = await settledDuel();
    const [escrow] = findEscrow(ctx.programId, ref.duel);
    await ctx.sender.fund(escrow, 1n);
    const { creatorPaid } = duelAccounts(ctx, ref);
    const rent = await sumLamports(ctx, creatorPaid); // includes the dust
    const before = await ctx.sender.lamports(creator.publicKey);
    expectOk(await closeDuel(ctx, ref, caller));
    expect(await ctx.sender.lamports(creator.publicKey)).to.equal(
      before + rent
    );
  });
});
