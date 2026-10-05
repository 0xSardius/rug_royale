// The frozen IDL (idl/ at the repo root), re-exported so every consumer reads one copy.
// The JSON uses PascalCase account names and snake_case fields; the generated TS type
// (and Anchor's Program) use camelCase. IDL is converted once here so the coder, the
// type, and every decode in this package agree.
import { PublicKey } from "@solana/web3.js";
import { BorshCoder, Idl, convertIdlToCamelCase } from "@anchor-lang/core";
import idlJson from "../../../idl/rug_royale.json";
import type { RugRoyale } from "../../../idl/rug_royale";

export type { RugRoyale };
/** Raw JSON as committed; pass this to `new Program(...)`, which converts it itself. */
export const IDL_JSON = idlJson as unknown as RugRoyale;
/** camelCase IDL matching the RugRoyale type. */
export const IDL = convertIdlToCamelCase(
  idlJson as Idl
) as unknown as RugRoyale;
export const PROGRAM_ID = new PublicKey(idlJson.address);
export const coder = new BorshCoder(IDL as unknown as Idl);
