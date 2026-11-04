import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import {
  PRICES,
  VALIDATORS,
  activeMatch,
  cancelMatch,
  createArena,
  createMatch,
  defaultArenaArgs,
  expectOk,
  finalizeMatch,
  joinMatch,
  lazer,
  newWallet,
  setAllFeeds,
  setFeed,
  setOwner,
  settle,
  setupAdmin,
  sponsorMatch,
  trade,
  v2Ctx,
} from "./fixtures";

// SDK v2 (build item 8): decoders, layout constants and lobby filters against real accounts.
describe("v2 sdk: decoders, layout, lobby filters", () => {
  it("decodes Pot, Match, Arena, Protocol and PlayerStats to plain types", async () => {
    const ctx = v2Ctx();
    const a = await activeMatch(ctx, {
      entryLamports: 50_000_000n,
      validator: VALIDATORS.eu,
    });
    const read = async (pk: PublicKey) => (await ctx.sender.accountData(pk))!;

    const pot = v2.decodePot(await read(a.ref.pot));
    expect(pot.status).to.equal(v2.PotStatus.Active);
    expect([pot.arenaId, pot.windowSecs, pot.rakeBps]).to.deep.equal([
      1, 300, 500,
    ]);
    expect(pot.entryLamports).to.equal(50_000_000n);
    expect(pot.opponent?.equals(a.opponent.publicKey)).to.equal(true);
    expect(pot.sponsor).to.equal(null);
    expect(pot.allowedOpponent).to.equal(null);
    expect(pot.validator.equals(VALIDATORS.eu)).to.equal(true);
    expect(typeof pot.endTs).to.equal("bigint");

    const m = v2.decodeMatch(await read(a.ref.matchAccount));
    expect(m.status).to.equal(v2.MatchStatus.Active);
    expect(m.result).to.equal(v2.MatchResult.Pending);
    expect(m.seats[0].player?.equals(a.creator.publicKey)).to.equal(true);
    expect(m.seats[1].sessionKey?.equals(a.opponentSession.publicKey)).to.equal(
      true
    );
    expect(m.seats[0].cash).to.equal(10_000_000_000n);
    expect(m.seats[0].qty).to.have.length(10);
    expect([m.startTs, m.endTs]).to.deep.equal([a.startTs, a.endTs]);
    expect([m.tradeFeeBps, m.maxPriceAgeS]).to.deep.equal([10, 5]);

    const arena = v2.decodeArena(await read(v2.findArena(ctx.programId, 1)[0]));
    expect(arena.assets).to.have.length(10);
    expect(arena.assets[5]).to.deep.include({
      lazerId: 9,
      exponent: 10,
      enabled: true,
    }); // BONK
    expect(arena.windows).to.deep.equal([300, 900, 3600]);
    expect(arena.bankroll).to.equal(10_000_000_000n);

    const protocol = v2.decodeProtocol(
      await read(v2.findProtocol(ctx.programId)[0])
    );
    expect(protocol.treasury.equals(a.treasury)).to.equal(true);
    expect(protocol.matchFeeLamports).to.equal(3_010_000n);

    const stats = v2.decodePlayerStats(
      await read(v2.findPlayerStats(ctx.programId, a.creator.publicKey)[0])
    );
    expect([stats.matches, stats.wins, stats.ties]).to.deep.equal([1, 0, 0]);
  });

  it("POT_SIZE / MATCH_SIZE and the lobby offsets match the real account bytes", async () => {
    const ctx = v2Ctx();
    const a = await activeMatch(ctx);
    const pot = (await ctx.sender.accountData(a.ref.pot))!;
    const m = (await ctx.sender.accountData(a.ref.matchAccount))!;
    expect([pot.length, m.length]).to.deep.equal([v2.POT_SIZE, v2.MATCH_SIZE]);
    expect(pot[v2.POT_STATUS_OFFSET]).to.equal(v2.PotStatus.Active);
    expect(pot.readUInt16LE(v2.POT_ARENA_ID_OFFSET)).to.equal(1);
    expect(
      new PublicKey(
        pot.subarray(v2.POT_CREATOR_OFFSET, v2.POT_CREATOR_OFFSET + 32)
      ).equals(a.creator.publicKey)
    ).to.equal(true);
    expect(
      new PublicKey(
        pot.subarray(v2.POT_OPPONENT_OFFSET, v2.POT_OPPONENT_OFFSET + 32)
      ).equals(a.opponent.publicKey)
    ).to.equal(true);
    expect(m[v2.MATCH_STATUS_OFFSET]).to.equal(v2.MatchStatus.Active);
  });

  it("lobby filters select exactly the right pots (status, arena, player) and skip other accounts", async () => {
    const ctx = v2Ctx();
    const { admin } = await setupAdmin(ctx);
    expectOk(
      await createArena(
        ctx,
        admin,
        2,
        defaultArenaArgs({ windows: [30, 60, 0, 0] })
      )
    );
    const alice = await newWallet(ctx);
    const bob = await newWallet(ctx);
    const deadline = (await ctx.sender.now()) + 120n;
    const open1 = (await createMatch(ctx, { creator: alice, arenaId: 1 })).ref;
    const open2 = (
      await createMatch(ctx, { creator: alice, arenaId: 2, windowSecs: 30 })
    ).ref;
    const sponsored = (await createMatch(ctx, { creator: bob, arenaId: 1 }))
      .ref;
    expectOk(
      await sponsorMatch(ctx, sponsored, await newWallet(ctx), 10_000_000n)
    );
    const active = (await createMatch(ctx, { creator: bob, arenaId: 1 })).ref;
    expectOk(await joinMatch(ctx, active, alice));
    const cancelled = (
      await createMatch(ctx, {
        creator: bob,
        arenaId: 2,
        windowSecs: 30,
        joinDeadline: deadline,
      })
    ).ref;
    ctx.sender.warpTo(deadline);
    expectOk(await cancelMatch(ctx, cancelled, bob));

    // LiteSVM has no getProgramAccounts: run the same filters over every account we made.
    const refs = { open1, open2, sponsored, active, cancelled };
    const universe: [string, Buffer][] = [];
    for (const [name, r] of Object.entries(refs)) {
      universe.push([name, (await ctx.sender.accountData(r.pot))!]);
      universe.push([
        `${name}.match`,
        (await ctx.sender.accountData(r.matchAccount))!,
      ]);
    }
    universe.push([
      "protocol",
      (await ctx.sender.accountData(v2.findProtocol(ctx.programId)[0]))!,
    ]);
    const select = (filters: Parameters<typeof v2.matchesFilters>[1]) =>
      universe
        .filter(([, d]) => v2.matchesFilters(d, filters))
        .map(([n]) => n)
        .sort();

    expect(select(v2.openLobbyFilters())).to.deep.equal([
      "open1",
      "open2",
      "sponsored",
    ]);
    expect(select(v2.openLobbyFilters(1))).to.deep.equal([
      "open1",
      "sponsored",
    ]);
    expect(select(v2.openLobbyFilters(2))).to.deep.equal(["open2"]);
    expect(select(v2.potFilters(v2.PotStatus.Active))).to.deep.equal([
      "active",
    ]);
    expect(select(v2.potFilters(v2.PotStatus.Cancelled, 2))).to.deep.equal([
      "cancelled",
    ]);
    expect(
      select(v2.playerPotFilters(alice.publicKey, "creator"))
    ).to.deep.equal(["open1", "open2"]);
    expect(
      select(v2.playerPotFilters(alice.publicKey, "opponent"))
    ).to.deep.equal(["active"]);
    expect(
      select(v2.playerPotFilters(Keypair.generate().publicKey, "creator"))
    ).to.deep.equal([]);
  });
});

describe("v2 sdk: errors and events", () => {
  it("every program error code maps to a message; codes are contiguous from 6000 in enum order", () => {
    const errs = v2.IDL_JSON.errors;
    expect(errs).to.have.length(46);
    errs.forEach((e, i) => {
      expect(e.code).to.equal(6000 + i);
      expect(v2.programError(e.code)?.name).to.equal(e.name);
      expect(v2.programErrorCode(e.name)).to.equal(e.code);
    });
    expect(
      v2.programError(v2.programErrorCode("PriceStale")!)?.message
    ).to.equal("The price feed is lagging. Try again in a moment.");
    expect(v2.programError(9999)).to.equal(null);
  });

  it("programErrorFromLogs finds the error in a real failed transaction", async () => {
    const ctx = v2Ctx();
    const a = await activeMatch(ctx);
    const res = await trade(ctx, a.ref, a.creatorSession, {
      asset: 0,
      side: "buy",
      amount: 0n,
    });
    expect(res.ok).to.equal(false);
    const info = v2.programErrorFromLogs(res.logs)!;
    expect([info.name, info.code]).to.deep.equal([
      "ZeroAmount",
      v2.programErrorCode("ZeroAmount"),
    ]);
  });

  it("parses Traded, MatchFinalized and MatchSettled from real transactions", async () => {
    const ctx = v2Ctx();
    const a = await activeMatch(ctx, { entryLamports: 100_000_000n });
    const t = await trade(ctx, a.ref, a.opponentSession, {
      asset: 0,
      side: "buy",
      amount: 1_000_000_000n,
    });
    expectOk(t);
    const [ev] = v2.parseTradedEvents(t.logs);
    expect(ev.matchAccount.equals(a.ref.matchAccount)).to.equal(true);
    expect([ev.seat, ev.assetIndex, ev.side]).to.deep.equal([1, 0, "buy"]);
    expect(ev.amountIn).to.equal(1_000_000_000n);
    expect(ev.amountOut).to.equal(
      v2.buyQuote(1_000_000_000n, ev.price, 8, 10).qtyOut
    );

    ctx.sender.warpTo(a.endTs);
    await setFeed(ctx, lazer("SOL"), {
      price: PRICES.SOL,
      publishTime: a.endTs,
    });
    const f = await finalizeMatch(ctx, a.ref, a.creator);
    expectOk(f);
    const fin = v2.parseFinalizedEvent(f.logs)!;
    const m = v2.decodeMatch(
      (await ctx.sender.accountData(a.ref.matchAccount))!
    );
    expect(fin.finalValues).to.deep.equal(m.finalValues);
    expect(fin.result).to.equal(m.result);

    const s = await settle(ctx, a.ref, a.creator);
    expectOk(s);
    const st = v2.parseSettledEvent(s.logs)!;
    expect(st.result).to.equal(m.result);
    expect(st.prize + st.rake + st.matchFee + st.tip).to.equal(200_000_000n);
    expect(v2.parseSettledEvent(t.logs)).to.equal(null);
  });
});

describe("v2 sdk: MagicBlock routing, arenas, quotes, builders", () => {
  it("region <-> validator <-> ER endpoint mapping (identical identities on devnet and mainnet)", () => {
    expect(v2.regionOf(VALIDATORS.eu)).to.equal("eu");
    expect(v2.regionOf(Keypair.generate().publicKey)).to.equal(null);
    expect(v2.erEndpoint(v2.VALIDATORS.us, "devnet")).to.equal(
      "https://devnet-us.magicblock.app"
    );
    expect(v2.erEndpoint(v2.VALIDATORS.as, "mainnet")).to.equal(
      "https://as.magicblock.app"
    );
    expect(v2.VALIDATORS.us.equals(VALIDATORS.us)).to.equal(true);
  });

  it("getDelegationStatus: delegated, not delegated, and router errors", async () => {
    const reply = (body: unknown) =>
      (async () => ({ json: async () => body })) as unknown as typeof fetch;
    const pk = Keypair.generate().publicKey;
    expect(
      await v2.getDelegationStatus(
        pk,
        "devnet",
        reply({
          result: {
            isDelegated: true,
            fqdn: "https://devnet-us.magicblock.app/",
          },
        })
      )
    ).to.deep.equal({
      isDelegated: true,
      fqdn: "https://devnet-us.magicblock.app",
    });
    expect(
      await v2.getDelegationStatus(
        pk,
        "devnet",
        reply({ result: { isDelegated: false } })
      )
    ).to.deep.equal({
      isDelegated: false,
      fqdn: null,
    });
    const err = await v2.getDelegationStatus(
      pk,
      "devnet",
      reply({ error: { message: "delegated to unknown ER node" } })
    );
    expect([err.isDelegated, err.fqdn, err.error]).to.deep.equal([
      false,
      null,
      "delegated to unknown ER node",
    ]);
  });

  it("matchLocation trusts the base-layer owner (the router can be stale)", async () => {
    const ctx = v2Ctx();
    const a = await activeMatch(ctx);
    const info = () => {
      const acc = ctx.sender.svm.getAccount(a.ref.matchAccount)!;
      return {
        ...acc,
        owner: new PublicKey(acc.owner),
        data: Buffer.from(acc.data),
        lamports: Number(acc.lamports),
      } as any;
    };
    expect(v2.matchLocationFromInfo(info(), ctx.programId)).to.equal("base");
    setOwner(ctx, a.ref.matchAccount, v2.DELEGATION_PROGRAM_ID);
    expect(v2.matchLocationFromInfo(info(), ctx.programId)).to.equal("er");
    expect(v2.matchLocationFromInfo(null, ctx.programId)).to.equal("missing");
  });

  it("SOLANA_ARENA matches spike 01 feeds and the test fixtures' arena", () => {
    const by = Object.fromEntries(v2.SOLANA_ARENA.map((c) => [c.symbol, c]));
    expect(by.SOL.feed.toBase58()).to.equal(
      "ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu"
    );
    expect(by.BONK.feed.toBase58()).to.equal(
      "4WWpu2fva3uZjmZS95fezYFfoydmYi3PU7ApnqG9cYss"
    );
    expect(by.BONK.exponent).to.equal(10);
    const assets = v2.arenaAssets(v2.SOLANA_ARENA);
    expect(assets).to.have.length(10);
    expect(assets.map((a) => a.feed.toBase58())).to.deep.equal(
      defaultArenaArgs().assets.map((a) => a.feed.toBase58())
    );
  });

  it("limitWithSlippage and previewTrade (preview == on-chain result at the same price)", async () => {
    expect(v2.limitWithSlippage(10_000n, "buy", 50)).to.equal(10_050n);
    expect(v2.limitWithSlippage(10_000n, "sell", 50)).to.equal(9_950n);
    const ctx = v2Ctx();
    const a = await activeMatch(ctx);
    const arena = v2.decodeArena(
      (await ctx.sender.accountData(v2.findArena(ctx.programId, 1)[0]))!
    );
    const preview = v2.previewTrade(
      "buy",
      777_000_000n,
      PRICES.BONK,
      arena.assets[5].exponent,
      10
    );
    const ixn = await v2.tradeIx(ctx.program, {
      signer: a.creatorSession.publicKey,
      matchAccount: a.ref.matchAccount,
      arena,
      assetIndex: 5,
      side: "buy",
      amount: 777_000_000n,
      limitPrice: preview.limitPrice,
    });
    expectOk(await ctx.sender.send([ixn], a.creatorSession));
    const m = v2.decodeMatch(
      (await ctx.sender.accountData(a.ref.matchAccount))!
    );
    expect(m.seats[0].qty[5]).to.equal(preview.amountOut);
  });

  it("a whole duel with only SDK builders; markToMarket at end_ts predicts finalize's values", async () => {
    const ctx = v2Ctx();
    const { treasury } = await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const sessions = [Keypair.generate(), Keypair.generate()];
    const now = await ctx.sender.now();
    const program = ctx.program;

    const c = await v2.createMatchIx(program, {
      creator: creator.publicKey,
      arenaId: 1,
      nonce: 1n,
      windowSecs: 300,
      entryLamports: 100_000_000n,
      joinDeadline: now + 3_600n,
      sessionKey: sessions[0].publicKey,
      validator: v2.VALIDATORS.us,
    });
    expectOk(await ctx.sender.send([c.ix], creator));
    const sponsor = await newWallet(ctx);
    expectOk(
      await ctx.sender.send(
        [
          await v2.sponsorMatchIx(program, {
            sponsor: sponsor.publicKey,
            pot: c.pot,
            amount: 10_000_000n,
          }),
        ],
        sponsor
      )
    );

    const readPot = async () =>
      v2.decodePot((await ctx.sender.accountData(c.pot))!);
    const readMatch = async () =>
      v2.decodeMatch((await ctx.sender.accountData(c.matchAccount))!);
    // join only (delegation is checked in the next test; LiteSVM trades on base)
    const [joinIx] = await v2.joinAndDelegateIxs(program, {
      opponent: opponent.publicKey,
      pot: await readPot(),
      potAddress: c.pot,
      sessionKey: sessions[1].publicKey,
    });
    expectOk(await ctx.sender.send([joinIx], opponent));

    const arena = v2.decodeArena(
      (await ctx.sender.accountData(v2.findArena(ctx.programId, 1)[0]))!
    );
    let m = await readMatch();
    ctx.sender.warpTo(m.startTs);
    await setAllFeeds(ctx);
    for (const [seat, asset] of [
      [0, 0],
      [1, 5],
    ] as const) {
      const ixn = await v2.tradeIx(program, {
        signer: sessions[seat].publicKey,
        matchAccount: c.matchAccount,
        arena,
        assetIndex: asset,
        side: "buy",
        amount: 3_000_000_000n,
        limitPrice: 2n ** 63n,
      });
      expectOk(await ctx.sender.send([ixn], creator, [sessions[seat]]));
    }

    ctx.sender.warpTo(m.endTs);
    await setFeed(ctx, lazer("SOL"), {
      price: (PRICES.SOL * 105n) / 100n,
      publishTime: m.endTs,
    });
    await setFeed(ctx, lazer("BONK"), {
      price: (PRICES.BONK * 97n) / 100n,
      publishTime: m.endTs,
    });
    m = await readMatch();
    const live = arena.assets.map((_, i) =>
      i === 0
        ? (PRICES.SOL * 105n) / 100n
        : i === 5
        ? (PRICES.BONK * 97n) / 100n
        : null
    );
    const exps = arena.assets.map((x) => x.exponent);
    const predicted = [
      v2.markToMarket(m.seats[0], live, exps),
      v2.markToMarket(m.seats[1], live, exps),
    ];
    expect(v2.pnlBps(predicted[0], arena.bankroll)).to.be.greaterThan(0);

    expectOk(
      await ctx.sender.send(
        [
          await v2.finalizeMatchIx(program, {
            payer: creator.publicKey,
            matchAccount: c.matchAccount,
            arena,
          }),
        ],
        creator
      )
    );
    m = await readMatch();
    expect(m.finalValues).to.deep.equal(predicted);
    expect(m.result).to.equal(v2.MatchResult.Creator);

    const settler = await newWallet(ctx);
    expectOk(
      await ctx.sender.send(
        [
          await v2.settleIx(program, {
            settler: settler.publicKey,
            pot: await readPot(),
            treasury,
          }),
        ],
        settler
      )
    );
    expect((await readPot()).status).to.equal(v2.PotStatus.Settled);
    expectOk(
      await ctx.sender.send(
        [
          await v2.closeMatchIx(program, {
            caller: settler.publicKey,
            pot: await readPot(),
          }),
        ],
        settler
      )
    );
    expect(await ctx.sender.accountData(c.pot)).to.equal(null);
  });

  it("joinAndDelegateIxs in one transaction hands Match to the Delegation Program", async () => {
    const ctx = v2Ctx();
    await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const c = await v2.createMatchIx(ctx.program, {
      creator: creator.publicKey,
      arenaId: 1,
      nonce: 9n,
      windowSecs: 300,
      entryLamports: 0n,
      joinDeadline: (await ctx.sender.now()) + 3_600n,
      sessionKey: null,
      validator: v2.VALIDATORS.eu,
    });
    expectOk(await ctx.sender.send([c.ix], creator));
    const pot = v2.decodePot((await ctx.sender.accountData(c.pot))!);
    const ixs = await v2.joinAndDelegateIxs(ctx.program, {
      opponent: opponent.publicKey,
      pot,
      potAddress: c.pot,
      sessionKey: null,
    });
    expectOk(await ctx.sender.send(ixs, opponent));
    expect(
      ctx.sender.svm.getAccount(c.matchAccount)!.owner.toString()
    ).to.equal(v2.DELEGATION_PROGRAM_ID.toBase58());
  });

  it("cancelMatchIx and refundStaleIx build valid refunds", async () => {
    const ctx = v2Ctx();
    const { treasury } = await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const deadline = (await ctx.sender.now()) + 120n;
    const c = await v2.createMatchIx(ctx.program, {
      creator: creator.publicKey,
      arenaId: 1,
      nonce: 3n,
      windowSecs: 300,
      entryLamports: 20_000_000n,
      joinDeadline: deadline,
      sessionKey: null,
      validator: v2.VALIDATORS.us,
    });
    expectOk(await ctx.sender.send([c.ix], creator));
    ctx.sender.warpTo(deadline);
    const pot = v2.decodePot((await ctx.sender.accountData(c.pot))!);
    expectOk(
      await ctx.sender.send(
        [
          await v2.cancelMatchIx(ctx.program, {
            caller: creator.publicKey,
            pot,
            potAddress: c.pot,
            treasury,
          }),
        ],
        creator
      )
    );

    const ctx2 = v2Ctx();
    const a = await activeMatch(ctx2, { entryLamports: 20_000_000n });
    ctx2.sender.warpTo(a.endTs + 86_400n);
    const pot2 = v2.decodePot((await ctx2.sender.accountData(a.ref.pot))!);
    expectOk(
      await ctx2.sender.send(
        [
          await v2.refundStaleIx(ctx2.program, {
            caller: a.creator.publicKey,
            pot: pot2,
            potAddress: a.ref.pot,
            treasury: a.treasury,
          }),
        ],
        a.creator
      )
    );
  });
});
