import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN, utils } from "@anchor-lang/core";
import {
  DuelResult,
  DuelStatus,
  IDL_JSON,
  coder,
  decodeDuel,
  duelsAsCreator,
  duelsAsOpponent,
  duelsByStatus,
  findConfig,
  findDuel,
  programError,
  programErrorFromLogs,
} from "@rug-royale/sdk";
import { liteCtx, setupProtocol, fetchConfig } from "./fixtures";

// Off-chain SDK checks. The Rust test `lobby_offsets_match_layout` guards the same offsets
// from the program side.
describe("sdk", () => {
  const creator = Keypair.generate().publicKey;
  const opponent = Keypair.generate().publicKey;

  const encodeDuel = async (status: string) => {
    const z = new BN(0);
    return coder.accounts.encode("duel", {
      status: { [status]: {} },
      result: 0,
      tier: 1,
      closed: false,
      bump: 255,
      windowSecs: 120,
      nonce: new BN(7),
      entryLamports: new BN(100_000_000),
      sponsoredLamports: z,
      bankroll: new BN(1_000_000_000),
      finalA: z,
      finalB: z,
      joinDeadline: new BN(1_700_000_000),
      startTs: z,
      endTs: z,
      creator,
      opponent,
      allowedOpponent: PublicKey.default,
      sponsor: PublicKey.default,
      coin: Keypair.generate().publicKey,
      quoteMint: Keypair.generate().publicKey,
    });
  };

  // Applies a getProgramAccounts memcmp filter to raw bytes, as the RPC node would.
  const matches = (data: Buffer, filters: ReturnType<typeof duelsByStatus>) =>
    filters.every((f) => {
      if (!("memcmp" in f)) return false;
      const want = Buffer.from(utils.bytes.bs58.decode(f.memcmp.bytes));
      return data
        .subarray(f.memcmp.offset, f.memcmp.offset + want.length)
        .equals(want);
    });

  it("decodes a Duel with plain types and null for unset pubkeys", async () => {
    const d = decodeDuel(await encodeDuel("active"));
    expect(d.status).to.equal(DuelStatus.Active);
    expect(d.result).to.equal(DuelResult.Pending);
    expect(d.nonce).to.equal(7n);
    expect(d.entryLamports).to.equal(100_000_000n);
    expect(d.creator.equals(creator)).to.equal(true);
    expect(d.opponent?.equals(opponent)).to.equal(true);
    expect(d.allowedOpponent).to.equal(null);
    expect(d.sponsor).to.equal(null);
  });

  it("lobby filters select by status, creator, and opponent", async () => {
    const open = await encodeDuel("open");
    const active = await encodeDuel("active");
    expect(matches(open, duelsByStatus(DuelStatus.Open))).to.equal(true);
    expect(matches(active, duelsByStatus(DuelStatus.Open))).to.equal(false);
    expect(matches(active, duelsByStatus(DuelStatus.Active))).to.equal(true);
    expect(matches(open, duelsAsCreator(creator))).to.equal(true);
    expect(matches(open, duelsAsCreator(opponent))).to.equal(false);
    expect(matches(open, duelsAsOpponent(opponent))).to.equal(true);
  });

  it("decodes Config written by init_config", async () => {
    const ctx = liteCtx();
    const { mints, treasury } = await setupProtocol(ctx);
    const c = await fetchConfig(ctx, findConfig(ctx.programId)[0]);
    expect(c.treasury.equals(treasury)).to.equal(true);
    expect(c.quoteMint.equals(mints.quote)).to.equal(true);
    expect(c.allowedMints.map((m) => m.toBase58())).to.deep.equal(
      mints.coins.map((m) => m.toBase58())
    );
    expect(c.tiers).to.deep.equal([
      1_000_000_000n,
      10_000_000_000n,
      100_000_000_000n,
    ]);
    expect(c.rakeBps).to.equal(250);
    expect(c.bump).to.be.greaterThan(0);
  });

  it("findDuel matches the Buffer-based derivation for any u64 nonce (browser-safe bytes)", () => {
    const programId = new PublicKey(IDL_JSON.address);
    const nonces = [0n, 1n, 255n, 256n, 2n ** 32n, 2n ** 63n, 2n ** 64n - 1n];
    for (let i = 0; i < 20; i++)
      nonces.push(BigInt(Math.floor(Math.random() * 2 ** 53)) * 2049n);
    for (const nonce of nonces) {
      const n = Buffer.alloc(8);
      n.writeBigUInt64LE(nonce % 2n ** 64n);
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from("duel"), creator.toBuffer(), n],
        programId
      );
      expect(
        findDuel(programId, creator, nonce % 2n ** 64n)[0].toBase58(),
        nonce.toString()
      ).to.equal(expected.toBase58());
    }
  });

  it("maps every program error code to a message", () => {
    expect(IDL_JSON.errors).to.have.length(32);
    for (const e of IDL_JSON.errors)
      expect(programError(e.code)?.name).to.equal(e.name);
    expect(programError(6019)?.name).to.equal("WindowEnded");
    expect(programError(6019)?.message).to.equal(
      "The trading window has ended."
    );
    expect(programError(9999)).to.equal(null);
    expect(
      programErrorFromLogs([
        "Program log: AnchorError ... Error Code: SlippageExceeded. Error Number: 6024.",
      ])?.name
    ).to.equal("SlippageExceeded");
  });
});
