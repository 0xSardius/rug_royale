// v2 build item 4 devnet smoke test: create a match pinned to an ER region, join + delegate
// it in one transaction, then confirm MagicBlock's router and ER see it where we pinned it.
//
//   pnpm tsx scripts/v2/smoke-delegate.ts [us|eu|as]
//
// Idempotent setup: initializes Protocol (KEYPAIR must be the program's upgrade authority)
// and arena 1 ("Solana Arena") only if they don't exist yet. Uses a free duel (entry 0) so
// it costs devnet SOL for rent, the match-fee shares and the delegation deposit only.
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import { connection, loadKeypair } from "../lib/env";
import { sendTx } from "../lib/tx";

const ROUTER = "https://devnet-router.magicblock.app";
const VALIDATORS: Record<string, { identity: PublicKey; fqdn: string }> = {
  us: {
    identity: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
    fqdn: "devnet-us.magicblock.app",
  },
  eu: {
    identity: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
    fqdn: "devnet-eu.magicblock.app",
  },
  as: {
    identity: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
    fqdn: "devnet-as.magicblock.app",
  },
};
// Solana Arena (spike 01): [symbol, Pyth Lazer id, |exponent|].
const ARENA: [string, number, number][] = [
  ["SOL", 6, 8],
  ["JUP", 92, 8],
  ["JTO", 91, 8],
  ["RAY", 54, 8],
  ["PYTH", 3, 8],
  ["BONK", 9, 10],
  ["WIF", 10, 8],
  ["POPCAT", 130, 8],
  ["PENGU", 97, 8],
  ["TRUMP", 203, 8],
];

const region = process.argv[2] ?? "us";
const step = (n: number, msg: string) => console.log(`\n[${n}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function must(label: string, p: ReturnType<typeof sendTx>) {
  const r = await p;
  if (!r.ok)
    throw new Error(
      `${label} failed: ${
        r.errorName ?? JSON.stringify(r.error)
      }\n${r.logs.join("\n")}`
    );
  console.log(`    ${label}: ${r.signature}`);
  return r;
}

async function main() {
  const conn = connection();
  const admin = loadKeypair();
  const program = new Program<v2.RugRoyaleV2>(
    v2.IDL_JSON,
    new AnchorProvider(conn, new Wallet(admin), {})
  );
  const pid = program.programId;
  const target = VALIDATORS[region];
  console.log(
    `program ${pid.toBase58()}  admin ${admin.publicKey.toBase58()}  region ${region}`
  );

  step(1, "Protocol + arena on the base layer (skipped if they already exist)");
  if (!(await conn.getAccountInfo(v2.findProtocol(pid)[0]))) {
    const ix = await program.methods
      .initProtocol({
        maxEntryLamports: new BN(LAMPORTS_PER_SOL),
        matchFeeLamports: new BN(3_010_000),
        settlerTipLamports: new BN(1_000_000),
        maxRakeBps: 1000,
        paused: false,
      })
      .accountsStrict(
        v2.initProtocolAccounts({
          programId: pid,
          admin: admin.publicKey,
          treasury: admin.publicKey,
        })
      )
      .instruction();
    await must("init_protocol", sendTx(conn, admin, [ix]));
  } else console.log("    protocol exists");
  if (!(await conn.getAccountInfo(v2.findArena(pid, 1)[0]))) {
    const assets = ARENA.map(([, id, e]) => ({
      feed: v2.findPriceFeed(id)[0],
      lazerId: id,
      exponent: e,
      enabled: true,
    }));
    const ix = await program.methods
      .createArena(1, {
        paused: false,
        assetCount: assets.length,
        assets,
        windows: [300, 900, 3600, 0],
        bankroll: new BN(10_000_000_000),
        minEntryLamports: new BN(10_000_000),
        maxEntryLamports: new BN(LAMPORTS_PER_SOL),
        tradeFeeBps: 10,
        rakeBps: 500,
        maxPriceAgeS: 5,
        startDelaySecs: 20,
        freerollDailyCap: 3,
      })
      .accountsStrict(
        v2.createArenaAccounts({
          programId: pid,
          admin: admin.publicKey,
          arenaId: 1,
        })
      )
      .instruction();
    await must("create_arena", sendTx(conn, admin, [ix]));
  } else console.log("    arena 1 exists");

  step(
    2,
    `create_match (free duel) pinned to the ${region.toUpperCase()} ER validator ${target.identity.toBase58()}`
  );
  const nonce = BigInt(Date.now());
  const { matchAccount, pot, accounts } = v2.createMatchAccounts({
    programId: pid,
    creator: admin.publicKey,
    arenaId: 1,
    nonce,
  });
  const now = BigInt(Math.floor(Date.now() / 1000));
  const createIx = await program.methods
    .createMatch(1, {
      nonce: new BN(nonce.toString()),
      windowSecs: 300,
      entryLamports: new BN(0),
      allowedOpponent: PublicKey.default,
      joinDeadline: new BN((now + 3600n).toString()),
      sessionKey: PublicKey.default,
      validator: target.identity,
    })
    .accountsStrict(accounts)
    .instruction();
  await must("create_match", sendTx(conn, admin, [createIx]));
  console.log(
    `    match ${matchAccount.toBase58()}\n    pot   ${pot.toBase58()}`
  );

  step(
    3,
    "opponent: join_match + delegate_match in ONE transaction (one wallet approval in the app)"
  );
  const opponent = Keypair.generate();
  const session = Keypair.generate(); // what the browser would generate and keep in memory
  await must(
    "fund opponent",
    sendTx(conn, admin, [
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: opponent.publicKey,
        lamports: 0.02 * LAMPORTS_PER_SOL,
      }),
    ])
  );
  const joinIx = await program.methods
    .joinMatch(session.publicKey)
    .accountsStrict(
      v2.joinMatchAccounts({
        programId: pid,
        opponent: opponent.publicKey,
        creator: admin.publicKey,
        matchAccount,
        pot,
        arenaId: 1,
      })
    )
    .instruction();
  const delegateIx = await program.methods
    .delegateMatch()
    .accountsStrict(
      v2.delegateMatchAccounts({
        programId: pid,
        payer: opponent.publicKey,
        matchAccount,
      })
    )
    .instruction();
  await must(
    "join_match + delegate_match",
    sendTx(conn, opponent, [joinIx, delegateIx])
  );

  step(
    4,
    "base layer: Match is now owned by MagicBlock's Delegation Program; Pot is still ours"
  );
  const base = await conn.getAccountInfo(matchAccount);
  const potInfo = await conn.getAccountInfo(pot);
  console.log(
    `    Match owner: ${base?.owner.toBase58()} ${
      base?.owner.equals(v2.DELEGATION_PROGRAM_ID)
        ? "(Delegation Program ✓)"
        : "✗"
    }`
  );
  console.log(
    `    Pot owner:   ${potInfo?.owner.toBase58()} ${
      potInfo?.owner.equals(pid) ? "(rug_royale_v2 ✓, never delegated)" : "✗"
    }`
  );

  step(5, "MagicBlock router: which ER holds the match?");
  let status: any = null;
  for (let i = 0; i < 40; i++) {
    const r = await fetch(ROUTER, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [matchAccount.toBase58()],
      }),
    });
    status = ((await r.json()) as any).result;
    if (status?.isDelegated) break;
    await sleep(250);
  }
  const fqdn: string = status?.fqdn ?? "";
  console.log(
    `    isDelegated ${status?.isDelegated}, fqdn ${fqdn} ${
      fqdn.includes(target.fqdn)
        ? "(pinned region ✓)"
        : "✗ expected " + target.fqdn
    }`
  );

  step(
    6,
    "inside the ER: the same account, owned by our program, with both seats filled"
  );
  const erUrl = fqdn.replace(/\/$/, "") || `https://${target.fqdn}`;
  const erInfo = await new (
    await import("@solana/web3.js")
  ).Connection(erUrl, "confirmed").getAccountInfo(matchAccount);
  if (!erInfo) throw new Error("match not visible in the ER");
  const m = v2.coder.accounts.decode("match", erInfo.data);
  console.log(
    `    ER owner: ${erInfo.owner.toBase58()} ${
      erInfo.owner.equals(pid) ? "(rug_royale_v2 ✓)" : "✗"
    }`
  );
  console.log(
    `    status ${
      Object.keys(m.status)[0]
    }, seat0 ${m.seats[0].player.toBase58()}, seat1 ${m.seats[1].player.toBase58()}`
  );
  console.log(
    `    seat1 session key ${
      m.seats[1].sessionKey.equals(session.publicKey) ? "✓" : "✗"
    }; trading starts ${new Date(Number(m.startTs) * 1000).toISOString()}`
  );
  if (process.argv.includes("--trade"))
    await tradeInEr(program, erUrl, matchAccount, session, Number(m.startTs));
  console.log(
    "\nThe match now lives in the ER until finalize_match (build item 6) commits and undelegates it.\n" +
      "It stays delegated on devnet for now; that's expected for this smoke test."
  );
}

/**
 * Build item 5: trade inside the ER with the opponent's session key (0 SOL), priced by
 * MagicBlock's live oracle feeds, then read the seat back from the ER.
 */
async function tradeInEr(
  program: Program<v2.RugRoyaleV2>,
  erUrl: string,
  matchAccount: PublicKey,
  session: Keypair,
  startTs: number
) {
  const { Connection, Transaction } = await import("@solana/web3.js");
  const er = new Connection(erUrl, {
    commitment: "confirmed",
    wsEndpoint: erUrl.replace("https", "wss"),
  });
  const wait = startTs - Math.floor(Date.now() / 1000) + 1;
  step(
    7,
    `trade in the ER with the session key (${await er.getBalance(
      session.publicKey
    )} lamports); waiting ${Math.max(wait, 0)} s for start_ts`
  );
  if (wait > 0) await sleep(wait * 1000);

  const orders: [string, number, number, bigint][] = [
    ["SOL", 0, 8, 1_000_000_000n], // $1,000
    ["BONK", 5, 10, 500_000_000n], // $500
  ];
  for (const [sym, asset, exp, cash] of orders) {
    const feed = v2.findPriceFeed(ARENA[asset][1])[0];
    const live = v2.decodePriceFeed((await er.getAccountInfo(feed))!.data)!;
    const limit = (live.price * 1005n) / 1000n; // 0.5% slippage
    for (let attempt = 1; ; attempt++) {
      const ixn = await program.methods
        .trade(
          asset,
          { buy: {} },
          new BN(cash.toString()),
          new BN(limit.toString())
        )
        .accountsStrict(
          v2.tradeAccounts({
            programId: program.programId,
            signer: session.publicKey,
            matchAccount,
            arenaId: 1,
            priceFeed: feed,
          })
        )
        .instruction();
      const tx = new Transaction().add(ixn);
      tx.feePayer = session.publicKey; // ER transactions are fee-free
      tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
      tx.sign(session);
      const t0 = performance.now();
      const sig = await er.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });
      const res = await er.confirmTransaction(sig, "confirmed");
      const ms = (performance.now() - t0).toFixed(0);
      if (!res.value.err) {
        console.log(
          `    buy $${Number(cash) / 1e6} ${sym} @ $${v2.displayPrice(
            live.price,
            exp
          )}: ok in ${ms} ms (${sig.slice(0, 16)}…)`
        );
        break;
      }
      const logs =
        (await er.getTransaction(sig, { maxSupportedTransactionVersion: 0 }))
          ?.meta?.logMessages ?? [];
      const why =
        logs.find((l) => l.includes("Error Code") || l.includes("Fallback")) ??
        JSON.stringify(res.value.err);
      // Spike 04: right after an upgrade the ER can briefly run the previous binary.
      if (attempt < 12 && /InstructionFallbackNotFound|Fallback/.test(why)) {
        console.log(
          `    ER still on the old program binary (attempt ${attempt}); retrying in 5 s`
        );
        await sleep(5000);
        continue;
      }
      throw new Error(`trade ${sym} failed: ${why}`);
    }
  }

  step(8, "read seat 1 back from the ER");
  const m = v2.coder.accounts.decode(
    "match",
    (await er.getAccountInfo(matchAccount))!.data
  );
  const seat = m.seats[1];
  console.log(`    cash $${Number(seat.cash) / 1e6}, trades ${seat.trades}`);
  console.log(`    SOL  ${Number(seat.qty[0]) / 1e6}  (≈ $999 / price)`);
  console.log(`    BONK ${Number(seat.qty[5]) / 1e6}`);
  console.log(
    `    session key still holds ${await er.getBalance(
      session.publicKey
    )} lamports`
  );
}

main()
  .then(() => process.exit(0)) // open RPC/websocket handles would otherwise keep node alive
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
