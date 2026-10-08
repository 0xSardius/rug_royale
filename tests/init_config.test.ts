import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { findConfig } from "@rug-royale/sdk";
import {
  createMints,
  defaultConfigArgs,
  expectError,
  expectOk,
  fetchConfig,
  initConfig,
  liteCtx,
  newWallet,
  type ConfigArgs,
} from "./fixtures";

// PRD §6.1.
describe("init_config", () => {
  async function setup() {
    const ctx = liteCtx();
    const admin = await newWallet(ctx, 50);
    const mints = await createMints(ctx, admin);
    const treasury = Keypair.generate().publicKey;
    const args = (o: Partial<ConfigArgs> = {}) =>
      defaultConfigArgs(mints, treasury, o);
    return { ctx, admin, mints, treasury, args };
  }

  it("writes every field and both bumps", async () => {
    const { ctx, admin, mints, treasury, args } = await setup();
    expectOk(
      await initConfig(ctx, admin, args({ windows: [30, 120, 300, 900] }))
    );
    const c = await fetchConfig(ctx, findConfig(ctx.programId)[0]);
    expect(c.admin.equals(admin.publicKey)).to.equal(true);
    expect(c.treasury.equals(treasury)).to.equal(true);
    expect(c.quoteMint.equals(mints.quote)).to.equal(true);
    expect(c.windows).to.deep.equal([30, 120, 300, 900]);
    expect(c.poolSeedRatio).to.equal(5n);
    expect([c.rakeBps, c.swapFeeBps]).to.deep.equal([250, 30]);
    expect(c.bump).to.be.greaterThan(0);
    expect(c.mintAuthorityBump).to.be.greaterThan(0);
  });

  it("can only be initialized once", async () => {
    const { ctx, admin, args } = await setup();
    expectOk(await initConfig(ctx, admin, args()));
    const again = await initConfig(ctx, admin, args());
    expect(again.ok).to.equal(false);
  });

  describe("typed errors", () => {
    const cases: [
      string,
      (m: { quote: PublicKey; coins: PublicKey[] }) => Partial<ConfigArgs>
    ][] = [
      ["RakeTooHigh", () => ({ rakeBps: 1001 })],
      ["FeeTooHigh", () => ({ swapFeeBps: 1001 })],
      ["InvalidWindowSet", () => ({ windows: [0, 120, 300, 900] })],
      ["InvalidWindowSet", () => ({ windows: [120, 120, 300, 900] })],
      ["InvalidWindowSet", () => ({ windows: [120, 300, 900, 600] })],
      ["InvalidTierSet", () => ({ tiers: [new BN(1), new BN(0), new BN(3)] })],
      [
        "InvalidMintList",
        (m) => ({ allowedMints: [m.coins[0], ...m.coins.slice(0, 9)] }),
      ],
      [
        "InvalidMintList",
        (m) => ({ allowedMints: [m.quote, ...m.coins.slice(1)] }),
      ],
      [
        "InvalidMintList",
        (m) => ({ allowedMints: [PublicKey.default, ...m.coins.slice(1)] }),
      ],
      ["InvalidSeedRatio", () => ({ poolSeedRatio: new BN(0) })],
    ];
    cases.forEach(([name, override], i) => {
      it(`${name} (case ${i + 1})`, async () => {
        const { ctx, admin, mints, args } = await setup();
        expectError(await initConfig(ctx, admin, args(override(mints))), name);
      });
    });

    it("checks run in PRD order: the first failing check wins", async () => {
      const { ctx, admin, args } = await setup();
      const bad = { rakeBps: 1001, swapFeeBps: 1001, poolSeedRatio: new BN(0) };
      expectError(await initConfig(ctx, admin, args(bad)), "RakeTooHigh");
      expectError(
        await initConfig(ctx, admin, args({ ...bad, rakeBps: 250 })),
        "FeeTooHigh"
      );
      expectError(
        await initConfig(
          ctx,
          admin,
          args({ ...bad, rakeBps: 250, swapFeeBps: 30 })
        ),
        "InvalidSeedRatio"
      );
    });
  });
});
