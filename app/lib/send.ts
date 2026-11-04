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
  | { ok: false; cancelled: false; message: string; logs?: string[] };

const isUserRejection = (e: unknown) =>
  e instanceof Error && (/reject|cancel|denied/i.test(e.message) || e.name === "WalletSignTransactionError");

/**
 * Builds, signs (via the connected wallet), sends, and confirms. Program errors come back
 * as plain sentences (PRD §11); a wallet rejection is reported as `cancelled`, not an error.
 */
export async function sendIxs(
  connection: Connection,
  wallet: WalletContextState,
  ixs: TransactionInstruction[],
): Promise<SendOutcome> {
  if (!wallet.publicKey) return { ok: false, cancelled: false, message: "Connect a wallet first." };
  const tx = new Transaction().add(...ixs);
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    const signature = await wallet.sendTransaction(tx, connection);
    const conf = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (conf.value.err) {
      const info = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const logs = info?.meta?.logMessages ?? [];
      return { ok: false, cancelled: false, message: programErrorFromLogs(logs)?.message ?? "Transaction failed.", logs };
    }
    return { ok: true, signature };
  } catch (e) {
    if (isUserRejection(e)) return { ok: false, cancelled: true };
    const logs = e instanceof SendTransactionError ? ((await e.getLogs(connection).catch(() => [])) ?? []) : [];
    const fromLogs = programErrorFromLogs(logs)?.message;
    const raw = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      cancelled: false,
      message: fromLogs ?? (/insufficient|0x1\b/i.test(raw) ? "Not enough SOL for this transaction." : "Transaction failed."),
      logs,
    };
  }
}
