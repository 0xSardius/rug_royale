// Crank v2 (v2 PRD §10.3): finalize matches in the ER right at end_ts, then settle, cancel,
// refund and close on the base layer. Decisions live in scripts/lib/crank-plan-v2.ts.
//
//   pnpm v2:crank            run forever
//   pnpm v2:crank --once     one pass (no finalize scheduling), then exit
//
// Env: RPC_URL (base layer), CLUSTER=devnet|mainnet (ER endpoints, default devnet),
// CRANK_KEYPAIR (default KEYPAIR; receives settler tips, pays base fees, signs ER finalize),
// CRANK_INTERVAL_MS (default 3000), REGIONS=us,eu,as (which ER regions this instance
// finalizes; run one instance near each region in production, since marks must be published
// within 5 s of end_ts).
//
// Safety never depends on the crank: every action is permissionless, settle has no deadline,
// and refund_stale covers matches that never finalize.
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";
import { RPC_HOST, connection, loadKeypair } from "../lib/env";
import { sendTx } from "../lib/tx";
import {
  BEATEN,
  TOO_EARLY,
  finalizeWindowMs,
  planAction,
  type CrankAction,
  type MatchView,
} from "../lib/crank-plan-v2";

const CLUSTER = (process.env.CLUSTER ?? "devnet") as v2.Cluster;
const INTERVAL_MS = Number(process.env.CRANK_INTERVAL_MS ?? 3_000);
const REGIONS = new Set(
  (process.env.REGIONS ?? "us,eu,as")
    .split(",")
    .map((r) => r.trim()) as v2.Region[]
);
/** Terminal pots only need closing eventually: scan them every Nth tick. */
const CLOSE_SCAN_EVERY = 20;
/** Schedule finalize for matches ending within this horizon. */
const SCHEDULE_HORIZON_MS = 15 * 60_000;
const FINALIZE_RETRY_MS = 300;

const base = connection();
const crank = loadKeypair(
  process.env.CRANK_KEYPAIR ? "CRANK_KEYPAIR" : "KEYPAIR"
);
const program = new Program<v2.RugRoyaleV2>(
  v2.IDL_JSON,
  new AnchorProvider(base, new Wallet(crank), {})
);
const pid = program.programId;
const log = (msg: string) => console.log(`${new Date().toISOString()}  ${msg}`);
const short = (pk: PublicKey) => pk.toBase58().slice(0, 8) + "…";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const arenas = new Map<number, v2.Arena>();
const scheduled = new Set<string>();
const erConns = new Map<string, Connection>();
let treasury: PublicKey;

async function arena(id: number) {
  let a = arenas.get(id);
  if (!a) {
    const info = await base.getAccountInfo(v2.findArena(pid, id)[0]);
    if (!info) throw new Error(`arena ${id} not found`);
    a = v2.decodeArena(info.data);
    arenas.set(id, a);
  }
  return a;
}

function er(validator: PublicKey) {
  const k = validator.toBase58();
  let c = erConns.get(k);
  if (!c) {
    c = v2.erConnection(validator, CLUSTER);
    erConns.set(k, c);
  }
  return c;
}

/** Send to an ER (fee-free; no preflight). Returns the program error name on failure. */
async function sendEr(
  conn: Connection,
  ixs: TransactionInstruction[],
  signer: Keypair
) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(signer);
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });
  const res = await conn.confirmTransaction(sig, "confirmed");
  if (!res.value.err) return { ok: true as const, sig };
  const logs =
    (await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 }))
      ?.meta?.logMessages ?? [];
  const name =
    logs.join("\n").match(/Error Code: (\w+)/)?.[1] ??
    (logs.some((l) => /Fallback/.test(l))
      ? "OldBinary"
      : JSON.stringify(res.value.err));
  return { ok: false as const, sig, name };
}

interface Item {
  address: PublicKey;
  pot: v2.Pot;
  view: MatchView;
}

async function fetchPots(status: v2.PotStatus) {
  const accts = await base.getProgramAccounts(pid, {
    filters: v2.potFilters(status),
  });
  const out: { address: PublicKey; pot: v2.Pot }[] = [];
  for (const a of accts) {
    try {
      out.push({ address: a.pubkey, pot: v2.decodePot(a.account.data) });
    } catch {
      // not decodable with this layout; ignore
    }
  }
  return out;
}

/** Location from the base-layer owner; live status from the ER (batched per region) or base. */
async function withViews(
  pots: { address: PublicKey; pot: v2.Pot }[]
): Promise<Item[]> {
  if (pots.length === 0) return [];
  const matches = pots.map((p) => p.pot.matchAccount);
  const baseInfos = await base.getMultipleAccountsInfo(matches, "confirmed");
  const views: MatchView[] = baseInfos.map((info) => {
    const location = v2.matchLocationFromInfo(info, pid);
    return {
      location,
      status:
        location === "base" && info ? v2.decodeMatch(info.data).status : null,
    };
  });
  const byRegion = new Map<string, number[]>();
  views.forEach((v, i) => {
    if (v.location !== "er") return;
    const k = pots[i].pot.validator.toBase58();
    byRegion.set(k, [...(byRegion.get(k) ?? []), i]);
  });
  for (const [k, idxs] of byRegion) {
    try {
      const infos = await er(new PublicKey(k)).getMultipleAccountsInfo(
        idxs.map((i) => matches[i])
      );
      infos.forEach(
        (info, j) =>
          (views[idxs[j]].status = info
            ? v2.decodeMatch(info.data).status
            : null)
      );
    } catch (e) {
      log(
        `ER read failed for ${k.slice(0, 8)}…: ${(e as Error).message.slice(
          0,
          100
        )}`
      );
    }
  }
  return pots.map((p, i) => ({ ...p, view: views[i] }));
}

async function baseAction(action: Exclude<CrankAction, "finalize">, it: Item) {
  const ix =
    action === "cancel"
      ? await v2.cancelMatchIx(program, {
          caller: crank.publicKey,
          pot: it.pot,
          potAddress: it.address,
          treasury,
        })
      : action === "delegate"
      ? (
          await v2.joinAndDelegateIxs(program, {
            opponent: crank.publicKey,
            pot: it.pot,
            potAddress: it.address,
            sessionKey: null,
          })
        )[1]
      : action === "settle"
      ? await v2.settleIx(program, {
          settler: crank.publicKey,
          pot: it.pot,
          treasury,
        })
      : action === "refund"
      ? await v2.refundStaleIx(program, {
          caller: crank.publicKey,
          pot: it.pot,
          potAddress: it.address,
          treasury,
        })
      : await v2.closeMatchIx(program, {
          caller: crank.publicKey,
          pot: it.pot,
        });
  const res = await sendTx(base, crank, [ix]);
  const id = short(it.pot.matchAccount);
  if (res.ok) log(`${action.padEnd(8)} ${id}  ${res.signature}`);
  else if (res.errorName && BEATEN.has(res.errorName))
    log(`skip     ${id}  ${action}: already done (${res.errorName})`);
  else if (res.errorName && TOO_EARLY.has(res.errorName)) return; // next tick
  else
    log(
      `FAIL     ${id}  ${action}: ${
        res.errorName ?? String(res.error).slice(0, 160)
      }`
    );
}

/** Finalize in the ER inside [end_ts, end_ts + 5 s], then wait for the commit and settle. */
async function finalizeLoop(it: Item) {
  const key = it.pot.matchAccount.toBase58();
  const region = v2.regionOf(it.pot.validator);
  const { firstAttemptAt, giveUpAt } = finalizeWindowMs(it.pot.endTs);
  const wait = firstAttemptAt - Date.now();
  if (wait > 0) await sleep(wait);
  const a = await arena(it.pot.arenaId);
  const ix = await v2.finalizeMatchIx(program, {
    payer: crank.publicKey,
    matchAccount: it.pot.matchAccount,
    arena: a,
  });
  const conn = er(it.pot.validator);
  for (let attempt = 1; ; attempt++) {
    let r: Awaited<ReturnType<typeof sendEr>>;
    try {
      r = await sendEr(conn, [ix], crank);
    } catch (e) {
      r = { ok: false, sig: "", name: (e as Error).message.slice(0, 80) };
    }
    const late = ((Date.now() - Number(it.pot.endTs) * 1000) / 1000).toFixed(1);
    if (r.ok) {
      log(
        `finalize ${short(
          it.pot.matchAccount
        )}  ${region} ER, attempt ${attempt}, +${late}s after end_ts  ${r.sig.slice(
          0,
          20
        )}…`
      );
      break;
    }
    if (BEATEN.has(r.name)) {
      log(
        `skip     ${short(it.pot.matchAccount)}  finalize: already done (${
          r.name
        })`
      );
      break;
    }
    if (
      Date.now() >= giveUpAt ||
      !(TOO_EARLY.has(r.name) || r.name === "OldBinary")
    ) {
      log(
        `FAIL     ${short(it.pot.matchAccount)}  finalize: ${
          r.name
        } after ${attempt} attempts (+${late}s); refund_stale covers it after 24 h`
      );
      scheduled.delete(key);
      return;
    }
    await sleep(FINALIZE_RETRY_MS);
  }
  // Fast path: settle as soon as the commit lands (the base-layer owner is the truth).
  const t0 = Date.now();
  if (await v2.waitForUndelegation(base, it.pot.matchAccount, pid, 60_000)) {
    log(
      `home     ${short(it.pot.matchAccount)}  committed + undelegated in ${(
        (Date.now() - t0) /
        1000
      ).toFixed(1)}s`
    );
    await baseAction("settle", it);
  } else
    log(
      `slow     ${short(
        it.pot.matchAccount
      )}  commit not on base after 60 s; the tick loop will settle it`
    );
  scheduled.delete(key);
}

function schedule(it: Item, now: number) {
  const key = it.pot.matchAccount.toBase58();
  const region = v2.regionOf(it.pot.validator);
  if (scheduled.has(key) || !region || !REGIONS.has(region)) return;
  const endMs = Number(it.pot.endTs) * 1000;
  if (endMs - now > SCHEDULE_HORIZON_MS) return;
  if (now > finalizeWindowMs(it.pot.endTs).giveUpAt) return; // window missed: planner handles refund
  scheduled.add(key);
  log(
    `schedule ${short(it.pot.matchAccount)}  finalize at end_ts ${new Date(
      endMs
    )
      .toISOString()
      .slice(11, 19)}Z (${region} ER)`
  );
  finalizeLoop(it).catch((e) => {
    log(
      `FAIL     ${short(it.pot.matchAccount)}  finalize loop: ${
        (e as Error).message
      }`
    );
    scheduled.delete(key);
  });
}

async function tick(n: number, once: boolean) {
  const nowMs = Date.now();
  const now = BigInt(Math.floor(nowMs / 1000));
  const statuses = [v2.PotStatus.Open, v2.PotStatus.Active];
  if (n % CLOSE_SCAN_EVERY === 0)
    statuses.push(
      v2.PotStatus.Settled,
      v2.PotStatus.Cancelled,
      v2.PotStatus.Refunded
    );
  for (const status of statuses) {
    const items = await withViews(await fetchPots(status));
    for (const it of items) {
      // Active matches in the ER: schedule the precise finalize (also when the window is open now).
      if (
        !once &&
        it.pot.status === v2.PotStatus.Active &&
        it.view.location === "er" &&
        it.view.status === v2.MatchStatus.Active
      )
        schedule(it, nowMs);
      const action = planAction(it.pot, it.view, now);
      if (action && action !== "finalize") await baseAction(action, it);
    }
  }
}

async function main() {
  const once = process.argv.includes("--once");
  const p = await base.getAccountInfo(v2.findProtocol(pid)[0]);
  if (!p) throw new Error("v2 Protocol not found on this cluster");
  treasury = v2.decodeProtocol(p.data).treasury;
  log(
    `crank v2 up  base=${RPC_HOST}  cluster=${CLUSTER}  regions=${[
      ...REGIONS,
    ].join(",")}  crank=${crank.publicKey.toBase58()}  every ${INTERVAL_MS} ms`
  );
  for (let n = 0; ; n++) {
    try {
      await tick(n, once);
    } catch (e) {
      log(`tick error: ${(e as Error).message.slice(0, 200)}`); // RPC hiccup; keep going
    }
    if (once) break;
    await sleep(INTERVAL_MS);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
