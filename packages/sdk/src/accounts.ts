// Full account maps for every instruction, keyed by the IDL's camelCase names, for use
// with `program.methods.<ix>(...).accountsStrict(...)`. Passing every account explicitly
// avoids Anchor's client-side PDA resolution, which needs an RPC fetch for seeds that
// read Duel fields. Must match idl/rug_royale.json.
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  findConfig,
  findDuel,
  findEscrow,
  findMintAuthority,
  findPool,
  findVaultAuthority,
} from "./pdas";

/** ATA owned by a PDA (vault authority or pool), so owner-off-curve is always allowed. */
export const pdaAta = (
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram = TOKEN_2022_PROGRAM_ID
) => getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);

/** Everything needed to derive a duel's accounts. `opponent` is unset until join. */
export interface DuelRef {
  programId: PublicKey;
  duel: PublicKey;
  creator: PublicKey;
  opponent?: PublicKey;
  quoteMint: PublicKey;
  coinMint: PublicKey;
  tokenProgram?: PublicKey;
}

/** Derived addresses for one player's vaults in a duel. */
export const playerVaults = (ref: DuelRef, player: PublicKey) => {
  const tp = ref.tokenProgram ?? TOKEN_2022_PROGRAM_ID;
  const [authority] = findVaultAuthority(ref.programId, ref.duel, player);
  return {
    authority,
    quote: pdaAta(ref.quoteMint, authority, tp),
    coin: pdaAta(ref.coinMint, authority, tp),
  };
};

/** Derived addresses for the duel's pool and its two token accounts. */
export const poolAccounts = (ref: DuelRef) => {
  const tp = ref.tokenProgram ?? TOKEN_2022_PROGRAM_ID;
  const [pool] = findPool(ref.programId, ref.duel);
  return {
    pool,
    quote: pdaAta(ref.quoteMint, pool, tp),
    coin: pdaAta(ref.coinMint, pool, tp),
  };
};

const requireOpponent = (ref: DuelRef) => {
  if (!ref.opponent)
    throw new Error("DuelRef.opponent is required for this instruction");
  return ref.opponent;
};

export const initConfigAccounts = (programId: PublicKey, admin: PublicKey) => ({
  admin,
  config: findConfig(programId)[0],
  systemProgram: SystemProgram.programId,
});

/** Accounts for create_duel. Derives the duel address from creator + nonce. */
export const createDuelAccounts = (args: {
  programId: PublicKey;
  creator: PublicKey;
  nonce: bigint;
  quoteMint: PublicKey;
  coinMint: PublicKey;
  tokenProgram?: PublicKey;
}) => {
  const [duel] = findDuel(args.programId, args.creator, args.nonce);
  const ref: DuelRef = { ...args, duel };
  const v = playerVaults(ref, args.creator);
  const p = poolAccounts(ref);
  return {
    duel,
    accounts: {
      creator: args.creator,
      config: findConfig(args.programId)[0],
      duel,
      escrow: findEscrow(args.programId, duel)[0],
      creatorVaultAuthority: v.authority,
      creatorQuoteVault: v.quote,
      creatorCoinVault: v.coin,
      pool: p.pool,
      poolQuoteVault: p.quote,
      poolCoinVault: p.coin,
      quoteMint: args.quoteMint,
      coinMint: args.coinMint,
      mintAuthority: findMintAuthority(args.programId)[0],
      tokenProgram: args.tokenProgram ?? TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
  };
};

export const sponsorPrizeAccounts = (ref: DuelRef, sponsor: PublicKey) => ({
  sponsor,
  duel: ref.duel,
  escrow: findEscrow(ref.programId, ref.duel)[0],
  systemProgram: SystemProgram.programId,
});

export const joinDuelAccounts = (ref: DuelRef, opponent: PublicKey) => {
  const c = playerVaults(ref, ref.creator);
  const o = playerVaults(ref, opponent);
  return {
    opponent,
    config: findConfig(ref.programId)[0],
    duel: ref.duel,
    escrow: findEscrow(ref.programId, ref.duel)[0],
    creatorVaultAuthority: c.authority,
    creatorQuoteVault: c.quote,
    opponentVaultAuthority: o.authority,
    opponentQuoteVault: o.quote,
    opponentCoinVault: o.coin,
    quoteMint: ref.quoteMint,
    coinMint: ref.coinMint,
    mintAuthority: findMintAuthority(ref.programId)[0],
    tokenProgram: ref.tokenProgram ?? TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
};

export const swapAccounts = (ref: DuelRef, player: PublicKey) => {
  const v = playerVaults(ref, player);
  const p = poolAccounts(ref);
  return {
    player,
    duel: ref.duel,
    pool: p.pool,
    vaultAuthority: v.authority,
    playerQuoteVault: v.quote,
    playerCoinVault: v.coin,
    poolQuoteVault: p.quote,
    poolCoinVault: p.coin,
    quoteMint: ref.quoteMint,
    coinMint: ref.coinMint,
    tokenProgram: ref.tokenProgram ?? TOKEN_2022_PROGRAM_ID,
  };
};

export const settleAccounts = (
  ref: DuelRef,
  settler: PublicKey,
  treasury: PublicKey
) => {
  const opponent = requireOpponent(ref);
  const c = playerVaults(ref, ref.creator);
  const o = playerVaults(ref, opponent);
  return {
    settler,
    config: findConfig(ref.programId)[0],
    duel: ref.duel,
    pool: findPool(ref.programId, ref.duel)[0],
    escrow: findEscrow(ref.programId, ref.duel)[0],
    creatorVaultAuthority: c.authority,
    opponentVaultAuthority: o.authority,
    creatorQuoteVault: c.quote,
    creatorCoinVault: c.coin,
    opponentQuoteVault: o.quote,
    opponentCoinVault: o.coin,
    quoteMint: ref.quoteMint,
    coinMint: ref.coinMint,
    treasury,
    creator: ref.creator,
    opponent,
    tokenProgram: ref.tokenProgram ?? TOKEN_2022_PROGRAM_ID,
  };
};

/** `sponsor` must be passed (as Duel.sponsor) when sponsored_lamports > 0, else null. */
export const cancelDuelAccounts = (
  ref: DuelRef,
  caller: PublicKey,
  sponsor: PublicKey | null
) => ({
  caller,
  duel: ref.duel,
  escrow: findEscrow(ref.programId, ref.duel)[0],
  creator: ref.creator,
  sponsor,
});

/** Opponent accounts are null for a Cancelled duel (nobody joined). */
export const closeDuelAccounts = (ref: DuelRef, caller: PublicKey) => {
  const c = playerVaults(ref, ref.creator);
  const o = ref.opponent ? playerVaults(ref, ref.opponent) : null;
  const p = poolAccounts(ref);
  return {
    caller,
    duel: ref.duel,
    escrow: findEscrow(ref.programId, ref.duel)[0],
    pool: p.pool,
    creator: ref.creator,
    opponent: ref.opponent ?? null,
    creatorVaultAuthority: c.authority,
    opponentVaultAuthority: o?.authority ?? null,
    creatorQuoteVault: c.quote,
    creatorCoinVault: c.coin,
    opponentQuoteVault: o?.quote ?? null,
    opponentCoinVault: o?.coin ?? null,
    poolQuoteVault: p.quote,
    poolCoinVault: p.coin,
    quoteMint: ref.quoteMint,
    coinMint: ref.coinMint,
    tokenProgram: ref.tokenProgram ?? TOKEN_2022_PROGRAM_ID,
  };
};
