"use client";

import { Keypair, PublicKey } from "@solana/web3.js";

/**
 * Browser session keys for v2 seats (PRD §11: generated in memory). A key is registered in its
 * seat at create_match / join_match and can sign only `trade` for that match while its window
 * is open (V5). It lives in this module only, so a full page reload loses it and the seat falls
 * back to wallet-signed trades. It never needs SOL: ER transactions are gasless.
 */
const keys = new Map<string, Keypair>();

export function newSessionKey(): Keypair {
  return Keypair.generate();
}

/** Remember the session key for a match after its create/join transaction confirmed. */
export function storeSessionKey(matchAccount: PublicKey, kp: Keypair) {
  keys.set(matchAccount.toBase58(), kp);
}

export function getSessionKey(matchAccount: PublicKey): Keypair | null {
  return keys.get(matchAccount.toBase58()) ?? null;
}
