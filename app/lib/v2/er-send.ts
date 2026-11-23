"use client";

import { Connection, Keypair, Transaction, type TransactionInstruction } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { v2 } from "@rug-royale/sdk";
import type { SendOutcome } from "@/lib/send";

/** Who signs an ER transaction: the seat's session key (no popup) or the wallet (one popup). */
export type ErSigner = { kind: "session"; keypair: Keypair } | { kind: "wallet"; wallet: WalletContextState };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends a transaction to an Ephemeral Rollup. ER transactions are fee-free, so the signer is
 * also the fee payer and needs no SOL. Confirmation polls getSignatureStatuses instead of a
 * websocket subscription, which keeps it to plain HTTP against the ER endpoint.
 */
export async function sendErIxs(
  er: Connection,
  signer: ErSigner,
  ixs: TransactionInstruction[],
  timeoutMs = 15_000,
): Promise<SendOutcome> {
  const payer = signer.kind === "session" ? signer.keypair.publicKey : signer.wallet.publicKey;
  if (!payer) return { ok: false, cancelled: false, message: "Connect a wallet first." };

  let signature: string;
  try {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = payer;
    tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
    let signed: Transaction;
    if (signer.kind === "session") {
      tx.sign(signer.keypair);
      signed = tx;
    } else {
      if (!signer.wallet.signTransaction) {
        return { ok: false, cancelled: false, message: "This wallet can't sign transactions." };
      }
      signed = await signer.wallet.signTransaction(tx);
    }
    signature = await er.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/reject|cancel|denied/i.test(msg)) return { ok: false, cancelled: true };
    return { ok: false, cancelled: false, message: "Couldn't reach the rollup. Try again." };
  }

  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { value } = await er.getSignatureStatuses([signature]).catch(() => ({ value: [null] }));
    const st = value[0];
    if (st?.err) {
      const info = await er
        .getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
        .catch(() => null);
      const logs = info?.meta?.logMessages ?? [];
      return {
        ok: false,
        cancelled: false,
        message: v2.programErrorFromLogs(logs)?.message ?? "Trade failed.",
        logs,
      };
    }
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      return { ok: true, signature };
    }
    await sleep(150);
  }
  return { ok: false, cancelled: false, message: "The rollup didn't confirm in time. Check your position." };
}

/** sendErIxs plus the wall-clock time from send to confirmation, for the trade status line. */
export async function timedSendErIxs(...args: Parameters<typeof sendErIxs>) {
  const t0 = performance.now();
  const res = await sendErIxs(...args);
  return { res, ms: Math.round(performance.now() - t0) };
}
