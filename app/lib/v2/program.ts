import { Connection, Keypair, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider, Program } from "@anchor-lang/core";
import { v2 } from "@rug-royale/sdk";

/**
 * v2 instruction encoder only (see lib/program.ts): accounts come from the SDK builders and
 * the connected wallet (or the in-memory session key) signs, so this never touches a
 * connection.
 */
const encoderWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
};

export const programV2 = new Program<v2.RugRoyaleV2>(
  v2.IDL_JSON,
  new AnchorProvider({} as Connection, encoderWallet, {}),
);

export const PROGRAM_ID_V2 = programV2.programId;

/** Base cluster for MagicBlock endpoints; matches lib/config.ts CLUSTER. */
export const MB_CLUSTER: v2.Cluster = "devnet";

/** Display names for on-chain arenas (presentation only; the Arena account is the truth). */
const ARENA_NAMES: Record<number, string> = { 1: "Solana Arena", 2: "Test Arena" };
export const arenaName = (id: number) => ARENA_NAMES[id] ?? `Arena ${id}`;

/** Coin metadata for an arena asset, matched by feed (arena index order is on-chain). */
export const coinForFeed = (feed: { equals(o: unknown): boolean }) =>
  v2.SOLANA_ARENA.find((c) => feed.equals(c.feed));
