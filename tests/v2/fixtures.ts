// v2 test fixtures (LiteSVM). Reuses v1's Sender/TxResult/assertions; v2 programs and
// account maps come from `@rug-royale/sdk` (`v2`).
import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import { LiteSVM } from "litesvm";
import { v2 } from "@rug-royale/sdk";
import { LiteSvmSender, TxResult } from "../fixtures";

export { expectError, expectOk } from "../fixtures";
export type { TxResult };

export interface V2Ctx {
  sender: LiteSvmSender;
  program: Program<v2.RugRoyaleV2>;
  programId: PublicKey;
}

/**
 * Fresh LiteSVM with the built v2 program loaded, plus MagicBlock's Delegation Program
 * (tests/v2/programs/dlp.so, dumped from devnet) so `delegate_match` runs for real.
 */
export function v2Ctx(): V2Ctx {
  const svm = new LiteSVM();
  svm.addProgram(
    v2.PROGRAM_ID,
    readFileSync(path.join(__dirname, "../../target/deploy/rug_royale_v2.so"))
  );
  const dlp = path.join(__dirname, "programs/dlp.so");
  if (!existsSync(dlp))
    throw new Error(
      `${dlp} missing: run \`pnpm v2:programs\` (dumps MagicBlock's Delegation Program from devnet)`
    );
  svm.addProgram(v2.DELEGATION_PROGRAM_ID, readFileSync(dlp));
  const program = new Program<v2.RugRoyaleV2>(
    v2.IDL_JSON,
    new AnchorProvider({} as Connection, new Wallet(Keypair.generate()), {})
  );
  return { sender: new LiteSvmSender(svm), program, programId: v2.PROGRAM_ID };
}

export async function newWallet(ctx: V2Ctx, sol = 10): Promise<Keypair> {
  const kp = Keypair.generate();
  await ctx.sender.fund(kp.publicKey, BigInt(sol * LAMPORTS_PER_SOL));
  return kp;
}

/** A treasury that passes InvalidTreasury: a funded system account at the 0-byte rent minimum. */
export async function newTreasury(ctx: V2Ctx): Promise<PublicKey> {
  const t = Keypair.generate().publicKey;
  await ctx.sender.fund(t, await ctx.sender.rentExempt(0));
  return t;
}

/**
 * LiteSVM loads programs without an upgrade authority. Rewrite the ProgramData header's
 * authority (Option<Pubkey> at byte 12), leaving the ELF untouched. `null` = immutable.
 */
export function setUpgradeAuthority(ctx: V2Ctx, authority: PublicKey | null) {
  const [pd] = v2.findProgramData(ctx.programId);
  const acc = ctx.sender.svm.getAccount(pd);
  if (!acc) throw new Error("ProgramData not found");
  const data = Buffer.from(acc.data);
  data.fill(0, 12, 45);
  if (authority) {
    data[12] = 1;
    authority.toBuffer().copy(data, 13);
  }
  ctx.sender.svm.setAccount(pd, { ...acc, data });
}

// ---------------------------------------------------------------------------
// Args

export type ProtocolArgs = Parameters<
  Program<v2.RugRoyaleV2>["methods"]["initProtocol"]
>[0];
export type ArenaArgs = Parameters<
  Program<v2.RugRoyaleV2>["methods"]["createArena"]
>[1];
export type ArenaAssetArg = ArenaArgs["assets"][number];

/** v2 PRD §5 devnet defaults. */
export const defaultProtocolArgs = (
  o: Partial<ProtocolArgs> = {}
): ProtocolArgs => ({
  maxEntryLamports: new BN(1_000_000_000),
  matchFeeLamports: new BN(3_010_000),
  settlerTipLamports: new BN(1_000_000),
  maxRakeBps: 1000,
  paused: false,
  ...o,
});

/** "Solana Arena" (spike 01): Pyth Lazer id and |exponent| per asset. */
export const SOLANA_ARENA: [string, number, number][] = [
  ["SOL", 6, 8],
  ["JUP", 92, 8],
  ["JTO", 91, 8],
  ["RAY", 54, 8],
  ["PYTH", 3, 8],
  ["BONK", 9, 10],
  ["WIF", 10, 8],
  ["POPCAT", 130, 8],
  ["PENGU", 97, 8],
  ["TRUMP", 203, 8],
];

export const asset = (
  lazerId: number,
  exponent: number,
  enabled = true
): ArenaAssetArg => ({
  feed: v2.findPriceFeed(lazerId)[0],
  lazerId,
  exponent,
  enabled,
});

export const EMPTY_ASSET: ArenaAssetArg = {
  feed: PublicKey.default,
  lazerId: 0,
  exponent: 0,
  enabled: false,
};

/** Pads a list of assets to the fixed 10 slots. */
export const assetSlots = (list: ArenaAssetArg[]): ArenaAssetArg[] => [
  ...list,
  ...Array(10 - list.length).fill(EMPTY_ASSET),
];

export const defaultArenaArgs = (o: Partial<ArenaArgs> = {}): ArenaArgs => ({
  paused: false,
  assetCount: SOLANA_ARENA.length,
  assets: SOLANA_ARENA.map(([, id, e]) => asset(id, e)),
  windows: [300, 900, 3600, 0],
  bankroll: new BN(10_000_000_000),
  minEntryLamports: new BN(10_000_000),
  maxEntryLamports: new BN(1_000_000_000),
  tradeFeeBps: 10,
  rakeBps: 500,
  maxPriceAgeS: 5,
  startDelaySecs: 20,
  freerollDailyCap: 3,
  ...o,
});

// ---------------------------------------------------------------------------
// Admin actions

export async function initProtocol(
  ctx: V2Ctx,
  admin: Keypair,
  treasury: PublicKey,
  args: ProtocolArgs = defaultProtocolArgs(),
  opts: { upgradeAuthority?: PublicKey | null } = {}
): Promise<TxResult> {
  setUpgradeAuthority(
    ctx,
    opts.upgradeAuthority === undefined
      ? admin.publicKey
      : opts.upgradeAuthority
  );
  const ix = await ctx.program.methods
    .initProtocol(args)
    .accountsStrict(
      v2.initProtocolAccounts({
        programId: ctx.programId,
        admin: admin.publicKey,
        treasury,
      })
    )
    .instruction();
  return ctx.sender.send([ix], admin);
}

export async function updateProtocol(
  ctx: V2Ctx,
  admin: Keypair,
  treasury: PublicKey,
  newAdmin: PublicKey,
  args: ProtocolArgs = defaultProtocolArgs()
): Promise<TxResult> {
  const ix = await ctx.program.methods
    .updateProtocol(newAdmin, args)
    .accountsStrict(
      v2.updateProtocolAccounts({
        programId: ctx.programId,
        admin: admin.publicKey,
        treasury,
      })
    )
    .instruction();
  return ctx.sender.send([ix], admin);
}

export async function createArena(
  ctx: V2Ctx,
  admin: Keypair,
  arenaId: number,
  args: ArenaArgs = defaultArenaArgs()
): Promise<TxResult> {
  const ix = await ctx.program.methods
    .createArena(arenaId, args)
    .accountsStrict(
      v2.createArenaAccounts({
        programId: ctx.programId,
        admin: admin.publicKey,
        arenaId,
      })
    )
    .instruction();
  return ctx.sender.send([ix], admin);
}

export async function updateArena(
  ctx: V2Ctx,
  admin: Keypair,
  arenaId: number,
  args: ArenaArgs
): Promise<TxResult> {
  const ix = await ctx.program.methods
    .updateArena(args)
    .accountsStrict(
      v2.updateArenaAccounts({
        programId: ctx.programId,
        admin: admin.publicKey,
        arenaId,
      })
    )
    .instruction();
  return ctx.sender.send([ix], admin);
}

/** Protocol (admin = upgrade authority) + Solana Arena (id 1) with defaults. */
export async function setupAdmin(ctx: V2Ctx) {
  const admin = await newWallet(ctx, 50);
  const treasury = await newTreasury(ctx);
  const ok1 = await initProtocol(ctx, admin, treasury);
  if (!ok1.ok)
    throw new Error(`initProtocol: ${ok1.errorName}\n${ok1.logs.join("\n")}`);
  const ok2 = await createArena(ctx, admin, 1);
  if (!ok2.ok)
    throw new Error(`createArena: ${ok2.errorName}\n${ok2.logs.join("\n")}`);
  return { admin, treasury, arenaId: 1 };
}

// ---------------------------------------------------------------------------
// Reads

async function read(ctx: V2Ctx, pk: PublicKey, name: string) {
  const data = await ctx.sender.accountData(pk);
  if (!data) throw new Error(`${name} ${pk.toBase58()} not found`);
  return v2.coder.accounts.decode(name, data);
}

export const fetchProtocol = (ctx: V2Ctx) =>
  read(ctx, v2.findProtocol(ctx.programId)[0], "protocol");
export const fetchArena = (ctx: V2Ctx, arenaId: number) =>
  read(ctx, v2.findArena(ctx.programId, arenaId)[0], "arena");

/** Events emitted by a transaction, decoded with the v2 IDL. */
export function v2Events(res: TxResult): { name: string; data: any }[] {
  const out: { name: string; data: any }[] = [];
  for (const l of res.logs) {
    const m = l.match(/^Program data: (.+)$/);
    if (!m) continue;
    const ev = v2.coder.events.decode(m[1]);
    if (ev) out.push(ev);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matches

/** Devnet ER validator identities (spike 02). */
export const VALIDATORS = {
  us: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
  eu: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  as: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
};

export interface MatchRef {
  matchAccount: PublicKey;
  pot: PublicKey;
  creator: PublicKey;
  nonce: bigint;
  arenaId: number;
}

export interface CreateMatchParams {
  creator: Keypair;
  arenaId?: number;
  nonce?: bigint;
  windowSecs?: number;
  entryLamports?: bigint;
  allowedOpponent?: PublicKey;
  /** Absolute unix time. Defaults to now + 3600. */
  joinDeadline?: bigint;
  sessionKey?: PublicKey;
  validator?: PublicKey;
}

let nonceCounter = 0n;

export async function createMatch(
  ctx: V2Ctx,
  p: CreateMatchParams
): Promise<{ res: TxResult; ref: MatchRef }> {
  const arenaId = p.arenaId ?? 1;
  const nonce = p.nonce ?? ++nonceCounter;
  const { matchAccount, pot, accounts } = v2.createMatchAccounts({
    programId: ctx.programId,
    creator: p.creator.publicKey,
    arenaId,
    nonce,
  });
  const joinDeadline = p.joinDeadline ?? (await ctx.sender.now()) + 3_600n;
  const ix = await ctx.program.methods
    .createMatch(arenaId, {
      nonce: new BN(nonce.toString()),
      windowSecs: p.windowSecs ?? 300,
      entryLamports: new BN((p.entryLamports ?? 0n).toString()),
      allowedOpponent: p.allowedOpponent ?? PublicKey.default,
      joinDeadline: new BN(joinDeadline.toString()),
      sessionKey: p.sessionKey ?? PublicKey.default,
      validator: p.validator ?? VALIDATORS.us,
    })
    .accountsStrict(accounts)
    .instruction();
  const res = await ctx.sender.send([ix], p.creator);
  return {
    res,
    ref: { matchAccount, pot, creator: p.creator.publicKey, nonce, arenaId },
  };
}

export const fetchMatch = (ctx: V2Ctx, m: PublicKey) => read(ctx, m, "match");
export const fetchPot = (ctx: V2Ctx, pot: PublicKey) => read(ctx, pot, "pot");
export const fetchStats = (ctx: V2Ctx, wallet: PublicKey) =>
  read(ctx, v2.findPlayerStats(ctx.programId, wallet)[0], "playerStats");

export async function sponsorMatch(
  ctx: V2Ctx,
  ref: MatchRef,
  sponsor: Keypair,
  amount: bigint
): Promise<TxResult> {
  const ix = await ctx.program.methods
    .sponsorMatch(new BN(amount.toString()))
    .accountsStrict(
      v2.sponsorMatchAccounts({
        programId: ctx.programId,
        sponsor: sponsor.publicKey,
        pot: ref.pot,
      })
    )
    .instruction();
  return ctx.sender.send([ix], sponsor);
}

export async function joinMatch(
  ctx: V2Ctx,
  ref: MatchRef,
  opponent: Keypair,
  sessionKey: PublicKey = PublicKey.default
): Promise<TxResult> {
  const ix = await ctx.program.methods
    .joinMatch(sessionKey)
    .accountsStrict(
      v2.joinMatchAccounts({
        programId: ctx.programId,
        opponent: opponent.publicKey,
        creator: ref.creator,
        matchAccount: ref.matchAccount,
        pot: ref.pot,
        arenaId: ref.arenaId,
      })
    )
    .instruction();
  return ctx.sender.send([ix], opponent);
}

/**
 * cancel_match. By default the pinned accounts come from the pot and protocol; override
 * them to test the address constraints. `sponsor: null` omits the optional account.
 */
export async function cancelMatch(
  ctx: V2Ctx,
  ref: MatchRef,
  caller: Keypair,
  o: {
    creator?: PublicKey;
    sponsor?: PublicKey | null;
    treasury?: PublicKey;
  } = {}
): Promise<TxResult> {
  const pot = await fetchPot(ctx, ref.pot);
  const protocol = await fetchProtocol(ctx);
  const sponsor =
    o.sponsor !== undefined
      ? o.sponsor
      : pot.sponsor.equals(PublicKey.default)
      ? null
      : pot.sponsor;
  const ix = await ctx.program.methods
    .cancelMatch()
    .accountsStrict(
      v2.cancelMatchAccounts({
        programId: ctx.programId,
        caller: caller.publicKey,
        pot: ref.pot,
        creator: o.creator ?? pot.creator,
        sponsor,
        treasury: o.treasury ?? protocol.treasury,
      })
    )
    .instruction();
  return ctx.sender.send([ix], caller);
}

/** LiteSVM only: zero a wallet's lamports, as if the player swept it. */
export function emptyWallet(ctx: V2Ctx, pk: PublicKey) {
  const acc = ctx.sender.svm.getAccount(pk);
  if (!acc) throw new Error("account not found");
  ctx.sender.svm.setAccount(pk, { ...acc, lamports: 0 });
}

export async function delegateMatchIx(
  ctx: V2Ctx,
  ref: MatchRef,
  payer: PublicKey
) {
  return ctx.program.methods
    .delegateMatch()
    .accountsStrict(
      v2.delegateMatchAccounts({
        programId: ctx.programId,
        payer,
        matchAccount: ref.matchAccount,
      })
    )
    .instruction();
}

export async function delegateMatch(
  ctx: V2Ctx,
  ref: MatchRef,
  payer: Keypair
): Promise<TxResult> {
  return ctx.sender.send(
    [await delegateMatchIx(ctx, ref, payer.publicKey)],
    payer
  );
}

/** The real client flow: join_match + delegate_match in ONE opponent-signed transaction. */
export async function joinAndDelegate(
  ctx: V2Ctx,
  ref: MatchRef,
  opponent: Keypair,
  sessionKey: PublicKey = PublicKey.default
): Promise<TxResult> {
  const join = await ctx.program.methods
    .joinMatch(sessionKey)
    .accountsStrict(
      v2.joinMatchAccounts({
        programId: ctx.programId,
        opponent: opponent.publicKey,
        creator: ref.creator,
        matchAccount: ref.matchAccount,
        pot: ref.pot,
        arenaId: ref.arenaId,
      })
    )
    .instruction();
  return ctx.sender.send(
    [join, await delegateMatchIx(ctx, ref, opponent.publicKey)],
    opponent
  );
}
