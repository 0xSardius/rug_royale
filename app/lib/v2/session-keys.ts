"use client";

import { Keypair, PublicKey } from "@solana/web3.js";

/**
 * Browser session keys for v2 seats. A key is registered in its seat at create_match /
 * join_match and can sign only `trade` for that match while its window is open (V5). It holds
 * no SOL (ER transactions are gasless), so a leaked key can't move funds.
 *
 * Kept in memory and in localStorage (decided 2026-11-26, amending PRD §11's in-memory-only
 * rule), so a reload or a new tab in the same browser keeps trading without popups. Wallets
 * can't sign ER trades as a fallback in practice: Phantom simulates against the base layer,
 * where the match is delegated, and rejects the transaction. Entries are pruned after
 * MAX_AGE_MS; the key is useless after its match anyway.
 */
const PREFIX = "rr:v2:session:";
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const keys = new Map<string, Keypair>();

interface Stored {
  sk: number[];
  savedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let pruned = false;
function pruneOld(s: Storage) {
  if (pruned) return;
  pruned = true;
  try {
    const now = Date.now();
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const v = JSON.parse(s.getItem(k) ?? "null") as Stored | null;
      if (!v || now - v.savedAt > MAX_AGE_MS) s.removeItem(k);
    }
  } catch {
    // Storage blocked or corrupt: nothing to prune.
  }
}

export function newSessionKey(): Keypair {
  return Keypair.generate();
}

/** Remember the session key for a match after its create/join transaction confirmed. */
export function storeSessionKey(matchAccount: PublicKey, kp: Keypair) {
  const id = matchAccount.toBase58();
  keys.set(id, kp);
  const s = storage();
  if (!s) return;
  try {
    pruneOld(s);
    s.setItem(PREFIX + id, JSON.stringify({ sk: Array.from(kp.secretKey), savedAt: Date.now() } satisfies Stored));
  } catch {
    // Private mode / quota: the key still works in memory for this tab.
  }
}

export function getSessionKey(matchAccount: PublicKey): Keypair | null {
  const id = matchAccount.toBase58();
  const mem = keys.get(id);
  if (mem) return mem;
  const s = storage();
  if (!s) return null;
  try {
    const v = JSON.parse(s.getItem(PREFIX + id) ?? "null") as Stored | null;
    if (!v?.sk || v.sk.length !== 64) return null;
    const kp = Keypair.fromSecretKey(Uint8Array.from(v.sk));
    keys.set(id, kp);
    return kp;
  } catch {
    return null;
  }
}
