import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import {
  VALIDATORS,
  activeMatch,
  cancelMatch,
  createArena,
  createMatch,
  defaultArenaArgs,
  expectOk,
  joinMatch,
  newWallet,
  setupAdmin,
  sponsorMatch,
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
