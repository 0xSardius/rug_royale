// Account decoders returning plain types: bigint for u64/i64, PublicKey, numeric enums,
// and `null` for unset pubkeys (the program stores Pubkey::default(), G9).
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { utils } from "@anchor-lang/core";
import { coder, IDL } from "./idl";
import {
  DUEL_CREATOR_OFFSET,
  DUEL_OPPONENT_OFFSET,
  DUEL_STATUS_OFFSET,
  DuelResult,
  DuelStatus,
} from "./layout";

type BNLike = { toString(base?: number): string };
/**
 * BN → bigint via hex. Do not use `BigInt(bn.toString())`: on Node 24 (V8 Maglev/Turbofan)
 * bn.js's base-10 `toString()` is sometimes miscompiled once hot and returns only the low
 * 7 digits (e.g. 11036329022 → "6329022"). The hex path has no division loop.
 */
export const bnToBigInt = (v: BNLike): bigint => {
  const hex = v.toString(16);
  return hex.startsWith("-")
    ? -BigInt("0x" + hex.slice(1))
    : BigInt("0x" + hex);
};
const big = bnToBigInt;
const optKey = (k: PublicKey) => (k.equals(PublicKey.default) ? null : k);
/** Anchor decodes enums as `{ open: {} }`; map the variant name to its index. */
const variant = <T extends number>(v: object, names: string[]) =>
  names.indexOf(Object.keys(v)[0].toLowerCase()) as T;

const STATUS_NAMES = ["open", "active", "settled", "cancelled"];

export interface Duel {
  status: DuelStatus;
  result: DuelResult;
  tier: number;
  closed: boolean;
  bump: number;
  windowSecs: number;
  nonce: bigint;
  entryLamports: bigint;
  sponsoredLamports: bigint;
  bankroll: bigint;
  /** Creator final value, raw quote units (0 until settled). */
  finalA: bigint;
  /** Opponent final value, raw quote units (0 until settled). */
  finalB: bigint;
  joinDeadline: bigint;
  startTs: bigint;
  endTs: bigint;
  creator: PublicKey;
  opponent: PublicKey | null;
  allowedOpponent: PublicKey | null;
  sponsor: PublicKey | null;
  coin: PublicKey;
  quoteMint: PublicKey;
}

export interface Pool {
  duel: PublicKey;
  coin: PublicKey;
  quoteReserve: bigint;
  tokenReserve: bigint;
  bump: number;
}

export interface Config {
  admin: PublicKey;
  treasury: PublicKey;
  quoteMint: PublicKey;
  allowedMints: PublicKey[];
  tiers: bigint[];
  windows: number[];
  poolSeedRatio: bigint;
  settlerTipLamports: bigint;
  maxEntryLamports: bigint;
  rakeBps: number;
  swapFeeBps: number;
  bump: number;
  mintAuthorityBump: number;
}

export function decodeDuel(data: Buffer): Duel {
  const d = coder.accounts.decode("duel", data);
  return {
    status: variant<DuelStatus>(d.status, STATUS_NAMES),
    result: d.result as DuelResult,
    tier: d.tier,
    closed: d.closed,
    bump: d.bump,
    windowSecs: d.windowSecs,
    nonce: big(d.nonce),
    entryLamports: big(d.entryLamports),
    sponsoredLamports: big(d.sponsoredLamports),
    bankroll: big(d.bankroll),
    finalA: big(d.finalA),
    finalB: big(d.finalB),
    joinDeadline: big(d.joinDeadline),
    startTs: big(d.startTs),
    endTs: big(d.endTs),
    creator: d.creator,
    opponent: optKey(d.opponent),
    allowedOpponent: optKey(d.allowedOpponent),
    sponsor: optKey(d.sponsor),
    coin: d.coin,
    quoteMint: d.quoteMint,
  };
}

export function decodePool(data: Buffer): Pool {
  const p = coder.accounts.decode("pool", data);
  return {
    duel: p.duel,
    coin: p.coin,
    quoteReserve: big(p.quoteReserve),
    tokenReserve: big(p.tokenReserve),
    bump: p.bump,
  };
}

export function decodeConfig(data: Buffer): Config {
  const c = coder.accounts.decode("config", data);
  return {
    admin: c.admin,
    treasury: c.treasury,
    quoteMint: c.quoteMint,
    allowedMints: c.allowedMints,
    tiers: c.tiers.map(big),
    windows: c.windows,
    poolSeedRatio: big(c.poolSeedRatio),
    settlerTipLamports: big(c.settlerTipLamports),
    maxEntryLamports: big(c.maxEntryLamports),
    rakeBps: c.rakeBps,
    swapFeeBps: c.swapFeeBps,
    bump: c.bump,
    mintAuthorityBump: c.mintAuthorityBump,
  };
}

// --- getProgramAccounts filters (REQ11 lobby, crank) -------------------------

const DUEL_DISCRIMINATOR = Buffer.from(
  IDL.accounts.find((a) => a.name === "duel")!.discriminator
);
const bs58 = utils.bytes.bs58;

const isDuel: GetProgramAccountsFilter = {
  memcmp: { offset: 0, bytes: bs58.encode(DUEL_DISCRIMINATOR) },
};

/** Duels in one status, e.g. the lobby (Open) or the crank (Active). */
export const duelsByStatus = (
  status: DuelStatus
): GetProgramAccountsFilter[] => [
  isDuel,
  { memcmp: { offset: DUEL_STATUS_OFFSET, bytes: bs58.encode([status]) } },
];

/** Duels where `player` is the creator. Combine with duelsAsOpponent for "My duels". */
export const duelsAsCreator = (
  player: PublicKey
): GetProgramAccountsFilter[] => [
  isDuel,
  { memcmp: { offset: DUEL_CREATOR_OFFSET, bytes: player.toBase58() } },
];

export const duelsAsOpponent = (
  player: PublicKey
): GetProgramAccountsFilter[] => [
  isDuel,
  { memcmp: { offset: DUEL_OPPONENT_OFFSET, bytes: player.toBase58() } },
];
