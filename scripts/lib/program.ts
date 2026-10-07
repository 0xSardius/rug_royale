import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { IDL_JSON, type RugRoyale } from "@rug-royale/sdk";

/** Program client for encoding instructions; scripts send through lib/tx.ts. */
export const programFor = (connection: Connection, payer: Keypair) =>
  new Program<RugRoyale>(
    IDL_JSON,
    new AnchorProvider(connection, new Wallet(payer), {
      commitment: "confirmed",
    })
  );
