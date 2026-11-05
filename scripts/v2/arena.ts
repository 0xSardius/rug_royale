// v2 arena tooling (v2 PRD §10.2).
//
//   pnpm v2:arena check                          live feeds vs reference prices (exit 1 on any failure)
//   pnpm v2:arena show <id>                      decoded on-chain arena
//   pnpm v2:arena create <id> [options] [--send] create from SOLANA_ARENA (dry run unless --send)
//   pnpm v2:arena update <id> [--disable SYM]... [--enable SYM]... [--pause|--unpause] [--send]
//
// create/update refuse unless `check` passes for every coin that would be enabled. On mainnet
// the admin is a Squads multisig: pass --export to print the instruction for a Squads proposal
// instead of signing. Options for create: --windows 300,900,3600  --free (min = max entry = 0)
// --min-entry <lamports> --max-entry <lamports> --rake <bps> --fee <bps> --start-delay <s>
// --freeroll-cap <n> --bankroll-usd <n>.
// Env: RPC_URL, KEYPAIR (admin), CLUSTER=devnet|mainnet (which ER serves the feeds).
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import { RPC_HOST, connection, loadKeypair } from "../lib/env";
import { sendTx, simulateTx } from "../lib/tx";
import { allPass, checkCoin, type CoinCheck } from "../lib/arena-check";

const CLUSTER = (process.env.CLUSTER ?? "devnet") as v2.Cluster;
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const opts = (name: string) =>
  args.flatMap((a, i) =>
    a === `--${name}` && args[i + 1] ? [args[i + 1]] : []
  );

const base = connection();
const admin = loadKeypair();
const program = new Program<v2.RugRoyaleV2>(
  v2.IDL_JSON,
  new AnchorProvider(base, new Wallet(admin), {})
);
const pid = program.programId;

async function referencePrices(ids: string[]): Promise<Record<string, number>> {
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(
        ","
      )}&vs_currencies=usd`
    );
    const j = (await r.json()) as Record<string, { usd?: number }>;
    return Object.fromEntries(
      Object.entries(j).map(([k, v]) => [k, v.usd ?? NaN])
    );
  } catch {
    return {};
  }
}

async function check(coins: v2.ArenaCoin[]): Promise<CoinCheck[]> {
  const er = new Connection(v2.MAGICBLOCK[CLUSTER].er.us, "confirmed");
  const [infos, refs] = await Promise.all([
    er.getMultipleAccountsInfo(coins.map((c) => c.feed)),
    referencePrices(coins.map((c) => c.coingeckoId)),
  ]);
  const now = BigInt(Math.floor(Date.now() / 1000));
  return coins.map((c, i) =>
    checkCoin(
      c,
      infos[i] ? v2.decodePriceFeed(infos[i]!.data) : null,
      refs[c.coingeckoId] ?? null,
      now
    )
  );
}

function printChecks(checks: CoinCheck[]) {
  const f = (n: number | null) =>
    n === null ? "-" : n < 0.01 ? n.toPrecision(4) : n.toFixed(4);
  console.log(
    "coin      status        oracle          reference       dev    age"
  );
  for (const c of checks)
    console.log(
      `${c.symbol.padEnd(9)} ${(c.status === "ok"
        ? "ok"
        : `✗ ${c.status}`
      ).padEnd(13)} $${f(c.oracle).padEnd(14)} $${f(c.reference).padEnd(14)} ${
        c.deviationBps === null ? "-" : (c.deviationBps / 100).toFixed(2) + "%"
      }`.padEnd(70) + ` ${c.ageS ?? "-"}s`
    );
}

function arenaArgs(prev: v2.Arena | null, coins: v2.ArenaCoin[]) {
  const windows = (opt("windows") ?? "300,900,3600").split(",").map(Number);
  const free = flag("free");
  return {
    paused: prev?.paused ?? false,
    assetCount: coins.length,
    assets: v2.arenaAssets(coins),
    windows: [...windows, 0, 0, 0, 0].slice(0, 4),
    bankroll: new BN(
      (BigInt(opt("bankroll-usd") ?? "10000") * 1_000_000n).toString()
    ),
    minEntryLamports: new BN(free ? "0" : opt("min-entry") ?? "10000000"),
    maxEntryLamports: new BN(free ? "0" : opt("max-entry") ?? "1000000000"),
    tradeFeeBps: Number(opt("fee") ?? 10),
    rakeBps: Number(opt("rake") ?? 500),
    maxPriceAgeS: 5,
    startDelaySecs: Number(opt("start-delay") ?? 20),
    freerollDailyCap: Number(opt("freeroll-cap") ?? 3),
  };
}

/** update keeps everything from the on-chain arena except the requested changes. */
function updateArgs(a: v2.Arena) {
  const disable = new Set(opts("disable").map((s) => s.toUpperCase()));
  const enable = new Set(opts("enable").map((s) => s.toUpperCase()));
  const sym = (feed: PublicKey) =>
    v2.SOLANA_ARENA.find((c) => c.feed.equals(feed))?.symbol ?? "?";
  const assets = a.assets.map((x) => ({
    feed: x.feed,
    lazerId: x.lazerId,
    exponent: x.exponent,
    enabled: disable.has(sym(x.feed))
      ? false
      : enable.has(sym(x.feed))
      ? true
      : x.enabled,
  }));
  const empty = {
    feed: PublicKey.default,
    lazerId: 0,
    exponent: 0,
    enabled: false,
  };
  return {
    paused: flag("pause") ? true : flag("unpause") ? false : a.paused,
    assetCount: assets.length,
    assets: [...assets, ...Array(10 - assets.length).fill(empty)],
    windows: [...a.windows, 0, 0, 0, 0].slice(0, 4),
    bankroll: new BN(a.bankroll.toString()),
    minEntryLamports: new BN(a.minEntryLamports.toString()),
    maxEntryLamports: new BN(a.maxEntryLamports.toString()),
    tradeFeeBps: a.tradeFeeBps,
    rakeBps: a.rakeBps,
    maxPriceAgeS: a.maxPriceAgeS,
    startDelaySecs: a.startDelaySecs,
    freerollDailyCap: a.freerollDailyCap,
    _enabledSymbols: assets.filter((x) => x.enabled).map((x) => sym(x.feed)),
  };
}

async function finish(label: string, ix: TransactionInstruction) {
  if (flag("export")) {
    console.log(
      `\n${label} instruction for a Squads proposal (signer = Protocol.admin):`
    );
    console.log(
      JSON.stringify(
        {
          programId: ix.programId.toBase58(),
          keys: ix.keys.map((k) => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          dataBase64: Buffer.from(ix.data).toString("base64"),
        },
        null,
        2
      )
    );
    return;
  }
  if (!flag("send")) {
    const sim = await simulateTx(base, admin, [ix]);
    console.log(
      `\nsimulation: ${
        sim.ok ? "ok" : `FAILED (${sim.errorName ?? JSON.stringify(sim.err)})`
      }`
    );
    if (!sim.ok) process.exitCode = 1;
    console.log(
      "Dry run only. Re-run with --send to execute (or --export for a multisig)."
    );
    return;
  }
  const res = await sendTx(base, admin, [ix]);
  if (!res.ok)
    throw new Error(`${label} failed: ${res.errorName ?? String(res.error)}`);
  console.log(`\n${label}: ${res.signature}`);
}

async function readArena(id: number) {
  const info = await base.getAccountInfo(v2.findArena(pid, id)[0]);
  return info ? v2.decodeArena(info.data) : null;
}

function showArena(a: v2.Arena) {
  console.log(
    `arena ${a.arenaId}${a.paused ? " (PAUSED)" : ""}: windows ${a.windows.join(
      "/"
    )} s, bankroll $${Number(a.bankroll) / 1e6}, ` +
      `entry ${Number(a.minEntryLamports) / 1e9}-${
        Number(a.maxEntryLamports) / 1e9
      } SOL, fee ${a.tradeFeeBps} bps, rake ${a.rakeBps} bps, ` +
      `max age ${a.maxPriceAgeS} s, start delay ${a.startDelaySecs} s, freerolls ${a.freerollDailyCap}/day`
  );
  for (const [i, x] of a.assets.entries()) {
    const c = v2.SOLANA_ARENA.find((k) => k.feed.equals(x.feed));
    console.log(
      `  [${i}] ${(c?.symbol ?? "?").padEnd(7)} lazer ${String(
        x.lazerId
      ).padEnd(4)} e=${x.exponent}  ${
        x.enabled ? "enabled" : "DISABLED"
      }  ${x.feed.toBase58()}`
    );
  }
}

async function main() {
  const [cmd, idArg] = args;
  const id = Number(idArg);
  console.log(
    `v2 arena ${
      cmd ?? ""
    }  program ${pid.toBase58()}  base ${RPC_HOST}  feeds from ${CLUSTER} ER`
  );

  if (cmd === "check") {
    const checks = await check(v2.SOLANA_ARENA);
    printChecks(checks);
    if (!allPass(checks)) process.exitCode = 1;
    return;
  }
  if (cmd === "show") {
    const a = await readArena(id);
    if (!a) throw new Error(`arena ${id} not found`);
    showArena(a);
    return;
  }
  if (cmd === "create") {
    if (await readArena(id))
      throw new Error(`arena ${id} already exists; use update`);
    const checks = await check(v2.SOLANA_ARENA);
    printChecks(checks);
    if (!allPass(checks))
      throw new Error("refusing to create: not every feed passed the check");
    const ix = await program.methods
      .createArena(id, arenaArgs(null, v2.SOLANA_ARENA))
      .accountsStrict(
        v2.createArenaAccounts({
          programId: pid,
          admin: admin.publicKey,
          arenaId: id,
        })
      )
      .instruction();
    await finish(`create_arena ${id}`, ix);
    if (flag("send")) showArena((await readArena(id))!);
    return;
  }
  if (cmd === "update") {
    const a = await readArena(id);
    if (!a) throw new Error(`arena ${id} not found`);
    const { _enabledSymbols, ...u } = updateArgs(a);
    const coins = v2.SOLANA_ARENA.filter((c) =>
      _enabledSymbols.includes(c.symbol)
    );
    const checks = await check(coins);
    printChecks(checks);
    if (!allPass(checks))
      throw new Error(
        "refusing to update: an enabled coin failed the check (disable it instead)"
      );
    const ix = await program.methods
      .updateArena(u)
      .accountsStrict(
        v2.updateArenaAccounts({
          programId: pid,
          admin: admin.publicKey,
          arenaId: id,
        })
      )
      .instruction();
    await finish(`update_arena ${id}`, ix);
    if (flag("send")) showArena((await readArena(id))!);
    return;
  }
  console.log(
    "usage: pnpm v2:arena check | show <id> | create <id> [...] [--send|--export] | update <id> [...] [--send|--export]"
  );
  process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(`error: ${(e as Error).message}`);
    process.exit(1);
  });
