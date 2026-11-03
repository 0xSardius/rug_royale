// Full account maps for v2 instructions, keyed by the IDL's camelCase names, for
// `program.methods.<ix>(...).accountsStrict(...)`. Must match idl/rug_royale_v2.json.
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findArena, findProgramData, findProtocol } from "./pdas";

export const initProtocolAccounts = (a: {
  programId: PublicKey;
  admin: PublicKey;
  treasury: PublicKey;
}) => ({
  admin: a.admin,
  protocol: findProtocol(a.programId)[0],
  programData: findProgramData(a.programId)[0],
  treasury: a.treasury,
  systemProgram: SystemProgram.programId,
});

export const updateProtocolAccounts = (a: {
  programId: PublicKey;
  admin: PublicKey;
  treasury: PublicKey;
}) => ({
  admin: a.admin,
  protocol: findProtocol(a.programId)[0],
  treasury: a.treasury,
});

export const createArenaAccounts = (a: {
  programId: PublicKey;
  admin: PublicKey;
  arenaId: number;
}) => ({
  admin: a.admin,
  protocol: findProtocol(a.programId)[0],
  arena: findArena(a.programId, a.arenaId)[0],
  systemProgram: SystemProgram.programId,
});

export const updateArenaAccounts = (a: {
  programId: PublicKey;
  admin: PublicKey;
  arenaId: number;
}) => ({
  admin: a.admin,
  protocol: findProtocol(a.programId)[0],
  arena: findArena(a.programId, a.arenaId)[0],
});
