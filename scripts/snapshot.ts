// REQ13 / PRD §10.1: snapshot the StonkFun top 10 by market cap into coins.json.
//
//   pnpm snapshot [--force]
//
// The platform token (STONK) is skipped: the devnet quote mint already stands in for it,
// so it can't also be a duel coin. Refuses to overwrite a coins.json whose demo mints
// exist, because Config.allowed_mints is permanent (G12); --force overrides.
import { CoinsFile, hasCoinsFile, readCoins, writeCoins } from "./lib/env";

const API = "https://www.stonkfun.xyz/api/public/v1";
const SITE = "https://www.stonkfun.xyz";
const PLATFORM_SYMBOL = "STONK";

interface ApiToken {
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  market?: { priceUsd?: number; marketCapUsd?: number };
}

async function main() {
  const force = process.argv.includes("--force");
  if (hasCoinsFile() && !force) {
    const existing = readCoins();
    if (existing.quote.demoMint || existing.coins.some((c) => c.demoMint)) {
      console.error(
        "coins.json already has demo mints; Config.allowed_mints is permanent. Use --force to overwrite."
      );
      process.exit(1);
    }
  }

  const res = await fetch(`${API}/tokens?sort=marketCap&pageSize=25`);
  if (!res.ok)
    throw new Error(`StonkFun API ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    data: { tokens: ApiToken[]; network: string };
  };
  const all = body.data.tokens;

  const platform = all.find((t) => t.symbol === PLATFORM_SYMBOL);
  const top = all.filter((t) => t.symbol !== PLATFORM_SYMBOL).slice(0, 10);
  if (top.length !== 10)
    throw new Error(`expected 10 coins, got ${top.length}`);

  const out: CoinsFile = {
    snapshotAt: new Date().toISOString(),
    source: `${API}/tokens?sort=marketCap (excluding ${PLATFORM_SYMBOL})`,
    network: body.data.network,
    quote: {
      name: "devSTONK",
      symbol: "dSTONK",
      realMint: platform?.mint ?? null,
      demoMint: null,
    },
    coins: top.map((t, i) => ({
      rank: i + 1,
      name: t.name,
      symbol: t.symbol,
      image: t.imageUrl ? new URL(t.imageUrl, SITE).toString() : "",
      realMint: t.mint,
      marketCapUsd: t.market?.marketCapUsd ?? null,
      priceUsd: t.market?.priceUsd ?? null,
      demoMint: null,
    })),
  };
  writeCoins(out);
  for (const c of out.coins)
    console.log(
      `${String(c.rank).padStart(2)}  ${c.symbol.padEnd(10)} ${c.name}`
    );
  console.log(`wrote coins.json (${out.snapshotAt})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
