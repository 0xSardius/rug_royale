import { PublicKey } from "@solana/web3.js";

// Seeds mirror programs/rug_royale/src/constants.rs.
const seed = (s: string) => Buffer.from(s);

/**
 * u64 as 8 little-endian bytes (`nonce.to_le_bytes()` in Rust). DataView, not
 * Buffer.writeBigUInt64LE: the browser Buffer polyfill bundled by Next.js lacks the BigInt
 * methods, so create_duel threw before Phantom was ever asked to sign.
 */
export const u64Le = (v: bigint) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, v, true);
  return bytes;
};

export const findConfig = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([seed("config")], programId);

export const findMintAuthority = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([seed("mint_authority")], programId);

export const findDuel = (
  programId: PublicKey,
  creator: PublicKey,
  nonce: bigint
) => {
  return PublicKey.findProgramAddressSync(
    [seed("duel"), creator.toBuffer(), u64Le(nonce)],
    programId
  );
};

export const findEscrow = (programId: PublicKey, duel: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [seed("escrow"), duel.toBuffer()],
    programId
  );

export const findVaultAuthority = (
  programId: PublicKey,
  duel: PublicKey,
  player: PublicKey
) =>
  PublicKey.findProgramAddressSync(
    [seed("vault"), duel.toBuffer(), player.toBuffer()],
    programId
  );

export const findPool = (programId: PublicKey, duel: PublicKey) =>
  PublicKey.findProgramAddressSync([seed("pool"), duel.toBuffer()], programId);
