"use client";

import { Connection, SendTransactionError, Transaction, type TransactionInstruction } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { programErrorFromLogs } from "@rug-royale/sdk";

/** Message for an exception thrown before the wallet was asked to sign (e.g. building the ix). */
export const unexpectedError = (e: unknown) => {
  console.error(e);
  return `Couldn't prepare the transaction: ${e instanceof Error ? e.message : String(e)}`;
};

export type SendOutcome =
  | { ok: true; signature: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string; logs?: string[]; signature?: string };

/** Progress callback: "signing" while the wallet popup is open, "confirming" once sent. */
export type SendStage = "signing" | "confirming";

const isUserRejection = (e: unknown) =>
  e instanceof Error && (/reject|cancel|denied/i.test(e.message) || e.name === "WalletSignTransactionError");

const WALLET_TIMEOUT_MS = 120_000;
const CONFIRM_TIMEOUT_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Timeout extends Error {}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Timeout()), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/**
 * Builds, signs (via the connected wallet), sends, and confirms. Program errors come back
 * as plain sentences (PRD §11); a wallet rejection is reported as `cancelled`, not an error.
 * Confirmation polls getSignatureStatuses over HTTP (no websocket), and both the wallet step
 * and the confirmation have timeouts, so a stuck wallet popup or a dropped transaction ends
 * with a message instead of a spinner that never stops.
 */
export async function sendIxs(
  connection: Connection,
  wallet: WalletContextState,
  ixs: TransactionInstruction[],
  /** Maps program logs to an error (v1 by default; v2 pages pass `v2.programErrorFromLogs`). */
  errorFromLogs: (logs: string[]) => { message: string } | null = programErrorFromLogs,
  onStage?: (stage: SendStage, signature?: string) => void,
): Promise<SendOutcome> {
  if (!wallet.publicKey) return { ok: false, cancelled: false, message: "Connect a wallet first." };
  const tx = new Transaction().add(...ixs);
  let signature: string;
  let lastValidBlockHeight: number;
  try {
    const latest = await connection.getLatestBlockhash("confirmed");
    lastValidBlockHeight = latest.lastValidBlockHeight;
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = wallet.publicKey;
    onStage?.("signing");
    signature = await withTimeout(wallet.sendTransaction(tx, connection), WALLET_TIMEOUT_MS);
  } catch (e) {
    if (e instanceof Timeout) {
      return {
        ok: false,
        cancelled: false,
        message:
          "Your wallet didn't respond. Open it, close any pending approval (an older request can block new ones), and try again.",
      };
    }
    if (isUserRejection(e)) return { ok: false, cancelled: true };
    const logs = e instanceof SendTransactionError ? ((await e.getLogs(connection).catch(() => [])) ?? []) : [];
    const fromLogs = errorFromLogs(logs)?.message;
    const raw = e instanceof Error ? e.message : String(e);
    console.error(e);
    return {
      ok: false,
      cancelled: false,
      message: fromLogs ?? (/insufficient|0x1\b/i.test(raw) ? "Not enough SOL for this transaction." : `Transaction failed: ${raw}`),
      logs,
    };
  }

  onStage?.("confirming", signature);
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < CONFIRM_TIMEOUT_MS; i++) {
    const st = (await connection.getSignatureStatuses([signature]).catch(() => null))?.value[0];
    if (st?.err) {
      const info = await connection
        .getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
        .catch(() => null);
      const logs = info?.meta?.logMessages ?? [];
      return { ok: false, cancelled: false, message: errorFromLogs(logs)?.message ?? "Transaction failed.", logs, signature };
    }
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return { ok: true, signature };
    // Every ~5 s, stop early if the blockhash expired without the transaction landing.
    if (i % 5 === 4) {
      const height = await connection.getBlockHeight("confirmed").catch(() => 0);
      if (height > lastValidBlockHeight) {
        return { ok: false, cancelled: false, message: "The transaction expired before it landed. Try again.", signature };
      }
    }
    await sleep(1_000);
  }
  return {
    ok: false,
    cancelled: false,
    message: "Still not confirmed after 90 s. Check the transaction on Solana Explorer before retrying.",
    signature,
  };
}
