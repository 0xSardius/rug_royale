// REQ14 / PRD §10.4: settle ended duels, cancel expired ones, close finished ones.
//
//   pnpm crank           poll forever (CRANK_INTERVAL_MS, default 5000)
//   pnpm crank --once    one pass, then exit
//
// Safety never depends on the crank: settle, cancel_duel, and close_duel are permissionless
// and settle never expires (P1). Losing a race to another settler is expected and skipped.
// Signs with CRANK_KEYPAIR (default KEYPAIR); the settler tip goes to that wallet.
import { PublicKey } from "@solana/web3.js";
import {
  DuelStatus,
  cancelDuelAccounts,
  closeDuelAccounts,
  decodeConfig,
  decodeDuel,
  duelsByStatus,
  findConfig,
  settleAccounts,
  type Duel,
  type DuelRef,
} from "@rug-royale/sdk";
import { PROGRAM_ID, RPC_URL, connection, loadKeypair } from "./lib/env";
import { programFor } from "./lib/program";
import { sendTx } from "./lib/tx";
import {
  BEATEN,
  TOO_EARLY,
  planAction,
  type CrankAction,
} from "./lib/crank-plan";

const INTERVAL_MS = Number(process.env.CRANK_INTERVAL_MS ?? 5_000);
/** Settled/Cancelled duels only need closing eventually; scan them every Nth tick. */
const CLOSE_SCAN_EVERY = 12;

const conn = connection();
const settler = loadKeypair(
  process.env.CRANK_KEYPAIR ? "CRANK_KEYPAIR" : "KEYPAIR"
);
const program = programFor(conn, settler);
const log = (msg: string) => console.log(`${new Date().toISOString()}  ${msg}`);

async function fetchDuels(status: DuelStatus) {
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    filters: duelsByStatus(status),
  });
  const out: { address: PublicKey; duel: Duel }[] = [];
  for (const a of accounts) {
    try {
      out.push({ address: a.pubkey, duel: decodeDuel(a.account.data) });
    } catch {
      // Not decodable with the current layout; ignore.
    }
  }
  return out;
}

const refOf = (address: PublicKey, d: Duel): DuelRef => ({
  programId: PROGRAM_ID,
  duel: address,
  creator: d.creator,
  opponent: d.opponent ?? undefined,
  quoteMint: d.quoteMint,
  coinMint: d.coin,
});

async function act(
  action: CrankAction,
  address: PublicKey,
  d: Duel,
  treasury: PublicKey
) {
  const ref = refOf(address, d);
  const ix =
    action === "settle"
      ? await program.methods
          .settle()
          .accountsStrict(settleAccounts(ref, settler.publicKey, treasury))
          .instruction()
      : action === "cancel"
      ? await program.methods
          .cancelDuel()
          .accountsStrict(
            cancelDuelAccounts(
              ref,
              settler.publicKey,
              d.sponsoredLamports > 0n ? d.sponsor : null
            )
          )
          .instruction()
      : await program.methods
          .closeDuel()
          .accountsStrict(closeDuelAccounts(ref, settler.publicKey))
          .instruction();

  const res = await sendTx(conn, settler, [ix]);
  const id = address.toBase58();
  if (res.ok) log(`${action.padEnd(6)} ${id}  ${res.signature}`);
  else if (res.errorName && BEATEN.has(res.errorName))
    log(`skip   ${id}  already ${action}d by someone else`);
  else if (res.errorName && TOO_EARLY.has(res.errorName))
    return; // cluster clock behind; next tick
  else
    log(
      `FAIL   ${id}  ${action}: ${
        res.errorName ?? String(res.error).slice(0, 160)
      }`
    );
}

async function tick(n: number, treasury: PublicKey) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const statuses = [DuelStatus.Active, DuelStatus.Open];
  if (n % CLOSE_SCAN_EVERY === 0)
    statuses.push(DuelStatus.Settled, DuelStatus.Cancelled);
  for (const status of statuses) {
    for (const { address, duel } of await fetchDuels(status)) {
      const action = planAction(duel, now);
      if (action) await act(action, address, duel, treasury);
    }
  }
}

async function main() {
  const once = process.argv.includes("--once");
  const configInfo = await conn.getAccountInfo(findConfig(PROGRAM_ID)[0]);
  if (!configInfo)
    throw new Error(
      "Config not found on this cluster. Run pnpm init-config --send first."
    );
  const { treasury } = decodeConfig(configInfo.data);

  log(
    `crank up  rpc=${RPC_URL}  settler=${settler.publicKey.toBase58()}  every ${INTERVAL_MS} ms`
  );
  for (let n = 0; ; n++) {
    try {
      await tick(n, treasury);
    } catch (e) {
      log(`tick error: ${(e as Error).message}`); // RPC hiccup; keep going
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
