import { PublicKey } from "@solana/web3.js";

// Seeds mirror programs/rug_royale/src/constants.rs.
const seed = (s: string) => Buffer.from(s);

export const findConfig = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([seed("config")], programId);

export const findMintAuthority = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([seed("mint_authority")], programId);

export const findDuel = (
  programId: PublicKey,
  creator: PublicKey,
  nonce: bigint
) => {
  const n = Buffer.alloc(8);
  n.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [seed("duel"), creator.toBuffer(), n],
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
