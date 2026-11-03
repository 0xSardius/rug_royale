import { expect } from "chai";
import {
  createMatch,
  defaultProtocolArgs,
  expectError,
  expectOk,
  fetchPot,
  newWallet,
  setupAdmin,
  sponsorMatch,
  updateProtocol,
  v2Ctx,
  v2Events,
} from "./fixtures";

const MIN = 10_000_000n; // MIN_SPONSOR_LAMPORTS
const POT_SPACE = 8 + 258;

// v2 PRD §6.2 sponsor_match.
describe("v2 sponsor_match", () => {
  async function ready(entry = 0n) {
    const ctx = v2Ctx();
    const admin = await setupAdmin(ctx);
    const creator = await newWallet(ctx);
    const sponsor = await newWallet(ctx);
    const { res, ref } = await createMatch(ctx, {
      creator,
      entryLamports: entry,
    });
    expectOk(res);
    return { ctx, ref, sponsor, ...admin };
  }

  it("moves the amount into the pot, records the sponsor, emits MatchSponsored", async () => {
    const { ctx, ref, sponsor } = await ready(50_000_000n);
    const before = await ctx.sender.lamports(ref.pot);
    const res = await sponsorMatch(ctx, ref, sponsor, 250_000_000n);
    expectOk(res);
    console.log(`      sponsor_match CU: ${res.cu}`);
    const pot = await fetchPot(ctx, ref.pot);
    expect(pot.sponsoredLamports.toString()).to.equal("250000000");
    expect(pot.sponsor.equals(sponsor.publicKey)).to.equal(true);
    expect(await ctx.sender.lamports(ref.pot)).to.equal(before + 250_000_000n);
    const ev = v2Events(res).find((e) => e.name === "matchSponsored")!;
    expect([ev.data.amount.toString(), ev.data.total.toString()]).to.deep.equal(
      ["250000000", "250000000"]
    );
    expect(ev.data.matchAccount.equals(ref.matchAccount)).to.equal(true);
  });

  it("the same sponsor can top up by any amount; total accumulates", async () => {
    const { ctx, ref, sponsor } = await ready();
    expectOk(await sponsorMatch(ctx, ref, sponsor, MIN));
    const res = await sponsorMatch(ctx, ref, sponsor, 7n);
    expectOk(res);
    expect(
      (await fetchPot(ctx, ref.pot)).sponsoredLamports.toString()
    ).to.equal((MIN + 7n).toString());
    const ev = v2Events(res).find((e) => e.name === "matchSponsored")!;
    expect(ev.data.total.toString()).to.equal((MIN + 7n).toString());
  });

  it("I1: pot = rent + entry + fee share + sponsored", async () => {
    const { ctx, ref, sponsor } = await ready(0n);
    expectOk(await sponsorMatch(ctx, ref, sponsor, MIN + 3n));
    const share = 1_505_000n; // ceil(3_010_000 / 2)
    expect(await ctx.sender.lamports(ref.pot)).to.equal(
      (await ctx.sender.rentExempt(POT_SPACE)) + share + MIN + 3n
    );
  });

  describe("typed errors, in PRD order", () => {
    it("Paused when the protocol is paused", async () => {
      const { ctx, ref, sponsor, admin, treasury } = await ready();
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs({ paused: true })
        )
      );
      expectError(await sponsorMatch(ctx, ref, sponsor, MIN), "Paused");
    });
    it("MatchNotOpen once the pot is no longer Open", async () => {
      const { ctx, ref, sponsor } = await ready();
      // Simulate a non-Open pot (join lands in item 3.3): flip the status byte.
      const acc = ctx.sender.svm.getAccount(ref.pot)!;
      const data = Buffer.from(acc.data);
      data[8] = 1; // Active
      ctx.sender.svm.setAccount(ref.pot, { ...acc, data });
      expectError(await sponsorMatch(ctx, ref, sponsor, MIN), "MatchNotOpen");
    });
    it("ZeroAmount for 0", async () => {
      const { ctx, ref, sponsor } = await ready();
      expectError(await sponsorMatch(ctx, ref, sponsor, 0n), "ZeroAmount");
    });
    it("SponsorMismatch for a second, different sponsor", async () => {
      const { ctx, ref, sponsor } = await ready();
      expectOk(await sponsorMatch(ctx, ref, sponsor, MIN));
      expectError(
        await sponsorMatch(ctx, ref, await newWallet(ctx), MIN),
        "SponsorMismatch"
      );
    });
    it("SponsorTooSmall for a first sponsorship below 0.01 SOL (L2)", async () => {
      const { ctx, ref, sponsor } = await ready();
      expectError(
        await sponsorMatch(ctx, ref, sponsor, MIN - 1n),
        "SponsorTooSmall"
      );
      expectOk(await sponsorMatch(ctx, ref, sponsor, MIN));
    });
    it("the first failing check wins", async () => {
      const { ctx, ref, sponsor, admin, treasury } = await ready();
      expectOk(await sponsorMatch(ctx, ref, sponsor, MIN));
      const other = await newWallet(ctx);
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs({ paused: true })
        )
      );
      expectError(await sponsorMatch(ctx, ref, other, 0n), "Paused");
      expectOk(
        await updateProtocol(
          ctx,
          admin,
          treasury,
          admin.publicKey,
          defaultProtocolArgs()
        )
      );
      expectError(await sponsorMatch(ctx, ref, other, 0n), "ZeroAmount");
      expectError(await sponsorMatch(ctx, ref, other, 1n), "SponsorMismatch");
    });
  });
});
