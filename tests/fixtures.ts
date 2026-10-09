// Shared test fixtures for both suites (BUILD_PLAN "Two test suites").
//
// Tests talk to a `Sender`, which is either LiteSVM (local, clock can be warped) or an
// RPC connection (devnet, real time). Scenario helpers below take a `Ctx` and work on
// both. Instructions are built from the IDL with every account passed explicitly via
// the SDK account maps.
import { readFileSync } from "fs";
import path from "path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import { expect } from "chai";
import {
  DuelRef,
  cancelDuelAccounts,
  closeDuelAccounts,
  createDuelAccounts,
  DEMO_DECIMALS,
  MINT_SIZE,
  createDemoMintIxs,
  decodeConfig,
  decodeDuel,
  decodePool,
  findDuel,
  findEscrow,
  findPool,
  initConfigAccounts,
  joinDuelAccounts,
  playerVaults,
  poolAccounts,
  settleAccounts,
  sponsorPrizeAccounts,
  swapAccounts,
} from "@rug-royale/sdk";
import idl from "../idl/rug_royale.json";
import type { RugRoyale } from "../idl/rug_royale";

export const PROGRAM_ID = new PublicKey(idl.address);
export const DECIMALS = DEMO_DECIMALS;
const UNIT = 10n ** BigInt(DECIMALS);

// ---------------------------------------------------------------------------
// Senders

export interface TxResult {
  ok: boolean;
  logs: string[];
  /** Compute units consumed (LiteSVM only; undefined on RPC). */
  cu?: bigint;
  /** Anchor error name parsed from the logs, e.g. "WindowEnded". */
  errorName?: string;
  /** Anchor error number parsed from the logs, e.g. 6019. */
  errorCode?: number;
  raw?: unknown;
}

export interface Sender {
  readonly kind: "litesvm" | "rpc";
  send(
    ixs: TransactionInstruction[],
    payer: Keypair,
    extraSigners?: Keypair[]
  ): Promise<TxResult>;
  lamports(pk: PublicKey): Promise<bigint>;
  accountData(pk: PublicKey): Promise<Buffer | null>;
  /** Cluster unix time, seconds. */
  now(): Promise<bigint>;
  rentExempt(size: number): Promise<bigint>;
  fund(pk: PublicKey, lamports: bigint): Promise<void>;
}

const ANCHOR_ERR = /Error Code: (\w+)\. Error Number: (\d+)/;

const parseLogs = (
  logs: string[]
): Pick<TxResult, "errorName" | "errorCode"> => {
  for (const l of logs) {
    const m = l.match(ANCHOR_ERR);
    if (m) return { errorName: m[1], errorCode: Number(m[2]) };
  }
  return {};
};

export class LiteSvmSender implements Sender {
  readonly kind = "litesvm" as const;
  constructor(readonly svm: LiteSVM) {}

  async send(
    ixs: TransactionInstruction[],
    payer: Keypair,
    extraSigners: Keypair[] = []
  ) {
    const tx = new Transaction().add(...ixs);
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.feePayer = payer.publicKey;
    tx.sign(payer, ...extraSigners);
    const res = this.svm.sendTransaction(tx);
    // Let an identical transaction be sent again (e.g. retrying after a clock warp).
    this.svm.expireBlockhash();
    if (res instanceof FailedTransactionMetadata) {
      const logs = res.meta().logs();
      return {
        ok: false,
        logs,
        cu: res.meta().computeUnitsConsumed(),
        ...parseLogs(logs),
        raw: res.err(),
      };
    }
    return { ok: true, logs: res.logs(), cu: res.computeUnitsConsumed() };
  }

  async lamports(pk: PublicKey) {
    return this.svm.getBalance(pk) ?? 0n;
  }

  async accountData(pk: PublicKey) {
    const a = this.svm.getAccount(pk);
    return a ? Buffer.from(a.data) : null;
  }

  async now() {
    return this.svm.getClock().unixTimestamp;
  }

  async rentExempt(size: number) {
    return this.svm.minimumBalanceForRentExemption(BigInt(size));
  }

  async fund(pk: PublicKey, lamports: bigint) {
    this.svm.airdrop(pk, lamports);
  }

  /** LiteSVM only: jump the cluster clock to `unixTs`. */
  warpTo(unixTs: bigint) {
    const clock = this.svm.getClock();
    clock.unixTimestamp = unixTs;
    this.svm.setClock(clock);
  }
}

export class RpcSender implements Sender {
  readonly kind = "rpc" as const;
  constructor(
    readonly connection: Connection,
    private readonly faucet?: Keypair
  ) {}

  async send(
    ixs: TransactionInstruction[],
    payer: Keypair,
    extraSigners: Keypair[] = []
  ) {
    const tx = new Transaction().add(...ixs);
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer, ...extraSigners);
    try {
      const sig = await this.connection.sendRawTransaction(tx.serialize());
      const conf = await this.confirm(sig, lastValidBlockHeight);
      const info = await this.connection.getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const logs = info?.meta?.logMessages ?? [];
      if (conf.err)
        return { ok: false, logs, ...parseLogs(logs), raw: conf.err };
      return { ok: true, logs, raw: sig };
    } catch (e) {
      // Preflight failures land here with the simulation logs attached.
      const logs =
        e instanceof SendTransactionError
          ? (await e.getLogs(this.connection)) ?? []
          : [];
      return { ok: false, logs, ...parseLogs(logs), raw: e };
    }
  }

  /**
   * Polls signature status instead of confirmTransaction's websocket subscription, which
   * public devnet RPC rate-limits (ws 429s) and which adds a connection per transaction.
   */
  private async confirm(signature: string, lastValidBlockHeight: number) {
    for (;;) {
      const { value } = await this.connection.getSignatureStatuses([signature]);
      const st = value[0];
      if (
        st?.confirmationStatus === "confirmed" ||
        st?.confirmationStatus === "finalized"
      )
        return { err: st.err };
      if (
        (await this.connection.getBlockHeight("confirmed")) >
        lastValidBlockHeight
      )
        return { err: "blockhash expired before confirmation" };
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  async lamports(pk: PublicKey) {
    return BigInt(await this.connection.getBalance(pk, "confirmed"));
  }

  async accountData(pk: PublicKey) {
    const a = await this.connection.getAccountInfo(pk, "confirmed");
    return a ? a.data : null;
  }

  async now() {
    const slot = await this.connection.getSlot("confirmed");
    const t = await this.connection.getBlockTime(slot);
    return BigInt(t ?? Math.floor(Date.now() / 1000));
  }

  async rentExempt(size: number) {
    return BigInt(
      await this.connection.getMinimumBalanceForRentExemption(size)
    );
  }

  /** Funds from the faucet wallet (devnet airdrops are rate-limited, so avoid them). */
  async fund(pk: PublicKey, lamports: bigint) {
    if (!this.faucet) throw new Error("RpcSender.fund needs a faucet keypair");
    const target = (await this.lamports(pk)) + lamports;
    for (let attempt = 1; ; attempt++) {
      const res = await this.send(
        [
          SystemProgram.transfer({
            fromPubkey: this.faucet.publicKey,
            toPubkey: pk,
            lamports,
          }),
        ],
        this.faucet
      );
      if (res.ok) return;
      // Under rate limiting the transfer can land while its confirmation times out, so
      // check the balance before retrying (a blind retry would fund twice).
      if ((await this.lamports(pk)) >= target) return;
      if (attempt >= 2)
        throw new Error(
          `fund failed: ${String(res.raw)}\n${res.logs.join("\n")}`
        );
    }
  }

  /** RPC only: wait until cluster time reaches `unixTs`. */
  async waitUntil(unixTs: bigint, pollMs = 2_000) {
    // Sleep most of the gap in one go, then poll, to keep RPC traffic low.
    const gap = Number(unixTs - (await this.now()));
    if (gap > 3) await new Promise((r) => setTimeout(r, (gap - 2) * 1000));
    while ((await this.now()) < unixTs)
      await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ---------------------------------------------------------------------------
// Context

export interface Ctx {
  sender: Sender;
  program: Program<RugRoyale>;
  programId: PublicKey;
}

/** The Program is only used to encode instructions; it never touches a connection. */
const encoder = () =>
  new Program<RugRoyale>(
    idl as RugRoyale,
    new AnchorProvider({} as Connection, new Wallet(Keypair.generate()), {})
  );

/** Fresh LiteSVM with the built program loaded. */
export function liteCtx(): Ctx & { sender: LiteSvmSender } {
  const svm = new LiteSVM();
  svm.addProgram(
    PROGRAM_ID,
    readFileSync(path.join(__dirname, "../target/deploy/rug_royale.so"))
  );
  return {
    sender: new LiteSvmSender(svm),
    program: encoder(),
    programId: PROGRAM_ID,
  };
}

export function rpcCtx(
  connection: Connection,
  faucet: Keypair
): Ctx & { sender: RpcSender } {
  return {
    sender: new RpcSender(connection, faucet),
    program: encoder(),
    programId: PROGRAM_ID,
  };
}

export async function newWallet(ctx: Ctx, sol = 10): Promise<Keypair> {
  const kp = Keypair.generate();
  await ctx.sender.fund(kp.publicKey, BigInt(sol * LAMPORTS_PER_SOL));
  return kp;
}

// ---------------------------------------------------------------------------
// Assertions and reads

export function expectOk(res: TxResult) {
  expect(
    res.ok,
    `expected success, got ${res.errorName ?? "failure"}\n${res.logs.join(
      "\n"
    )}`
  ).to.equal(true);
}

/** Asserts the transaction failed with the named RugRoyaleError (or Anchor framework error). */
export function expectError(res: TxResult, name: string) {
  expect(res.ok, `expected ${name}, but the transaction succeeded`).to.equal(
    false
  );
  expect(res.errorName, res.logs.join("\n")).to.equal(name);
}

export async function tokenBalance(ctx: Ctx, ata: PublicKey): Promise<bigint> {
  const data = await ctx.sender.accountData(ata);
  if (!data) return 0n;
  const info = {
    data,
    owner: TOKEN_2022_PROGRAM_ID,
    lamports: 0,
    executable: false,
  };
  return unpackAccount(ata, info, TOKEN_2022_PROGRAM_ID).amount;
}

async function mustRead(ctx: Ctx, pk: PublicKey, what: string) {
  const data = await ctx.sender.accountData(pk);
  if (!data) throw new Error(`${what} ${pk.toBase58()} not found`);
  return data;
}

export const fetchDuel = async (ctx: Ctx, duel: PublicKey) =>
  decodeDuel(await mustRead(ctx, duel, "duel"));
export const fetchPool = async (ctx: Ctx, pool: PublicKey) =>
  decodePool(await mustRead(ctx, pool, "pool"));
export const fetchConfig = async (ctx: Ctx, config: PublicKey) =>
  decodeConfig(await mustRead(ctx, config, "config"));

// ---------------------------------------------------------------------------
// Setup: mints and config

export interface Mints {
  quote: PublicKey;
  coins: PublicKey[];
}

/** One quote mint + 10 coin mints, Token-2022, 6 decimals, authority = MintAuthority PDA (G11). */
export async function createMints(ctx: Ctx, payer: Keypair): Promise<Mints> {
  const rent = Number(await ctx.sender.rentExempt(MINT_SIZE));
  const make = async () => {
    const mint = Keypair.generate();
    const ixs = createDemoMintIxs({
      programId: ctx.programId,
      payer: payer.publicKey,
      mint: mint.publicKey,
      rentLamports: rent,
    });
    expectOk(await ctx.sender.send(ixs, payer, [mint]));
    return mint.publicKey;
  };
  const quote = await make();
  const coins: PublicKey[] = [];
  for (let i = 0; i < 10; i++) coins.push(await make());
  return { quote, coins };
}

export type ConfigArgs = Parameters<
  Program<RugRoyale>["methods"]["initConfig"]
>[0];

/** PRD §5 defaults. Override any field per test. */
export function defaultConfigArgs(
  mints: Mints,
  treasury: PublicKey,
  overrides: Partial<ConfigArgs> = {}
): ConfigArgs {
  return {
    treasury,
    quoteMint: mints.quote,
    allowedMints: mints.coins,
    tiers: [
      new BN((1_000n * UNIT).toString()),
      new BN((10_000n * UNIT).toString()),
      new BN((100_000n * UNIT).toString()),
    ],
    windows: [120, 300, 600, 900],
    poolSeedRatio: new BN(5),
    settlerTipLamports: new BN(1_000_000),
    maxEntryLamports: new BN(1_000_000_000),
    rakeBps: 250,
    swapFeeBps: 30,
    ...overrides,
  };
}

export async function initConfig(
  ctx: Ctx,
  admin: Keypair,
  args: ConfigArgs
): Promise<TxResult> {
  const ix = await ctx.program.methods
    .initConfig(args)
    .accountsStrict(initConfigAccounts(ctx.programId, admin.publicKey))
    .instruction();
  return ctx.sender.send([ix], admin);
}

/** Everything a typical test needs: admin, treasury, mints, and an initialized Config. */
export async function setupProtocol(
  ctx: Ctx,
  overrides: Partial<ConfigArgs> = {}
) {
  const admin = await newWallet(ctx, 50);
  const treasury = Keypair.generate().publicKey;
  const mints = await createMints(ctx, admin);
  const args = defaultConfigArgs(mints, treasury, overrides);
  expectOk(await initConfig(ctx, admin, args));
  return { admin, treasury, mints, configArgs: args };
}

// ---------------------------------------------------------------------------
// Duel actions. Each returns the TxResult so tests can assert success or a typed error.

export interface CreateDuelParams {
  creator: Keypair;
  mints: Mints;
  coin?: PublicKey;
  nonce?: bigint;
  tier?: number;
  windowSecs?: number;
  entryLamports?: bigint;
  allowedOpponent?: PublicKey;
  /** Absolute unix time. Defaults to now + 3600. */
  joinDeadline?: bigint;
}

let nonceCounter = 0n;

export async function createDuel(ctx: Ctx, p: CreateDuelParams) {
  const nonce = p.nonce ?? ++nonceCounter;
  const coin = p.coin ?? p.mints.coins[0];
  const { duel, accounts } = createDuelAccounts({
    programId: ctx.programId,
    creator: p.creator.publicKey,
    nonce,
    quoteMint: p.mints.quote,
    coinMint: coin,
  });
  const joinDeadline = p.joinDeadline ?? (await ctx.sender.now()) + 3_600n;
  const ix = await ctx.program.methods
    .createDuel(
      new BN(nonce.toString()),
      p.tier ?? 0,
      p.windowSecs ?? 120,
      new BN((p.entryLamports ?? 0n).toString()),
      p.allowedOpponent ?? PublicKey.default,
      new BN(joinDeadline.toString())
    )
    .accountsStrict(accounts)
    .instruction();
  // 5 inits + 2 mints exceed the 200k default (PRD §6.2 note).
  const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
  const res = await ctx.sender.send([cu, ix], p.creator);
  const ref: DuelRef = {
    programId: ctx.programId,
    duel,
    creator: p.creator.publicKey,
    quoteMint: p.mints.quote,
    coinMint: coin,
  };
  return { res, ref };
}

export async function sponsorPrize(
  ctx: Ctx,
  ref: DuelRef,
  sponsor: Keypair,
  amount: bigint
) {
  const ix = await ctx.program.methods
    .sponsorPrize(new BN(amount.toString()))
    .accountsStrict(sponsorPrizeAccounts(ref, sponsor.publicKey))
    .instruction();
  return ctx.sender.send([ix], sponsor);
}

/** On success, returns a DuelRef with `opponent` set. */
export async function joinDuel(ctx: Ctx, ref: DuelRef, opponent: Keypair) {
  const ix = await ctx.program.methods
    .joinDuel()
    .accountsStrict(joinDuelAccounts(ref, opponent.publicKey))
    .instruction();
  const res = await ctx.sender.send([ix], opponent);
  return { res, ref: { ...ref, opponent: opponent.publicKey } };
}

export async function swap(
  ctx: Ctx,
  ref: DuelRef,
  player: Keypair,
  side: "buy" | "sell",
  amountIn: bigint,
  minOut = 0n
) {
  const ix = await ctx.program.methods
    .swap(
      side === "buy" ? { buy: {} } : { sell: {} },
      new BN(amountIn.toString()),
      new BN(minOut.toString())
    )
    .accountsStrict(swapAccounts(ref, player.publicKey))
    .instruction();
  return ctx.sender.send([ix], player);
}

export async function settle(
  ctx: Ctx,
  ref: DuelRef,
  settler: Keypair,
  treasury: PublicKey
) {
  const ix = await ctx.program.methods
    .settle()
    .accountsStrict(settleAccounts(ref, settler.publicKey, treasury))
    .instruction();
  return ctx.sender.send([ix], settler);
}

export async function cancelDuel(
  ctx: Ctx,
  ref: DuelRef,
  caller: Keypair,
  sponsor: PublicKey | null = null
) {
  const ix = await ctx.program.methods
    .cancelDuel()
    .accountsStrict(cancelDuelAccounts(ref, caller.publicKey, sponsor))
    .instruction();
  return ctx.sender.send([ix], caller);
}

export async function closeDuel(ctx: Ctx, ref: DuelRef, caller: Keypair) {
  const ix = await ctx.program.methods
    .closeDuel()
    .accountsStrict(closeDuelAccounts(ref, caller.publicKey))
    .instruction();
  return ctx.sender.send([ix], caller);
}

// ---------------------------------------------------------------------------
// LiteSVM-only state injection.
//
// Until create_duel and join_duel have bodies, the stubs only create accounts (Duel and
// Pool stay zeroed, nothing is minted). `injectActiveDuel` runs both stubs so every
// account exists, then writes the Active state a real create + join would leave: Duel
// fields, the Escrow and Pool bumps, Pool reserves, and token balances. Demo mints are owned by the MintAuthority
// PDA, so balances are written directly rather than minted. Replace with real
// createDuel + joinDuel once those handlers land.

/** Overwrites a token account's `amount` (offset 64 in the base SPL layout). */
export function setTokenAmount(
  sender: LiteSvmSender,
  ata: PublicKey,
  amount: bigint
) {
  const acc = sender.svm.getAccount(ata);
  if (!acc) throw new Error(`token account ${ata.toBase58()} not found`);
  const data = Buffer.from(acc.data);
  data.writeBigUInt64LE(amount, 64);
  sender.svm.setAccount(ata, { ...acc, data });
}

async function setAnchorAccount(
  ctx: Ctx & { sender: LiteSvmSender },
  pk: PublicKey,
  name: "duel" | "pool" | "escrow",
  value: Record<string, unknown>
) {
  const acc = ctx.sender.svm.getAccount(pk);
  if (!acc) throw new Error(`${name} ${pk.toBase58()} not found`);
  const encoded = await ctx.program.coder.accounts.encode(name, value);
  const data = Buffer.alloc(acc.data.length);
  Buffer.from(encoded).copy(data);
  ctx.sender.svm.setAccount(pk, { ...acc, data });
}

export interface ActiveDuelParams {
  creator: Keypair;
  opponent: Keypair;
  mints: Mints;
  coin?: PublicKey;
  /** Raw quote units per player. Defaults to tier 0 (1,000 tokens). */
  bankroll?: bigint;
  /** Raw units of each side of the pool. Defaults to bankroll × 10 (PRD §5 ratio). */
  poolSeed?: bigint;
  startTs?: bigint;
  windowSecs?: number;
  entryLamports?: bigint;
  /** Written after join. Defaults to "active"; other values test status checks. */
  status?: "open" | "active" | "settled" | "cancelled";
}

export async function injectActiveDuel(
  ctx: Ctx & { sender: LiteSvmSender },
  p: ActiveDuelParams
) {
  const nonce = ++nonceCounter;
  const coin = p.coin ?? p.mints.coins[0];
  const bankroll = p.bankroll ?? 1_000n * UNIT;
  const poolSeed = p.poolSeed ?? bankroll * 10n;
  const windowSecs = p.windowSecs ?? 120;
  const startTs = p.startTs ?? (await ctx.sender.now()) + 60n;
  const endTs = startTs + BigInt(windowSecs);

  const created = await createDuel(ctx, {
    creator: p.creator,
    mints: p.mints,
    coin,
    nonce,
    windowSecs,
  });
  expectOk(created.res);
  const ref = created.ref;
  const [, duelBump] = findDuel(ctx.programId, p.creator.publicKey, nonce);
  const [pool, poolBump] = findPool(ctx.programId, ref.duel);
  const bn = (x: bigint) => new BN(x.toString());

  const duelFields = (
    status: string,
    opponent: PublicKey,
    joinDeadline = startTs - 60n
  ) => ({
    status: { [status]: {} },
    result: 0,
    tier: 0,
    closed: false,
    bump: duelBump,
    windowSecs,
    nonce: bn(nonce),
    entryLamports: bn(p.entryLamports ?? 0n),
    sponsoredLamports: bn(0n),
    bankroll: bn(bankroll),
    finalA: bn(0n),
    finalB: bn(0n),
    joinDeadline: bn(joinDeadline),
    startTs: bn(status === "open" ? 0n : startTs),
    endTs: bn(status === "open" ? 0n : endTs),
    creator: p.creator.publicKey,
    opponent,
    allowedOpponent: PublicKey.default,
    sponsor: PublicKey.default,
    coin,
    quoteMint: p.mints.quote,
  });

  const [escrow, escrowBump] = findEscrow(ctx.programId, ref.duel);
  await setAnchorAccount(ctx, escrow, "escrow", { bump: escrowBump });
  // join_duel's seeds read creator/nonce/bump/mints from Duel and the Escrow bump, so
  // write those first.
  await setAnchorAccount(
    ctx,
    ref.duel,
    "duel",
    // Real join_duel checks now < join_deadline, so the Open write needs a future deadline.
    duelFields("open", PublicKey.default, startTs + 3_600n)
  );
  const joined = await joinDuel(ctx, ref, p.opponent);
  expectOk(joined.res);

  await setAnchorAccount(
    ctx,
    ref.duel,
    "duel",
    duelFields(p.status ?? "active", p.opponent.publicKey)
  );
  await setAnchorAccount(ctx, pool, "pool", {
    duel: ref.duel,
    coin,
    quoteReserve: bn(poolSeed),
    tokenReserve: bn(poolSeed),
    bump: poolBump,
  });
  const pa = poolAccounts(joined.ref);
  setTokenAmount(ctx.sender, pa.quote, poolSeed);
  setTokenAmount(ctx.sender, pa.coin, poolSeed);
  for (const player of [p.creator.publicKey, p.opponent.publicKey])
    setTokenAmount(
      ctx.sender,
      playerVaults(joined.ref, player).quote,
      bankroll
    );

  return { ref: joined.ref, startTs, endTs, bankroll, poolSeed };
}

/** LiteSVM only: overwrite some Duel fields (camelCase, as the coder decodes them). */
export async function patchDuel(
  ctx: Ctx & { sender: LiteSvmSender },
  ref: DuelRef,
  fields: Record<string, unknown>
) {
  const d = ctx.sender.svm.getAccount(ref.duel);
  if (!d) throw new Error("duel not found");
  const duel = ctx.program.coder.accounts.decode("duel", Buffer.from(d.data));
  await setAnchorAccount(ctx, ref.duel, "duel", { ...duel, ...fields });
}

/**
 * LiteSVM only, until sponsor_prize has a body: what a sponsor_prize of `amount` would
 * leave behind. Adds `amount` to the escrow's lamports and sets Duel.sponsor and
 * Duel.sponsored_lamports.
 */
export async function injectSponsor(
  ctx: Ctx & { sender: LiteSvmSender },
  ref: DuelRef,
  sponsor: PublicKey,
  amount: bigint
) {
  const [escrow] = findEscrow(ctx.programId, ref.duel);
  const e = ctx.sender.svm.getAccount(escrow);
  if (!e) throw new Error("escrow not found");
  ctx.sender.svm.setAccount(escrow, {
    ...e,
    lamports: Number(BigInt(e.lamports) + amount),
  });
  await patchDuel(ctx, ref, {
    sponsor,
    sponsoredLamports: new BN(amount.toString()),
  });
}
