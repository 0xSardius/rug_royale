// Shared setup for off-chain scripts: .env loading, RPC connection, keypairs, coins.json I/O.
import { existsSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { CoinsFile } from "@rug-royale/sdk";
import idl from "../../idl/rug_royale.json";

export type { Coin, CoinsFile } from "@rug-royale/sdk";

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

export const readCoins = (): CoinsFile =>
  JSON.parse(readFileSync(COINS_FILE, "utf8"));

export const writeCoins = (c: CoinsFile) =>
  writeFileSync(COINS_FILE, JSON.stringify(c, null, 2) + "\n");

export const hasCoinsFile = () => existsSync(COINS_FILE);
