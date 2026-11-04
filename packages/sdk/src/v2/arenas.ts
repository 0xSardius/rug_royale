// Arena definitions shared by scripts, tests and the app (spike 01: every coin below has a
// live MagicBlock oracle feed on devnet and mainnet). The on-chain Arena is the source of
// truth once created; these are the inputs to `create_arena`.
import { PublicKey } from "@solana/web3.js";
import { findPriceFeed } from "./pdas";

export interface ArenaCoin {
  symbol: string;
  name: string;
  /** Pyth Lazer feed id. */
  lazerId: number;
  /** |exponent| from Pyth's list (the feed account's own field is wrong: spike 01). */
  exponent: number;
  feed: PublicKey;
}

const coin = (
  symbol: string,
  name: string,
  lazerId: number,
  exponent: number
): ArenaCoin => ({
  symbol,
  name,
  lazerId,
  exponent,
  feed: findPriceFeed(lazerId)[0],
});

/** "Solana Arena": arena 1 (devnet + mainnet), and test arena 2 on devnet. */
export const SOLANA_ARENA: ArenaCoin[] = [
  coin("SOL", "Solana", 6, 8),
  coin("JUP", "Jupiter", 92, 8),
  coin("JTO", "Jito", 91, 8),
  coin("RAY", "Raydium", 54, 8),
  coin("PYTH", "Pyth Network", 3, 8),
  coin("BONK", "Bonk", 9, 10),
  coin("WIF", "dogwifhat", 10, 8),
  coin("POPCAT", "Popcat", 130, 8),
  coin("PENGU", "Pudgy Penguins", 97, 8),
  coin("TRUMP", "Official Trump", 203, 8),
];

/** `ArenaAsset` args for create_arena / update_arena, padded to the 10 on-chain slots. */
export function arenaAssets(coins: ArenaCoin[]) {
  const used = coins.map((c) => ({
    feed: c.feed,
    lazerId: c.lazerId,
    exponent: c.exponent,
    enabled: true,
  }));
  const empty = {
    feed: PublicKey.default,
    lazerId: 0,
    exponent: 0,
    enabled: false,
  };
  return [...used, ...Array(10 - used.length).fill(empty)];
}

/** Feeds for finalize_match's remaining accounts, in arena index order. */
export const arenaFeeds = (coins: ArenaCoin[]) => coins.map((c) => c.feed);
