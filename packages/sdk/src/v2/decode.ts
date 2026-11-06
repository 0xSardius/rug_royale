// v2 account decoders returning plain types: bigint for u64/i64, PublicKey, numeric enums,
// and `null` for unset pubkeys (the program stores Pubkey::default(), G9).
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { utils } from "@anchor-lang/core";
import { bnToBigInt as big } from "../decode";
import { IDL, coder } from "./idl";
import {
  MatchResult,
  MatchStatus,
  POT_ARENA_ID_OFFSET,
  POT_CREATOR_OFFSET,
  POT_OPPONENT_OFFSET,
  POT_SIZE,
  POT_STATUS_OFFSET,
  PotStatus,
} from "./layout";

const optKey = (k: PublicKey) => (k.equals(PublicKey.default) ? null : k);
const variant = <T extends number>(v: object, names: string[]) =>
  names.indexOf(Object.keys(v)[0].toLowerCase()) as T;
const POT_STATUS = ["open", "active", "settled", "cancelled", "refunded"];
const MATCH_STATUS = ["open", "active", "finalized"];

export interface Protocol {
  admin: PublicKey;
  treasury: PublicKey;
  maxEntryLamports: bigint;
  matchFeeLamports: bigint;
  settlerTipLamports: bigint;
  maxRakeBps: number;
  paused: boolean;
}

export interface ArenaAsset {
  feed: PublicKey;
  lazerId: number;
  /** |exponent|: real price = raw * 10^-exponent. */
  exponent: number;
  enabled: boolean;
}

export interface Arena {
  arenaId: number;
  mode: number;
  paused: boolean;
  /** Only the first `assetCount` entries are used. */
  assets: ArenaAsset[];
  windows: number[];
  /** Micro-USD. */
  bankroll: bigint;
  minEntryLamports: bigint;
  maxEntryLamports: bigint;
  tradeFeeBps: number;
  rakeBps: number;
  maxPriceAgeS: number;
  startDelaySecs: number;
  freerollDailyCap: number;
}

export interface PlayerStats {
  wallet: PublicKey;
  day: number;
  freerollsToday: number;
  matches: number;
  wins: number;
  ties: number;
}

export interface Pot {
  status: PotStatus;
  arenaId: number;
  windowSecs: number;
  entryLamports: bigint;
  sponsoredLamports: bigint;
  matchFeeLamports: bigint;
  feeShareLamports: bigint;
  settlerTipLamports: bigint;
  rakeBps: number;
  joinDeadline: bigint;
  /** 0 until joined. */
  endTs: bigint;
  matchAccount: PublicKey;
  creator: PublicKey;
  opponent: PublicKey | null;
  allowedOpponent: PublicKey | null;
  sponsor: PublicKey | null;
  /** ER validator identity (region) the match is delegated to. */
  validator: PublicKey;
}

export interface Seat {
  player: PublicKey | null;
  sessionKey: PublicKey | null;
  /** Micro-USD. */
  cash: bigint;
  /** Per arena asset, 1e-6 token units. */
  qty: bigint[];
  trades: number;
}

export interface Match {
  status: MatchStatus;
  result: MatchResult;
  assetCount: number;
  arenaId: number;
  nonce: bigint;
  startTs: bigint;
  endTs: bigint;
  tradeFeeBps: number;
  maxPriceAgeS: number;
  pot: PublicKey;
  /** [creator, opponent] */
  seats: [Seat, Seat];
  /** Micro-USD; 0 until finalized. */
  finalValues: [bigint, bigint];
  /** Raw feed price per asset used at finalize; 0 = not marked (unheld). */
  markPrices: bigint[];
  markPublishTime: bigint;
}

export function decodeProtocol(data: Buffer): Protocol {
  const p = coder.accounts.decode("protocol", data);
  return {
    admin: p.admin,
    treasury: p.treasury,
    maxEntryLamports: big(p.maxEntryLamports),
    matchFeeLamports: big(p.matchFeeLamports),
    settlerTipLamports: big(p.settlerTipLamports),
    maxRakeBps: p.maxRakeBps,
    paused: p.paused,
  };
}

export function decodeArena(data: Buffer): Arena {
  const a = coder.accounts.decode("arena", data);
  return {
    arenaId: a.arenaId,
    mode: a.mode,
    paused: a.paused,
    assets: a.assets.slice(0, a.assetCount).map((x: any) => ({
      feed: x.feed,
      lazerId: x.lazerId,
      exponent: x.exponent,
      enabled: x.enabled,
    })),
    windows: a.windows.filter((w: number) => w > 0),
    bankroll: big(a.bankroll),
    minEntryLamports: big(a.minEntryLamports),
    maxEntryLamports: big(a.maxEntryLamports),
    tradeFeeBps: a.tradeFeeBps,
    rakeBps: a.rakeBps,
    maxPriceAgeS: a.maxPriceAgeS,
    startDelaySecs: a.startDelaySecs,
    freerollDailyCap: a.freerollDailyCap,
  };
}

export function decodePlayerStats(data: Buffer): PlayerStats {
  const s = coder.accounts.decode("playerStats", data);
  return {
    wallet: s.wallet,
    day: s.day,
    freerollsToday: s.freerollsToday,
    matches: s.matches,
    wins: s.wins,
    ties: s.ties,
  };
}

export function decodePot(data: Buffer): Pot {
  const p = coder.accounts.decode("pot", data);
  return {
    status: variant<PotStatus>(p.status, POT_STATUS),
    arenaId: p.arenaId,
    windowSecs: p.windowSecs,
    entryLamports: big(p.entryLamports),
    sponsoredLamports: big(p.sponsoredLamports),
    matchFeeLamports: big(p.matchFeeLamports),
    feeShareLamports: big(p.feeShareLamports),
    settlerTipLamports: big(p.settlerTipLamports),
    rakeBps: p.rakeBps,
    joinDeadline: big(p.joinDeadline),
    endTs: big(p.endTs),
    matchAccount: p.matchAccount,
    creator: p.creator,
    opponent: optKey(p.opponent),
    allowedOpponent: optKey(p.allowedOpponent),
    sponsor: optKey(p.sponsor),
    validator: p.validator,
  };
}

const decodeSeat = (s: any): Seat => ({
  player: optKey(s.player),
  sessionKey: optKey(s.sessionKey),
  cash: big(s.cash),
  qty: s.qty.map(big),
  trades: s.trades,
});

/**
 * Decodes Match data from the base layer or from an ER endpoint (same layout). While the
 * match is delegated, the base-layer copy is stale: read it from the ER (see magicblock.ts).
 */
export function decodeMatch(data: Buffer): Match {
  const m = coder.accounts.decode("match", data);
  return {
    status: variant<MatchStatus>(m.status, MATCH_STATUS),
    result: m.result as MatchResult,
    assetCount: m.assetCount,
    arenaId: m.arenaId,
    nonce: big(m.nonce),
    startTs: big(m.startTs),
    endTs: big(m.endTs),
    tradeFeeBps: m.tradeFeeBps,
    maxPriceAgeS: m.maxPriceAgeS,
    pot: m.pot,
    seats: [decodeSeat(m.seats[0]), decodeSeat(m.seats[1])],
    finalValues: [big(m.finalValues[0]), big(m.finalValues[1])],
    markPrices: m.markPrices.map(big),
    markPublishTime: big(m.markPublishTime),
  };
}

// ---------------------------------------------------------------------------
// Lobby filters (getProgramAccounts on the base layer; Pot is never delegated)

const b58 = (bytes: Uint8Array) => utils.bytes.bs58.encode(bytes);
const u16le = (v: number) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
};

const POT_DISCRIMINATOR = Uint8Array.from(
  IDL.accounts.find((a) => a.name === "pot")!.discriminator
);
const isPot: GetProgramAccountsFilter = {
  memcmp: { offset: 0, bytes: b58(POT_DISCRIMINATOR) },
};

/** Pots with a given status, optionally in one arena. */
export function potFilters(
  status: PotStatus,
  arenaId?: number
): GetProgramAccountsFilter[] {
  const f: GetProgramAccountsFilter[] = [
    { dataSize: POT_SIZE },
    isPot,
    {
      memcmp: { offset: POT_STATUS_OFFSET, bytes: b58(Uint8Array.of(status)) },
    },
  ];
  if (arenaId !== undefined)
    f.push({
      memcmp: { offset: POT_ARENA_ID_OFFSET, bytes: b58(u16le(arenaId)) },
    });
  return f;
}

/** The open lobby: Open pots, optionally in one arena. */
export const openLobbyFilters = (arenaId?: number) =>
  potFilters(PotStatus.Open, arenaId);

/** Pots where `player` is the creator or the opponent (run both for "my matches"). */
export function playerPotFilters(
  player: PublicKey,
  role: "creator" | "opponent"
): GetProgramAccountsFilter[] {
  return [
    { dataSize: POT_SIZE },
    isPot,
    {
      memcmp: {
        offset: role === "creator" ? POT_CREATOR_OFFSET : POT_OPPONENT_OFFSET,
        bytes: player.toBase58(),
      },
    },
  ];
}

/** Applies getProgramAccounts filters locally (tests, and client-side refiltering). */
export function matchesFilters(
  data: Uint8Array,
  filters: GetProgramAccountsFilter[]
): boolean {
  return filters.every((f) => {
    if ("dataSize" in f) return data.length === f.dataSize;
    const want = utils.bytes.bs58.decode(f.memcmp.bytes as string);
    const got = data.subarray(f.memcmp.offset, f.memcmp.offset + want.length);
    return want.length === got.length && want.every((b, i) => b === got[i]);
  });
}

const ARENA_DISCRIMINATOR = Uint8Array.from(
  IDL.accounts.find((a) => a.name === "arena")!.discriminator
);

/** Every Arena account (for tooling: feed monitor, admin scripts). */
export const arenaFilters = (): GetProgramAccountsFilter[] => [
  { memcmp: { offset: 0, bytes: b58(ARENA_DISCRIMINATOR) } },
];
