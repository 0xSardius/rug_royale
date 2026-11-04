import { Connection, Keypair, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider, Program } from "@anchor-lang/core";
import { IDL_JSON, type RugRoyale } from "@rug-royale/sdk";

/**
 * Instruction encoder only. Accounts are always passed explicitly via the SDK account maps,
 * and transactions are signed by the connected wallet in lib/send.ts, so this Program never
 * touches a connection or signs anything.
 */
const encoderWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
};

export const program = new Program<RugRoyale>(IDL_JSON, new AnchorProvider({} as Connection, encoderWallet, {}));
