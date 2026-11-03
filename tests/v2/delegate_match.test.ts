import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import {
  VALIDATORS,
  createMatch,
  delegateMatch,
  expectError,
  expectOk,
  fetchMatch,
  joinAndDelegate,
  joinMatch,
  newWallet,
  setupAdmin,
  v2Ctx,
} from "./fixtures";

// v2 PRD §6.2 delegate_match, against MagicBlock's real Delegation Program (dumped from devnet).
describe("v2 delegate_match", () => {
  async function ready(validator = VALIDATORS.eu) {
    const ctx = v2Ctx();
    await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const opponent = await newWallet(ctx);
    const { res, ref } = await createMatch(ctx, {
      creator,
      entryLamports: 50_000_000n,
      validator,
    });
    expectOk(res);
    return { ctx, ref, creator, opponent };
  }

  it("join + delegate in one transaction hands Match to the Delegation Program, pinned to the creator's region", async () => {
    const { ctx, ref, opponent } = await ready(VALIDATORS.eu);
    const session = Keypair.generate().publicKey;
    const res = await joinAndDelegate(ctx, ref, opponent, session);
    expectOk(res);
    console.log(`      join_match + delegate_match CU: ${res.cu}`);

    // Ownership moved; the data (now Active, with seat 1) is preserved for the ER to clone.
    const acc = ctx.sender.svm.getAccount(ref.matchAccount)!;
    expect(acc.owner.toString()).to.equal(v2.DELEGATION_PROGRAM_ID.toBase58());
    const m = await fetchMatch(ctx, ref.matchAccount);
    expect(m.status).to.deep.equal({ active: {} });
    expect(m.seats[1].sessionKey.equals(session)).to.equal(true);

    // The delegation record names our program as owner and the pinned validator (EU).
    const record = Buffer.from(
      ctx.sender.svm.getAccount(v2.findDelegationRecord(ref.matchAccount)[0])!
        .data
    );
    expect(record.includes(VALIDATORS.eu.toBuffer())).to.equal(true);
    expect(record.includes(ctx.programId.toBuffer())).to.equal(true);
    // Metadata exists (seeds, rent payer); the temporary buffer is gone after the handoff.
    expect(
      ctx.sender.svm.getAccount(v2.findDelegationMetadata(ref.matchAccount)[0])
    ).to.not.equal(null);
    const buf = ctx.sender.svm.getAccount(
      v2.findDelegationBuffer(ctx.programId, ref.matchAccount)[0]
    );
    expect(buf === null || Number(buf.lamports) === 0).to.equal(true);

    // The Pot (real SOL) is never delegated (V1).
    expect(ctx.sender.svm.getAccount(ref.pot)!.owner.toString()).to.equal(
      ctx.programId.toBase58()
    );
  });

  it("the payer funds the delegation deposits (refunded minus the session fee at undelegation)", async () => {
    const { ctx, ref, opponent } = await ready();
    expectOk(await joinMatch(ctx, ref, opponent));
    const payer = await newWallet(ctx);
    const b0 = await ctx.sender.lamports(payer.publicKey);
    expectOk(await delegateMatch(ctx, ref, payer)); // permissionless: any payer
    const spent = b0 - (await ctx.sender.lamports(payer.publicKey));
    console.log(
      `      delegation deposits + fee paid by the payer: ${spent} lamports`
    );
    expect(spent > 5_000n).to.equal(true);
  });

  it("a second delegation is rejected (Match is no longer owned by the program)", async () => {
    const { ctx, ref, opponent } = await ready();
    expectOk(await joinAndDelegate(ctx, ref, opponent));
    expectError(
      await delegateMatch(ctx, ref, opponent),
      "AccountOwnedByWrongProgram"
    );
  });

  it("MatchNotActive for an Open (unjoined) match", async () => {
    const { ctx, ref, creator } = await ready();
    expectError(await delegateMatch(ctx, ref, creator), "MatchNotActive");
  });

  it("a match can't be delegated with another match's pot (pot seeds bind the match)", async () => {
    const a = await ready();
    expectOk(await joinMatch(a.ctx, a.ref, a.opponent));
    const { res, ref: other } = await createMatch(a.ctx, {
      creator: await newWallet(a.ctx),
    });
    expectOk(res);
    const ix = await a.ctx.program.methods
      .delegateMatch()
      .accountsStrict({
        ...v2.delegateMatchAccounts({
          programId: a.ctx.programId,
          payer: a.opponent.publicKey,
          matchAccount: a.ref.matchAccount,
        }),
        pot: other.pot,
      })
      .instruction();
    expectError(await a.ctx.sender.send([ix], a.opponent), "ConstraintSeeds");
  });
});
