import { PublicKey } from "@solana/web3.js";
import { u64Le } from "../pdas";

// Seeds mirror programs/rug_royale_v2/src/constants.rs.
const seed = (s: string) => Buffer.from(s);
const u16Le = (v: number) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
};

export const ORACLE_PROGRAM_ID = new PublicKey(
  "PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd"
);
export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

export const findProtocol = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([seed("protocol")], programId);

export const findArena = (programId: PublicKey, arenaId: number) =>
  PublicKey.findProgramAddressSync([seed("arena"), u16Le(arenaId)], programId);

export const findPlayerStats = (programId: PublicKey, wallet: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [seed("player"), wallet.toBuffer()],
    programId
  );

export const findMatch = (
  programId: PublicKey,
  creator: PublicKey,
  nonce: bigint
) =>
  PublicKey.findProgramAddressSync(
    [seed("match"), creator.toBuffer(), u64Le(nonce)],
    programId
  );

export const findPot = (programId: PublicKey, match: PublicKey) =>
  PublicKey.findProgramAddressSync([seed("pot"), match.toBuffer()], programId);

export const findProgramData = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_ID
  );

/** MagicBlock Pricing Oracle feed PDA for a Pyth Lazer id (spike 01). */
export const findPriceFeed = (lazerId: number) =>
  PublicKey.findProgramAddressSync(
    [seed("price_feed"), seed("pyth-lazer"), seed(String(lazerId))],
    ORACLE_PROGRAM_ID
  );

// MagicBlock delegation (v2 PRD §6.2 delegate_match). Seeds from ephemeral-rollups-sdk
// (DELEGATE_BUFFER_TAG, DELEGATION_RECORD_TAG, DELEGATION_METADATA_TAG).
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

/** Temporary copy of the delegated account's data; a PDA of the *owner* program. */
export const findDelegationBuffer = (
  programId: PublicKey,
  delegated: PublicKey
) =>
  PublicKey.findProgramAddressSync(
    [seed("buffer"), delegated.toBuffer()],
    programId
  );

/** Owner program, validator and commit frequency of a delegation (Delegation Program PDA). */
export const findDelegationRecord = (delegated: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [seed("delegation"), delegated.toBuffer()],
    DELEGATION_PROGRAM_ID
  );

/** Seeds, rent payer and commit count of a delegation (Delegation Program PDA). */
export const findDelegationMetadata = (delegated: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [seed("delegation-metadata"), delegated.toBuffer()],
    DELEGATION_PROGRAM_ID
  );

/** MagicBlock's Magic program (built into the ER validator) and its intent queue account. */
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111"
);
