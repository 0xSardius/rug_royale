// REQ01 / PRD §10.3: initialize Config on devnet from coins.json and the PRD §5 defaults.
//
//   pnpm init-config            dry run: print the args and simulate (sends nothing)
//   pnpm init-config --send     send for real, then read Config back and diff it
//
// Config is permanent (G12: no update_config), so the default is a dry run. Overrides via
// .env: TREASURY (default: the admin wallet), CONFIG_WINDOWS (e.g. "30,120,300,900").
import { PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { decodeConfig, findConfig, initConfigAccounts } from "@rug-royale/sdk";
import {
  PROGRAM_ID,
  RPC_URL,
  connection,
  loadKeypair,
  readCoins,
} from "./lib/env";
import { programFor } from "./lib/program";
import { sendTx, simulateTx } from "./lib/tx";

const U = 1_000_000n; // 6-decimal demo tokens

// PRD §5 defaults. Windows: the 30 s option is the team default pending Tue Oct 6 noon (STATUS).
const DEFAULTS = {
  tiers: [1_000n * U, 10_000n * U, 100_000n * U],
  windows: [30, 120, 300, 900],
  poolSeedRatio: 10n,
  settlerTipLamports: 1_000_000n,
  maxEntryLamports: 1_000_000_000n,
  rakeBps: 250,
  swapFeeBps: 30,
};

async function main() {
  const send = process.argv.includes("--send");
  const conn = connection();
  const admin = loadKeypair();
  const coins = readCoins();
  const [configPda] = findConfig(PROGRAM_ID);

  const quote = coins.quote.demoMint;
  const mints = coins.coins.map((c) => c.demoMint);
  if (!quote || mints.length !== 10 || mints.some((m) => !m)) {
    throw new Error(
      "coins.json needs a quote demoMint and 10 coin demoMints. Run pnpm setup-mints first."
    );
  }
  const windows = process.env.CONFIG_WINDOWS
    ? process.env.CONFIG_WINDOWS.split(",").map((w) => Number(w.trim()))
    : DEFAULTS.windows;
  const treasury = new PublicKey(
    process.env.TREASURY ?? admin.publicKey.toBase58()
  );

  const expected = {
    admin: admin.publicKey.toBase58(),
    treasury: treasury.toBase58(),
    quoteMint: quote,
    allowedMints: mints as string[],
    tiers: DEFAULTS.tiers.map(String),
    windows,
    poolSeedRatio: String(DEFAULTS.poolSeedRatio),
    settlerTipLamports: String(DEFAULTS.settlerTipLamports),
    maxEntryLamports: String(DEFAULTS.maxEntryLamports),
    rakeBps: DEFAULTS.rakeBps,
    swapFeeBps: DEFAULTS.swapFeeBps,
  };

  console.log(`rpc     ${RPC_URL}`);
  console.log(`program ${PROGRAM_ID.toBase58()}`);
  console.log(`config  ${configPda.toBase58()}\n`);
  console.log(JSON.stringify(expected, null, 2));

  const existing = await conn.getAccountInfo(configPda);
  if (existing) {
    console.log(
      "\nConfig already exists (it can't be re-initialized). Diff against the values above:"
    );
    process.exit(report(expected, actual(decodeConfig(existing.data))) ? 0 : 1);
  }

  const ix = await programFor(conn, admin)
    .methods.initConfig({
      treasury,
      quoteMint: new PublicKey(quote),
      allowedMints: mints.map((m) => new PublicKey(m!)),
      tiers: DEFAULTS.tiers.map((t) => new BN(t.toString())),
      windows,
      poolSeedRatio: new BN(DEFAULTS.poolSeedRatio.toString()),
      settlerTipLamports: new BN(DEFAULTS.settlerTipLamports.toString()),
      maxEntryLamports: new BN(DEFAULTS.maxEntryLamports.toString()),
      rakeBps: DEFAULTS.rakeBps,
      swapFeeBps: DEFAULTS.swapFeeBps,
    })
    .accountsStrict(initConfigAccounts(PROGRAM_ID, admin.publicKey))
    .instruction();

  if (!send) {
    const sim = await simulateTx(conn, admin, [ix]);
    console.log(
      `\nsimulation: ${
        sim.ok ? "ok" : `FAILED (${sim.errorName ?? JSON.stringify(sim.err)})`
      }, ${sim.cu} CU`
    );
    if (!sim.ok) console.log(sim.logs.join("\n"));
    console.log(
      "\nDry run only. Re-run with --send to initialize Config (permanent)."
    );
    process.exit(sim.ok ? 0 : 1);
  }

  const res = await sendTx(conn, admin, [ix]);
  if (!res.ok) {
    console.error(
      `init_config failed: ${
        res.errorName ?? String(res.error)
      }\n${res.logs.join("\n")}`
    );
    process.exit(1);
  }
  console.log(`\nsent ${res.signature}`);
  const after = await conn.getAccountInfo(configPda, "confirmed");
  if (!after) throw new Error("Config not found after init_config");
  process.exit(report(expected, actual(decodeConfig(after.data))) ? 0 : 1);
}

function actual(c: ReturnType<typeof decodeConfig>) {
  return {
    admin: c.admin.toBase58(),
    treasury: c.treasury.toBase58(),
    quoteMint: c.quoteMint.toBase58(),
    allowedMints: c.allowedMints.map((m) => m.toBase58()),
    tiers: c.tiers.map(String),
    windows: c.windows,
    poolSeedRatio: String(c.poolSeedRatio),
    settlerTipLamports: String(c.settlerTipLamports),
    maxEntryLamports: String(c.maxEntryLamports),
    rakeBps: c.rakeBps,
    swapFeeBps: c.swapFeeBps,
  };
}

/** Prints one line per field; returns true when everything matches. */
function report(
  expected: Record<string, unknown>,
  got: Record<string, unknown>
) {
  let ok = true;
  for (const k of Object.keys(expected)) {
    const same = JSON.stringify(expected[k]) === JSON.stringify(got[k]);
    ok &&= same;
    console.log(
      `${same ? "ok  " : "DIFF"}  ${k}${
        same
          ? ""
          : `\n      expected ${JSON.stringify(
              expected[k]
            )}\n      on-chain ${JSON.stringify(got[k])}`
      }`
    );
  }
  console.log(
    ok ? "\nConfig matches." : "\nConfig differs from the expected values."
  );
  return ok;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
