// v2 build item 6 devnet smoke test: a complete duel through MagicBlock.
//
//   pnpm v2:smoke-duel [us|eu|as]
//
//  1. (once) arena 2, "devnet test arena": Solana Arena coins, 30/60 s windows, 5 s start delay
//  2. create a free match (creator session key) pinned to the region
//  3. opponent: join_match + delegate_match in one transaction (opponent session key)
//  4. both session keys trade IN PARALLEL inside the ER on live oracle prices
//  5. crank: finalize_match at end_ts (retry until a mark published at/after end_ts exists)
//  6. wait for commit + undelegate: Match owned by rug_royale_v2 again on the base layer
//  7. check final values / result against the SDK math using the recorded marks
//  8. settle: payouts vs the SDK, pot left at rent
//  9. close_match: Pot + Match rent back to the creator
// With --crank, steps 5-9 are left to a running `pnpm v2:crank`; the script only watches.
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import { connection, loadKeypair } from "../lib/env";
import { sendTx } from "../lib/tx";

const ROUTER = "https://devnet-router.magicblock.app";
const VALIDATORS: Record<string, PublicKey> = {
  us: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
  eu: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  as: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
};
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
const TEST_ARENA = 2;
const WINDOW = 30;
const FEEDS = ARENA.map(([, id]) => v2.findPriceFeed(id)[0]);

const region = process.argv[2] ?? "us";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (n: number, msg: string) => console.log(`\n[${n}] ${msg}`);
const nowS = () => Math.floor(Date.now() / 1000);

async function must(label: string, p: ReturnType<typeof sendTx>) {
  const r = await p;
  if (!r.ok)
    throw new Error(
      `${label} failed: ${
        r.errorName ?? JSON.stringify(r.error)
      }\n${r.logs.join("\n")}`
    );
  console.log(`    ${label}: ${r.signature?.slice(0, 20)}…`);
}

/** Send to the ER (fee-free), returning [ok, error code or reason, ms]. */
async function sendEr(
  er: Connection,
  ixs: TransactionInstruction[],
  signer: Keypair
): Promise<[boolean, string, number]> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
  tx.sign(signer);
  const t0 = performance.now();
  const sig = await er.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });
  const res = await er.confirmTransaction(sig, "confirmed");
  const ms = performance.now() - t0;
  if (!res.value.err) return [true, sig, ms];
  const logs =
    (await er.getTransaction(sig, { maxSupportedTransactionVersion: 0 }))?.meta
      ?.logMessages ?? [];
  const code =
    logs.join("\n").match(/Error Code: (\w+)/)?.[1] ??
    (logs.find((l) => /Fallback/.test(l))
      ? "OldBinary"
      : JSON.stringify(res.value.err));
  return [false, code, ms];
}

async function main() {
  const conn = connection();
  const admin = loadKeypair();
  const program = new Program<v2.RugRoyaleV2>(
    v2.IDL_JSON,
    new AnchorProvider(conn, new Wallet(admin), {})
  );
  const pid = program.programId;
  console.log(`program ${pid.toBase58()}  region ${region}`);

  step(1, `test arena ${TEST_ARENA} (${WINDOW}/60 s windows, 5 s start delay)`);
  if (!(await conn.getAccountInfo(v2.findArena(pid, TEST_ARENA)[0]))) {
    const ix = await program.methods
      .createArena(TEST_ARENA, {
        paused: false,
        assetCount: ARENA.length,
        assets: ARENA.map(([, id, e]) => ({
          feed: v2.findPriceFeed(id)[0],
          lazerId: id,
          exponent: e,
          enabled: true,
        })),
        windows: [WINDOW, 60, 0, 0],
        bankroll: new BN(10_000_000_000),
        minEntryLamports: new BN(0),
        maxEntryLamports: new BN(0),
        tradeFeeBps: 10,
        rakeBps: 500,
        maxPriceAgeS: 5,
        startDelaySecs: 5,
        freerollDailyCap: 50,
      })
      .accountsStrict(
        v2.createArenaAccounts({
          programId: pid,
          admin: admin.publicKey,
          arenaId: TEST_ARENA,
        })
      )
      .instruction();
    await must("create_arena", sendTx(conn, admin, [ix]));
  } else console.log("    exists");

  step(
    2,
    `create_match (free, ${WINDOW} s window) pinned to ${region.toUpperCase()}`
  );
  const creatorSession = Keypair.generate();
  const opponentSession = Keypair.generate();
  const nonce = BigInt(Date.now());
  const { matchAccount, pot, accounts } = v2.createMatchAccounts({
    programId: pid,
    creator: admin.publicKey,
    arenaId: TEST_ARENA,
    nonce,
  });
  const createIx = await program.methods
    .createMatch(TEST_ARENA, {
      nonce: new BN(nonce.toString()),
      windowSecs: WINDOW,
      entryLamports: new BN(0),
      allowedOpponent: PublicKey.default,
      joinDeadline: new BN(nowS() + 3600),
      sessionKey: creatorSession.publicKey,
      validator: VALIDATORS[region],
    })
    .accountsStrict(accounts)
    .instruction();
  await must("create_match", sendTx(conn, admin, [createIx]));
  console.log(`    match ${matchAccount.toBase58()}`);

  step(3, "opponent: join_match + delegate_match (one transaction)");
  const opponent = Keypair.generate();
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
    .joinMatch(opponentSession.publicKey)
    .accountsStrict(
      v2.joinMatchAccounts({
        programId: pid,
        opponent: opponent.publicKey,
        creator: admin.publicKey,
        matchAccount,
        pot,
        arenaId: TEST_ARENA,
      })
    )
    .instruction();
  const delIx = await program.methods
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
    sendTx(conn, opponent, [joinIx, delIx])
  );

  let fqdn = "";
  for (let i = 0; i < 40 && !fqdn; i++) {
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
    const st = ((await r.json()) as any).result;
    if (st?.isDelegated) fqdn = st.fqdn.replace(/\/$/, "");
    else await sleep(250);
  }
  console.log(`    delegated to ${fqdn}`);
  const er = new Connection(fqdn, "confirmed");
  const m0 = v2.coder.accounts.decode(
    "match",
    (await er.getAccountInfo(matchAccount))!.data
  );
  const startTs = Number(m0.startTs);
  const endTs = Number(m0.endTs);

  step(
    4,
    `both session keys trade in parallel (window ${new Date(startTs * 1000)
      .toISOString()
      .slice(11, 19)}-${new Date(endTs * 1000)
      .toISOString()
      .slice(11, 19)} UTC)`
  );
  await sleep(Math.max(0, startTs - nowS() + 1) * 1000);
  const tradeIx = async (
    session: Keypair,
    asset: number,
    side: "buy" | "sell",
    amount: bigint,
    limit: bigint
  ) =>
    program.methods
      .trade(
        asset,
        side === "buy" ? { buy: {} } : { sell: {} },
        new BN(amount.toString()),
        new BN(limit.toString())
      )
      .accountsStrict(
        v2.tradeAccounts({
          programId: pid,
          signer: session.publicKey,
          matchAccount,
          arenaId: TEST_ARENA,
          priceFeed: FEEDS[asset],
        })
      )
      .instruction();
  const U64_MAX = 2n ** 64n - 1n;
  const plan: [string, Keypair, number, bigint][] = [
    ["creator  buys $4,000 SOL ", creatorSession, 0, 4_000_000_000n],
    ["opponent buys $4,000 BONK", opponentSession, 5, 4_000_000_000n],
    ["creator  buys $2,000 WIF ", creatorSession, 6, 2_000_000_000n],
    ["opponent buys $2,000 JUP ", opponentSession, 1, 2_000_000_000n],
  ];
  const results = await Promise.all(
    plan.map(
      async ([label, s, a, amt]) =>
        [
          label,
          ...(await sendEr(er, [await tradeIx(s, a, "buy", amt, U64_MAX)], s)),
        ] as const
    )
  );
  for (const [label, ok, info, ms] of results)
    console.log(
      `    ${label}: ${ok ? "ok" : "FAILED " + info} in ${ms.toFixed(0)} ms`
    );
  if (results.some((r) => !r[1])) throw new Error("a trade failed");
  const mid = v2.coder.accounts.decode(
    "match",
    (await er.getAccountInfo(matchAccount))!.data
  );
  console.log(
    `    seats after trading: trades [${mid.seats[0].trades}, ${
      mid.seats[1].trades
    }], cash [$${Number(mid.seats[0].cash) / 1e6}, $${
      Number(mid.seats[1].cash) / 1e6
    }]`
  );

  if (process.argv.includes("--crank")) {
    await watchExternalCrank(
      conn,
      pid,
      pot,
      matchAccount,
      opponent.publicKey,
      endTs
    );
    return;
  }

  step(
    5,
    "crank: finalize_match at end_ts (marks must be published in [end_ts, end_ts + 5])"
  );
  await sleep(Math.max(0, endTs - nowS()) * 1000 + 300);
  const finIx = await program.methods
    .finalizeMatch()
    .accountsStrict(
      v2.finalizeMatchAccounts({
        programId: pid,
        payer: admin.publicKey,
        matchAccount,
        arenaId: TEST_ARENA,
      })
    )
    .remainingAccounts(v2.finalizeFeeds(FEEDS))
    .instruction();
  let finSig = "";
  for (let attempt = 1; attempt <= 20; attempt++) {
    const [ok, info, ms] = await sendEr(er, [finIx], admin);
    if (ok) {
      finSig = info;
      console.log(
        `    finalize_match ok on attempt ${attempt} (${ms.toFixed(0)} ms), ${
          nowS() - endTs
        } s after end_ts`
      );
      break;
    }
    console.log(`    attempt ${attempt}: ${info}`);
    if (
      !["MarkWindowMissed", "WindowNotEnded", "OldBinary"].includes(info) ||
      nowS() > endTs + 5
    )
      throw new Error(`finalize failed: ${info}`);
    await sleep(400);
  }
  if (!finSig) throw new Error("finalize never succeeded");

  step(
    6,
    "commit + undelegate: waiting for Match to come home to the base layer"
  );
  const t0 = Date.now();
  let home: Awaited<ReturnType<Connection["getAccountInfo"]>> = null;
  while (Date.now() - t0 < 60_000) {
    home = await conn.getAccountInfo(matchAccount, "confirmed");
    if (home?.owner.equals(pid)) break;
    await sleep(300);
  }
  if (!home?.owner.equals(pid))
    throw new Error("Match did not return to the program within 60 s");
  console.log(
    `    owner ${home.owner.toBase58()} (rug_royale_v2 ✓) after ${(
      (Date.now() - t0) /
      1000
    ).toFixed(1)} s`
  );
  const delegationRecord = await conn.getAccountInfo(
    v2.findDelegationRecord(matchAccount)[0]
  );
  console.log(
    `    delegation record ${delegationRecord ? "still present ✗" : "closed ✓"}`
  );

  step(7, "result on the base layer vs the SDK math");
  const m = v2.coder.accounts.decode("match", home.data);
  const marks = m.markPrices.map((p: any) => BigInt(p.toString()));
  const exps = ARENA.map(([, , e]) => e);
  const value = (s: any) =>
    v2.portfolioValue(
      BigInt(s.cash.toString()),
      s.qty.map((q: any) => BigInt(q.toString())),
      marks,
      exps
    );
  const [w0, w1] = [value(m.seats[0]), value(m.seats[1])];
  console.log(
    `    status ${Object.keys(m.status)[0]}, result ${
      ["pending", "creator", "opponent", "tie"][m.result]
    }`
  );
  console.log(
    `    marks: ${ARENA.map(([s], i) =>
      marks[i] > 0n ? `${s} $${v2.displayPrice(marks[i], exps[i])}` : null
    )
      .filter(Boolean)
      .join(", ")}`
  );
  console.log(
    `    mark publish time ${
      Number(m.markPublishTime) - endTs >= 0 ? "+" : ""
    }${Number(m.markPublishTime) - endTs} s vs end_ts`
  );
  console.log(
    `    final values: creator $${Number(m.finalValues[0]) / 1e6}, opponent $${
      Number(m.finalValues[1]) / 1e6
    }`
  );
  const ok =
    BigInt(m.finalValues[0].toString()) === w0 &&
    BigInt(m.finalValues[1].toString()) === w1 &&
    m.result === v2.matchResult(w0, w1);
  console.log(
    `    SDK recomputation from the recorded marks: ${
      ok ? "matches ✓" : "MISMATCH ✗"
    }`
  );
  if (!ok) process.exitCode = 1;

  step(
    8,
    "settle on the base layer (the crank/winner's Settle button): payouts vs the SDK"
  );
  const potAcc = v2.coder.accounts.decode(
    "pot",
    (await conn.getAccountInfo(pot))!.data
  );
  const want = v2.payout({
    entry: BigInt(potAcc.entryLamports.toString()),
    sponsored: BigInt(potAcc.sponsoredLamports.toString()),
    matchFee: BigInt(potAcc.matchFeeLamports.toString()),
    feeShare: BigInt(potAcc.feeShareLamports.toString()),
    settlerTip: BigInt(potAcc.settlerTipLamports.toString()),
    rakeBps: potAcc.rakeBps,
    result: m.result,
  });
  // The admin wallet is creator, treasury and settler here, so check the opponent (joiner),
  // who must receive the match-fee reimbursement (+ the prize if they won), and the pot.
  const oppBefore = BigInt(await conn.getBalance(opponent.publicKey));
  const treasury = v2.coder.accounts.decode(
    "protocol",
    (await conn.getAccountInfo(v2.findProtocol(pid)[0]))!.data
  ).treasury;
  const settleIx = await program.methods
    .settle()
    .accountsStrict(
      v2.settleAccounts({
        programId: pid,
        settler: admin.publicKey,
        matchAccount,
        creator: admin.publicKey,
        opponent: opponent.publicKey,
        treasury,
      })
    )
    .instruction();
  await must("settle", sendTx(conn, admin, [settleIx]));
  const oppGot = BigInt(await conn.getBalance(opponent.publicKey)) - oppBefore;
  const potRent = BigInt(await conn.getMinimumBalanceForRentExemption(8 + 258));
  const potLeft = BigInt(await conn.getBalance(pot));
  console.log(
    `    opponent received ${oppGot} lamports (SDK: ${want.toOpponent}) ${
      oppGot === want.toOpponent ? "✓" : "✗"
    }`
  );
  console.log(
    `    pot left at rent: ${
      potLeft === potRent ? "✓" : `✗ (${potLeft} vs ${potRent})`
    }`
  );
  if (oppGot !== want.toOpponent || potLeft !== potRent) process.exitCode = 1;

  step(9, "close_match: Pot + Match rent back to the creator");
  const closeIx = await program.methods
    .closeMatch()
    .accountsStrict(
      v2.closeMatchAccounts({
        programId: pid,
        caller: admin.publicKey,
        matchAccount,
        creator: admin.publicKey,
      })
    )
    .instruction();
  await must("close_match", sendTx(conn, admin, [closeIx]));
  const gone =
    !(await conn.getAccountInfo(pot)) &&
    !(await conn.getAccountInfo(matchAccount));
  console.log(`    Pot and Match closed: ${gone ? "✓" : "✗"}`);
  if (!gone) process.exitCode = 1;
}

/**
 * `--crank` mode: a separately running `pnpm v2:crank` must finalize at end_ts, wait for the
 * commit and settle. Watch the base layer and time it.
 */
async function watchExternalCrank(
  conn: Connection,
  pid: PublicKey,
  pot: PublicKey,
  matchAccount: PublicKey,
  opponent: PublicKey,
  endTs: number
) {
  step(
    5,
    "hands off: waiting for the external crank (pnpm v2:crank) to finalize + settle"
  );
  const oppBefore = BigInt(await conn.getBalance(opponent));
  const deadline = Date.now() + (endTs - nowS() + 90) * 1000;
  let home = 0;
  while (Date.now() < deadline) {
    const [mInfo, pInfo] = await conn.getMultipleAccountsInfo(
      [matchAccount, pot],
      "confirmed"
    );
    if (
      !home &&
      mInfo &&
      v2.matchLocationFromInfo(mInfo, pid) === "base" &&
      v2.decodeMatch(mInfo.data).status === v2.MatchStatus.Finalized
    ) {
      home = Date.now();
      console.log(
        `    match finalized + home at +${(
          (home - endTs * 1000) /
          1000
        ).toFixed(1)} s after end_ts`
      );
    }
    if (pInfo && v2.decodePot(pInfo.data).status === v2.PotStatus.Settled) {
      const p = v2.decodePot(pInfo.data);
      const m = v2.decodeMatch(mInfo!.data);
      const want = v2.payout({
        entry: p.entryLamports,
        sponsored: p.sponsoredLamports,
        matchFee: p.matchFeeLamports,
        feeShare: p.feeShareLamports,
        settlerTip: p.settlerTipLamports,
        rakeBps: p.rakeBps,
        result: m.result,
      });
      // Measure the settle transaction itself: MagicBlock also refunds the joiner's leftover
      // delegation deposit at undelegation (deposits - 0.003 SOL fee), just before settle.
      // Failed attempts (e.g. a second crank losing the race) also touch the pot: skip them.
      const sigs = await conn.getSignaturesForAddress(
        pot,
        { limit: 10 },
        "confirmed"
      );
      const sig = sigs.find((x) => x.err === null)!;
      const tx = await conn.getTransaction(sig.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const keys = tx!.transaction.message.getAccountKeys().staticAccountKeys;
      const i = keys.findIndex((k) => k.equals(opponent));
      const got = BigInt(tx!.meta!.postBalances[i] - tx!.meta!.preBalances[i]);
      const refund = BigInt(await conn.getBalance(opponent)) - oppBefore - got;
      console.log(
        `    settled by the crank at +${(
          (Date.now() - endTs * 1000) /
          1000
        ).toFixed(1)} s after end_ts`
      );
      console.log(
        `    result ${
          ["pending", "creator", "opponent", "tie"][m.result]
        }; settle paid the opponent ${got} (SDK ${want.toOpponent}) ${
          got === want.toOpponent ? "✓" : "✗"
        }`
      );
      console.log(
        `    + MagicBlock refunded the opponent's leftover delegation deposit at undelegation: ${refund} lamports`
      );
      if (got !== want.toOpponent) process.exitCode = 1;
      return;
    }
    await sleep(500);
  }
  console.log("    ✗ not settled within 90 s of end_ts");
  process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
