// The frozen v2 IDL (idl/rug_royale_v2.*), re-exported so every consumer reads one copy.
import { PublicKey } from "@solana/web3.js";
import { BorshCoder, Idl, convertIdlToCamelCase } from "@anchor-lang/core";
import idlJson from "../../../../idl/rug_royale_v2.json";
import type { RugRoyaleV2 } from "../../../../idl/rug_royale_v2";

export type { RugRoyaleV2 };
/** Raw JSON as committed; pass this to `new Program(...)`. */
export const IDL_JSON = idlJson as unknown as RugRoyaleV2;
/** camelCase IDL matching the RugRoyaleV2 type. */
export const IDL = convertIdlToCamelCase(
  idlJson as Idl
) as unknown as RugRoyaleV2;
export const PROGRAM_ID = new PublicKey(idlJson.address);
export const coder = new BorshCoder(IDL as unknown as Idl);
