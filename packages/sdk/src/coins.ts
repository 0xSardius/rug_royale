// coins.json (repo root): the StonkFun top-10 snapshot and the devnet demo mints standing in
// for each coin (G10). Written by scripts/snapshot.ts and scripts/setup-mints.ts; order of
// `coins` = Config.allowed_mints order.
import coinsJson from "../../../coins.json";

/** A real StonkFun coin and the devnet demo mint standing in for it. */
export interface Coin {
  rank: number;
  name: string;
  symbol: string;
  image: string;
  realMint: string;
  marketCapUsd: number | null;
  priceUsd: number | null;
  /** Set by setup-mints.ts. */
  demoMint: string | null;
}

export interface CoinsFile {
  snapshotAt: string;
  source: string;
  network: string;
  /** Quote token standing in for STONK. `demoMint` set by setup-mints.ts. */
  quote: {
    name: string;
    symbol: string;
    realMint: string | null;
    demoMint: string | null;
  };
  /** Exactly 10, in Config.allowed_mints order. */
  coins: Coin[];
}

export const COINS = coinsJson as CoinsFile;

export const coinByDemoMint = (mint: string): Coin | undefined =>
  COINS.coins.find((c) => c.demoMint === mint);
