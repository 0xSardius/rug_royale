import { readFileSync } from "fs";
import path from "path";
import { LiteSVM } from "litesvm";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import idl from "../target/idl/rug_royale.json";
import type { RugRoyale } from "../target/types/rug_royale";

export const PROGRAM_ID = new PublicKey(idl.address);

/** Fresh LiteSVM with the built program loaded, plus a funded payer. */
export function setup() {
  const svm = new LiteSVM();
  svm.addProgram(
    PROGRAM_ID,
    readFileSync(path.join(__dirname, "../target/deploy/rug_royale.so"))
  );
  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
  // The provider is only used to build instructions; transactions go through svm.sendTransaction.
  const provider = new AnchorProvider({} as any, new Wallet(payer), {});
  const program = new Program<RugRoyale>(idl as RugRoyale, provider);
  return { svm, payer, program };
}
