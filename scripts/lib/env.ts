// Shared setup for off-chain scripts: .env loading, RPC connection, keypairs, coins.json I/O.
import { existsSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import idl from "../../idl/rug_royale.json";

export const ROOT = path.join(__dirname, "../..");
export const PROGRAM_ID = new PublicKey(idl.address);

const envFile = path.join(ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

export const connection = () => new Connection(RPC_URL, "confirmed");

const expandHome = (p: string) =>
  p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;

/** Reads a Solana CLI keypair file. `envVar` overrides the default path. */
export function loadKeypair(
  envVar = "KEYPAIR",
  fallback = "~/.config/solana/id.json"
): Keypair {
  const file = expandHome(process.env[envVar] ?? fallback);
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(file, "utf8")))
  );
}

// --- coins.json -----------------------------------------------------------

export const COINS_FILE = path.join(ROOT, "coins.json");

/** A real StonkFun coin and the devnet demo mint standing in for it (G10). */
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

export const readCoins = (): CoinsFile =>
  JSON.parse(readFileSync(COINS_FILE, "utf8"));

export const writeCoins = (c: CoinsFile) =>
  writeFileSync(COINS_FILE, JSON.stringify(c, null, 2) + "\n");

export const hasCoinsFile = () => existsSync(COINS_FILE);
