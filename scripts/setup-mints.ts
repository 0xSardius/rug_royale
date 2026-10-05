// PRD §10.2 / G11: create the devnet demo mints and record them in coins.json.
//
//   pnpm setup-mints
//
// One Token-2022 quote mint (devSTONK) and one per coin, 6 decimals, mint authority set
// straight to the MintAuthority PDA. Idempotent: mints already in coins.json are verified,
// not recreated, and coins.json is saved after each creation so a failed run resumes.
// Must run before init-config.ts, which copies these mints into Config (permanent, G12).
import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import {
  DEMO_DECIMALS,
  MINT_SIZE,
  createDemoMintIxs,
  findMintAuthority,
} from "@rug-royale/sdk";
import {
  PROGRAM_ID,
  RPC_URL,
  connection,
  loadKeypair,
  readCoins,
  writeCoins,
} from "./lib/env";

async function main() {
  const conn = connection();
  const payer = loadKeypair();
  const [authority] = findMintAuthority(PROGRAM_ID);
  const coins = readCoins();
  if (coins.coins.length !== 10)
    throw new Error(`coins.json must list 10 coins, has ${coins.coins.length}`);

  console.log(`rpc       ${RPC_URL}`);
  console.log(`payer     ${payer.publicKey.toBase58()}`);
  console.log(`authority ${authority.toBase58()} (MintAuthority PDA)\n`);

  const rent = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);
  const create = async (label: string) => {
    const mint = Keypair.generate();
    const tx = new Transaction().add(
      ...createDemoMintIxs({
        programId: PROGRAM_ID,
        payer: payer.publicKey,
        mint: mint.publicKey,
        rentLamports: rent,
      })
    );
    await sendAndConfirmTransaction(conn, tx, [payer, mint], {
      commitment: "confirmed",
    });
    console.log(`created   ${label.padEnd(10)} ${mint.publicKey.toBase58()}`);
    return mint.publicKey.toBase58();
  };

  if (!coins.quote.demoMint) {
    coins.quote.demoMint = await create(coins.quote.symbol);
    writeCoins(coins);
  }
  for (const c of coins.coins) {
    if (c.demoMint) continue;
    c.demoMint = await create(c.symbol);
    writeCoins(coins);
  }

  // Verify every mint against G3 / G11: Token-2022, 6 decimals, authority = PDA, no freeze.
  console.log("\nverify");
  const entries = [
    { label: coins.quote.symbol, mint: coins.quote.demoMint! },
    ...coins.coins.map((c) => ({ label: c.symbol, mint: c.demoMint! })),
  ];
  const seen = new Set<string>();
  let failures = 0;
  for (const { label, mint } of entries) {
    const problems: string[] = [];
    if (seen.has(mint)) problems.push("duplicate");
    seen.add(mint);
    try {
      const m = await getMint(
        conn,
        new PublicKey(mint),
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      if (!m.mintAuthority?.equals(authority))
        problems.push(`authority ${m.mintAuthority?.toBase58()}`);
      if (m.decimals !== DEMO_DECIMALS) problems.push(`decimals ${m.decimals}`);
      if (m.freezeAuthority) problems.push("has freeze authority");
      if (m.tlvData.length > 0) problems.push("has extensions");
    } catch (e) {
      problems.push(`not a Token-2022 mint (${(e as Error).name})`);
    }
    failures += problems.length ? 1 : 0;
    console.log(
      `${problems.length ? "FAIL" : "ok  "}      ${label.padEnd(10)} ${mint}${
        problems.length ? "  " + problems.join(", ") : ""
      }`
    );
  }
  if (failures) {
    console.error(`\n${failures} mint(s) failed verification`);
    process.exit(1);
  }
  console.log(
    "\nall 11 mints verified; coins.json is ready for init-config.ts"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
