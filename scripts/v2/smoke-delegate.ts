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
  console.log(
    "\nThe match now lives in the ER until finalize_match (build item 6) commits and undelegates it.\n" +
      "It stays delegated on devnet for now; that's expected for this smoke test."
  );
}

main()
  .then(() => process.exit(0)) // open RPC/websocket handles would otherwise keep node alive
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
