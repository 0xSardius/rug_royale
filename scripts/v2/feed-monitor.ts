// v2 feed monitor (v2 PRD §10.4): watches every arena asset's MagicBlock oracle feed in every
// ER region and alerts when one goes stale; with --pause it disables buys of that asset.
//
//   pnpm v2:feed-monitor [--pause] [--once] [--arena <id>]
//
// Env: RPC_URL, KEYPAIR (must be Protocol.admin to disable; otherwise the instruction is
// printed for a Squads proposal), CLUSTER=devnet|mainnet, POLL_MS (default 5000),
// ALERT_WEBHOOK_URL (optional Discord/Slack-compatible webhook), FORCE_MAX_AGE_S (drills only:
// override every arena's max price age, e.g. -1 to treat every feed as stale).
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import { RPC_HOST, connection, loadKeypair } from "../lib/env";
import { sendTx } from "../lib/tx";
import {
  freshState,
  step,
  type FeedEvent,
  type FeedState,
} from "../lib/feed-monitor-plan";

const CLUSTER = (process.env.CLUSTER ?? "devnet") as v2.Cluster;
const POLL_MS = Number(process.env.POLL_MS ?? 5_000);
const WEBHOOK = process.env.ALERT_WEBHOOK_URL;
const FORCE_MAX_AGE =
  process.env.FORCE_MAX_AGE_S !== undefined
    ? Number(process.env.FORCE_MAX_AGE_S)
    : null;
const args = process.argv.slice(2);
const PAUSE = args.includes("--pause");
const ONCE = args.includes("--once");
const ONLY_ARENA = args.includes("--arena")
  ? Number(args[args.indexOf("--arena") + 1])
  : null;

const base = connection();
const admin = loadKeypair();
const program = new Program<v2.RugRoyaleV2>(
  v2.IDL_JSON,
  new AnchorProvider(base, new Wallet(admin), {})
);
const pid = program.programId;
const regions = Object.keys(v2.MAGICBLOCK[CLUSTER].er) as v2.Region[];
const ers = Object.fromEntries(
  regions.map((r) => [
    r,
    new Connection(v2.MAGICBLOCK[CLUSTER].er[r], "confirmed"),
  ])
) as Record<v2.Region, Connection>;
const states = new Map<string, FeedState>();
const symbol = (feed: PublicKey) =>
  v2.SOLANA_ARENA.find((c) => c.feed.equals(feed))?.symbol ??
  feed.toBase58().slice(0, 6);
const log = (m: string) => console.log(`${new Date().toISOString()}  ${m}`);

async function notify(msg: string) {
  log(msg);
  if (!WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: msg, text: msg }), // Discord uses `content`, Slack `text`
    });
  } catch (e) {
    log(`webhook failed: ${(e as Error).message}`);
  }
}

async function listArenas(): Promise<v2.Arena[]> {
  const accts = await base.getProgramAccounts(pid, {
    filters: v2.arenaFilters(),
  });
  return accts
    .map((a) => v2.decodeArena(a.account.data))
    .filter((a) => ONLY_ARENA === null || a.arenaId === ONLY_ARENA);
}

/** (arenaId:index) already disabled by this process, so other regions don't repeat it. */
const disabledHere = new Set<string>();

async function disable(stale: v2.Arena, index: number) {
  const key = `${stale.arenaId}:${index}`;
  if (disabledHere.has(key)) return;
  // Re-read the arena right before writing: building from the poll's snapshot would re-enable
  // assets disabled earlier in the same poll (found in the 2026-11-05 drill).
  const info = await base.getAccountInfo(
    v2.findArena(pid, stale.arenaId)[0],
    "confirmed"
  );
  if (!info) return;
  const a = v2.decodeArena(info.data);
  if (!a.assets[index]?.enabled) {
    disabledHere.add(key);
    return;
  }
  const assets = a.assets.map((x, i) => ({
    ...x,
    enabled: i === index ? false : x.enabled,
  }));
  const empty = {
    feed: PublicKey.default,
    lazerId: 0,
    exponent: 0,
    enabled: false,
  };
  const ix = await program.methods
    .updateArena({
      paused: a.paused,
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
    })
    .accountsStrict(
      v2.updateArenaAccounts({
        programId: pid,
        admin: admin.publicKey,
        arenaId: a.arenaId,
      })
    )
    .instruction();
  const protocol = v2.decodeProtocol(
    (await base.getAccountInfo(v2.findProtocol(pid)[0]))!.data
  );
  const sym = symbol(a.assets[index].feed);
  if (!protocol.admin.equals(admin.publicKey)) {
    await notify(
      `🛑 ${sym} in arena ${
        a.arenaId
      } needs disabling, but Protocol.admin is a multisig: propose update_arena (data ${Buffer.from(
        ix.data
      )
        .toString("base64")
        .slice(0, 32)}…)`
    );
    return;
  }
  const res = await sendTx(base, admin, [ix]);
  if (res.ok) disabledHere.add(key);
  await notify(
    res.ok
      ? `🛑 disabled buys of ${sym} in arena ${a.arenaId} (sells still work); re-enable with: pnpm v2:arena update ${a.arenaId} --enable ${sym} --send`
      : `disable ${sym} in arena ${a.arenaId} FAILED: ${
          res.errorName ?? String(res.error)
        }`
  );
}

async function poll(arenas: v2.Arena[]) {
  const nowS = Math.floor(Date.now() / 1000);
  let healthy = 0;
  let total = 0;
  for (const a of arenas) {
    const maxAge = FORCE_MAX_AGE ?? a.maxPriceAgeS;
    for (const r of regions) {
      let infos: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>>;
      try {
        infos = await ers[r].getMultipleAccountsInfo(
          a.assets.map((x) => x.feed)
        );
      } catch (e) {
        log(`${r} ER unreachable: ${(e as Error).message.slice(0, 80)}`);
        continue;
      }
      for (const [i, x] of a.assets.entries()) {
        const key = `${a.arenaId}:${i}:${r}`;
        const f = infos[i] ? v2.decodePriceFeed(infos[i]!.data) : null;
        const ageS =
          f && f.price > 0n && f.postedSlot > 0n
            ? nowS - Number(f.publishTime)
            : null;
        const { state, events } = step(states.get(key) ?? freshState(), {
          ageS,
          maxAgeS: maxAge,
          enabled: x.enabled,
          nowS,
          canDisable: PAUSE,
        });
        states.set(key, state);
        total++;
        if (state.staleSince === null) healthy++;
        const sym = symbol(x.feed);
        for (const e of events as FeedEvent[]) {
          if (e === "alert")
            await notify(
              `⚠️ ${sym} feed stale in the ${r.toUpperCase()} ER (arena ${
                a.arenaId
              }): ${
                ageS === null ? "missing/invalid" : `${ageS}s old`
              } > ${maxAge}s`
            );
          if (e === "recovered")
            await notify(
              `✅ ${sym} feed recovered in the ${r.toUpperCase()} ER (arena ${
                a.arenaId
              })`
            );
          if (e === "disable") await disable(a, i);
        }
      }
    }
  }
  return { healthy, total };
}

async function main() {
  log(
    `feed monitor up  base=${RPC_HOST}  cluster=${CLUSTER}  regions=${regions.join(
      ","
    )}  pause=${PAUSE}  webhook=${WEBHOOK ? "set" : "none"}${
      FORCE_MAX_AGE !== null ? `  DRILL max age ${FORCE_MAX_AGE}s` : ""
    }`
  );
  let arenas = await listArenas();
  log(
    `watching ${arenas
      .map((a) => `arena ${a.arenaId} (${a.assets.length} coins)`)
      .join(", ")}`
  );
  for (let n = 0; ; n++) {
    if (n > 0 && n % 12 === 0) arenas = await listArenas(); // pick up arena edits
    try {
      const { healthy, total } = await poll(arenas);
      if (ONCE || n % 12 === 0) log(`${healthy}/${total} feed copies fresh`);
    } catch (e) {
      log(`poll error: ${(e as Error).message.slice(0, 160)}`);
    }
    if (ONCE) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
