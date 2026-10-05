import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
} from "@solana/spl-token";
import { findMintAuthority } from "./pdas";

/** All demo mints (quote + coins) use 6 decimals, matching StonkFun coins (PRD §5). */
export const DEMO_DECIMALS = 6;

/**
 * Instructions that create one demo mint: Token-2022, no extensions (G3), mint authority
 * set straight to the MintAuthority PDA so no keypair ever holds it (G11). No freeze authority.
 * The `mint` keypair must co-sign. `rentLamports` = rent-exempt minimum for MINT_SIZE.
 */
export const createDemoMintIxs = (args: {
  programId: PublicKey;
  payer: PublicKey;
  mint: PublicKey;
  rentLamports: number;
}): TransactionInstruction[] => {
  const [authority] = findMintAuthority(args.programId);
  return [
    SystemProgram.createAccount({
      fromPubkey: args.payer,
      newAccountPubkey: args.mint,
      lamports: args.rentLamports,
      space: MINT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      args.mint,
      DEMO_DECIMALS,
      authority,
      null,
      TOKEN_2022_PROGRAM_ID
    ),
  ];
};

export { MINT_SIZE };
