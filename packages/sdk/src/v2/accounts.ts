// Full account maps for v2 instructions, keyed by the IDL's camelCase names, for
// `program.methods.<ix>(...).accountsStrict(...)`. Must match idl/rug_royale_v2.json.
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  findArena,
  findDelegationBuffer,
  findDelegationMetadata,
  findDelegationRecord,
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

/**
 * Accounts for cancel_match. Pass `sponsor: null` when the pot has no sponsor
 * (Pot.sponsor == default); never pass the default pubkey as a writable account.
 */
export const cancelMatchAccounts = (a: {
  programId: PublicKey;
  caller: PublicKey;
  pot: PublicKey;
  creator: PublicKey;
  sponsor: PublicKey | null;
  treasury: PublicKey;
}) => ({
  caller: a.caller,
  protocol: findProtocol(a.programId)[0],
  pot: a.pot,
  creator: a.creator,
  sponsor: a.sponsor,
  treasury: a.treasury,
});

/** Accounts for delegate_match (the `#[delegate]` macro's buffer/record/metadata included). */
export const delegateMatchAccounts = (a: {
  programId: PublicKey;
  payer: PublicKey;
  matchAccount: PublicKey;
}) => ({
  payer: a.payer,
  pot: findPot(a.programId, a.matchAccount)[0],
  bufferMatchAccount: findDelegationBuffer(a.programId, a.matchAccount)[0],
  delegationRecordMatchAccount: findDelegationRecord(a.matchAccount)[0],
  delegationMetadataMatchAccount: findDelegationMetadata(a.matchAccount)[0],
  matchAccount: a.matchAccount,
  ownerProgram: a.programId,
  delegationProgram: DELEGATION_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
});

/** Accounts for trade (sent to the match's ER endpoint). `signer` = wallet or session key. */
export const tradeAccounts = (a: {
  programId: PublicKey;
  signer: PublicKey;
  matchAccount: PublicKey;
  arenaId: number;
  priceFeed: PublicKey;
}) => ({
  signer: a.signer,
  matchAccount: a.matchAccount,
  arena: findArena(a.programId, a.arenaId)[0],
  priceFeed: a.priceFeed,
});

/**
 * Accounts for finalize_match (sent to the match's ER endpoint). Pass the arena's feeds for
 * every asset 0..asset_count, in index order, via `.remainingAccounts(finalizeFeeds(...))`.
 */
export const finalizeMatchAccounts = (a: {
  programId: PublicKey;
  payer: PublicKey;
  matchAccount: PublicKey;
  arenaId: number;
}) => ({
  payer: a.payer,
  matchAccount: a.matchAccount,
  arena: findArena(a.programId, a.arenaId)[0],
  magicProgram: MAGIC_PROGRAM_ID,
  magicContext: MAGIC_CONTEXT_ID,
});

export const finalizeFeeds = (feeds: PublicKey[]) =>
  feeds.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }));
