import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import {
  STALE_AFTER_SECS,
  activeMatch,
  cancelMatch,
  closeMatch,
  createMatch,
  expectError,
  expectOk,
  fetchMatch,
  finalizeMatch,
  joinMatch,
  newWallet,
  refundStale,
  setOwner,
  setupAdmin,
  settle,
  v2Ctx,
  v2Events,
} from "./fixtures";

// v2 PRD §6.2 close_match.
describe("v2 close_match", () => {
  async function settled() {
    const ctx = v2Ctx();
    const a = await activeMatch(ctx, { entryLamports: 100_000_000n });
    ctx.sender.warpTo(a.endTs);
    expectOk(await finalizeMatch(ctx, a.ref, a.creator));
    expectOk(await settle(ctx, a.ref, a.creator));
    return { ctx, ...a };
  }

  it("after settle: closes Pot and Match, all rent (and pot dust) to the creator; MatchClosed", async () => {
    const { ctx, ref, creator } = await settled();
    // Someone donates dust to the pot after settle: it's swept to the creator too.
    const donor = await newWallet(ctx);
    expectOk(
      await ctx.sender.send(
        [
          SystemProgram.transfer({
            fromPubkey: donor.publicKey,
            toPubkey: ref.pot,
            lamports: 777,
          }),
        ],
        donor
      )
    );
    const rent =
      (await ctx.sender.lamports(ref.pot)) +
      (await ctx.sender.lamports(ref.matchAccount));
    const b0 = await ctx.sender.lamports(creator.publicKey);
    const res = await closeMatch(ctx, ref, await newWallet(ctx)); // permissionless
    expectOk(res);
    console.log(`      close_match CU: ${res.cu}`);
    expect((await ctx.sender.lamports(creator.publicKey)) - b0).to.equal(rent);
    expect(await ctx.sender.accountData(ref.pot)).to.equal(null);
    expect(await ctx.sender.accountData(ref.matchAccount)).to.equal(null);
    const ev = v2Events(res).find((e) => e.name === "matchClosed")!;
    expect(ev.data.matchClosed).to.equal(true);
  });

  it("after cancel: closes both", async () => {
    const ctx = v2Ctx();
    await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const deadline = (await ctx.sender.now()) + 120n;
    const { ref } = await createMatch(ctx, { creator, joinDeadline: deadline });
    ctx.sender.warpTo(deadline);
    expectOk(await cancelMatch(ctx, ref, creator));
    expectOk(await closeMatch(ctx, ref, creator));
    expect(await ctx.sender.accountData(ref.matchAccount)).to.equal(null);
  });

  it("after refund_stale with Match still in the ER: only the Pot closes", async () => {
    const ctx = v2Ctx();
    await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const { ref } = await createMatch(ctx, { creator });
    expectOk(await joinMatch(ctx, ref, await newWallet(ctx)));
    const end = BigInt(
      (await fetchMatch(ctx, ref.matchAccount)).endTs.toString()
    );
    setOwner(ctx, ref.matchAccount, v2.DELEGATION_PROGRAM_ID);
    ctx.sender.warpTo(end + STALE_AFTER_SECS);
    expectOk(await refundStale(ctx, ref, creator));
    const res = await closeMatch(ctx, ref, creator);
    expectOk(res);
    expect(await ctx.sender.accountData(ref.pot)).to.equal(null);
    expect(
      ctx.sender.svm.getAccount(ref.matchAccount)!.owner.toString()
    ).to.equal(v2.DELEGATION_PROGRAM_ID.toBase58());
    expect(
      v2Events(res).find((e) => e.name === "matchClosed")!.data.matchClosed
    ).to.equal(false);
  });

  describe("typed errors", () => {
    it("MatchStillLive for Open and Active pots", async () => {
      const ctx = v2Ctx();
      const a = await activeMatch(ctx);
      expectError(await closeMatch(ctx, a.ref, a.creator), "MatchStillLive");
      const { ref: open } = await createMatch(ctx, { creator: a.creator });
      expectError(await closeMatch(ctx, open, a.creator), "MatchStillLive");
    });
    it("a second close fails (the Pot is gone)", async () => {
      const { ctx, ref, creator } = await settled();
      expectOk(await closeMatch(ctx, ref, creator));
      expectError(await closeMatch(ctx, ref, creator), "AccountNotInitialized");
    });
    for (const which of ["creator", "matchAccount"] as const) {
      it(`rent can't be redirected: wrong ${which} fails (ConstraintAddress)`, async () => {
        const { ctx, ref, creator } = await settled();
        expectError(
          await closeMatch(ctx, ref, creator, {
            [which]: Keypair.generate().publicKey,
          }),
          "ConstraintAddress"
        );
      });
    }
  });
});
