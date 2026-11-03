// Full account maps for v2 instructions, keyed by the IDL's camelCase names, for
// `program.methods.<ix>(...).accountsStrict(...)`. Must match idl/rug_royale_v2.json.
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  findArena,
  findMatch,
  findPlayerStats,
  findPot,
  findProgramData,
  findProtocol,
} from "./pdas";

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

/** Accounts for create_match. Derives the match from creator + nonce and the pot from the match. */
export const createMatchAccounts = (a: {
  programId: PublicKey;
  creator: PublicKey;
  arenaId: number;
  nonce: bigint;
}) => {
  const [matchAccount] = findMatch(a.programId, a.creator, a.nonce);
  const [pot] = findPot(a.programId, matchAccount);
  return {
    matchAccount,
    pot,
    accounts: {
      creator: a.creator,
      protocol: findProtocol(a.programId)[0],
      arena: findArena(a.programId, a.arenaId)[0],
      matchAccount,
      pot,
      creatorStats: findPlayerStats(a.programId, a.creator)[0],
      systemProgram: SystemProgram.programId,
    },
  };
};

export const sponsorMatchAccounts = (a: {
  programId: PublicKey;
  sponsor: PublicKey;
  pot: PublicKey;
}) => ({
  sponsor: a.sponsor,
  protocol: findProtocol(a.programId)[0],
  pot: a.pot,
  systemProgram: SystemProgram.programId,
});

/** Accounts for join_match. `arenaId` comes from the pot (Pot.arena_id). */
export const joinMatchAccounts = (a: {
  programId: PublicKey;
  opponent: PublicKey;
  creator: PublicKey;
  matchAccount: PublicKey;
  pot: PublicKey;
  arenaId: number;
}) => ({
  opponent: a.opponent,
  protocol: findProtocol(a.programId)[0],
  arena: findArena(a.programId, a.arenaId)[0],
  matchAccount: a.matchAccount,
  pot: a.pot,
  creatorStats: findPlayerStats(a.programId, a.creator)[0],
  opponentStats: findPlayerStats(a.programId, a.opponent)[0],
  systemProgram: SystemProgram.programId,
});
