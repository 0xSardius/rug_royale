// Sending for scripts: sign with a local keypair, confirm, and surface Anchor errors by name.
import {
  Connection,
  Keypair,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { programErrorFromLogs } from "@rug-royale/sdk";

export interface ScriptTxResult {
  ok: boolean;
  signature?: string;
  /** RugRoyaleError name, e.g. "DuelNotActive", when the program rejected the tx. */
  errorName?: string;
  logs: string[];
  error?: unknown;
}

export async function sendTx(
  connection: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
  extraSigners: Keypair[] = []
): Promise<ScriptTxResult> {
  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, ...extraSigners);
  try {
    const signature = await connection.sendRawTransaction(tx.serialize());
    const conf = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    if (!conf.value.err) return { ok: true, signature, logs: [] };
    const info = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = info?.meta?.logMessages ?? [];
    return {
      ok: false,
      signature,
      logs,
      errorName: programErrorFromLogs(logs)?.name,
      error: conf.value.err,
    };
  } catch (e) {
    const logs =
      e instanceof SendTransactionError
        ? (await e.getLogs(connection).catch(() => [])) ?? []
        : [];
    return {
      ok: false,
      logs,
      errorName: programErrorFromLogs(logs)?.name,
      error: e,
    };
  }
}

/** Simulates without sending; returns the program logs and any error name. */
export async function simulateTx(
  connection: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[]
) {
  const tx = new Transaction().add(...ixs);
  tx.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sim = await connection.simulateTransaction(tx);
  const logs = sim.value.logs ?? [];
  return {
    ok: !sim.value.err,
    logs,
    err: sim.value.err,
    errorName: programErrorFromLogs(logs)?.name,
    cu: sim.value.unitsConsumed,
  };
}
