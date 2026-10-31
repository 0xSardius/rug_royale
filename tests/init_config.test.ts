import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import {
  ExtensionType,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  createInitializeMintCloseAuthorityInstruction,
  getMintLen,
} from "@solana/spl-token";
import { findConfig, findMintAuthority } from "@rug-royale/sdk";
import {
  createMints,
  defaultConfigArgs,
  expectError,
  expectOk,
  fetchConfig,
  initConfig,
  liteCtx,
  newTreasury,
  newWallet,
  type Ctx,
  type ConfigArgs,
} from "./fixtures";

/** A mint that breaks one demo-mint rule (G3, G11), for InvalidMintAccount. */
async function badMint(
  ctx: Ctx,
  payer: Keypair,
  kind: "wrongAuthority" | "freezeAuthority" | "legacyToken" | "extension"
): Promise<PublicKey> {
  const mint = Keypair.generate();
  const [pda] = findMintAuthority(ctx.programId);
  const program =
    kind === "legacyToken" ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const space =
    kind === "extension"
      ? getMintLen([ExtensionType.MintCloseAuthority])
      : MINT_SIZE;
  const ixs = [
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports: Number(await ctx.sender.rentExempt(space)),
      space,
      programId: program,
    }),
  ];
  if (kind === "extension")
    ixs.push(
      createInitializeMintCloseAuthorityInstruction(
        mint.publicKey,
        payer.publicKey,
        program
      )
    );
  ixs.push(
    createInitializeMint2Instruction(
      mint.publicKey,
      6,
      kind === "wrongAuthority" ? payer.publicKey : pda,
      kind === "freezeAuthority" ? payer.publicKey : null,
      program
    )
  );
  expectOk(await ctx.sender.send(ixs, payer, [mint]));
  return mint.publicKey;
}

// PRD §6.1.
describe("init_config", () => {
  async function setup() {
    const ctx = liteCtx();
    const admin = await newWallet(ctx, 50);
    const mints = await createMints(ctx, admin);
    const treasury = await newTreasury(ctx);
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

  describe("upgrade authority (front-run protection)", () => {
    it("rejects a signer who is not the upgrade authority", async () => {
      const { ctx, admin, args } = await setup();
      const attacker = await newWallet(ctx, 5);
      expectError(
        await initConfig(ctx, attacker, args(), {
          upgradeAuthority: admin.publicKey,
        }),
        "Unauthorized"
      );
      // The real authority can still initialize afterwards.
      expectOk(await initConfig(ctx, admin, args()));
    });

    it("rejects everyone once the program is immutable", async () => {
      const { ctx, admin, args } = await setup();
      expectError(
        await initConfig(ctx, admin, args(), { upgradeAuthority: null }),
        "Unauthorized"
      );
    });

    it("Unauthorized runs before every argument check", async () => {
      const { ctx, admin, args } = await setup();
      const attacker = await newWallet(ctx, 5);
      expectError(
        await initConfig(ctx, attacker, args({ rakeBps: 1001 }), {
          upgradeAuthority: admin.publicKey,
        }),
        "Unauthorized"
      );
    });
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
      ["InvalidMintList", (m) => ({ allowedMints: m.coins.slice(0, 9) })],
      ["InvalidSeedRatio", () => ({ poolSeedRatio: new BN(0) })],
      // An unfunded wallet: a small rake would fail settle with InsufficientFundsForRent.
      ["InvalidTreasury", () => ({ treasury: Keypair.generate().publicKey })],
      // Pubkey::default() is the (executable) System Program.
      ["InvalidTreasury", () => ({ treasury: PublicKey.default })],
      // Not System-owned.
      ["InvalidTreasury", (m) => ({ treasury: m.quote })],
      ["TipTooHigh", () => ({ settlerTipLamports: new BN(10_000_001) })],
    ];
    cases.forEach(([name, override], i) => {
      it(`${name} (case ${i + 1})`, async () => {
        const { ctx, admin, mints, args } = await setup();
        expectError(await initConfig(ctx, admin, args(override(mints))), name);
      });
    });

    const mintKinds = [
      "wrongAuthority",
      "freezeAuthority",
      "legacyToken",
      "extension",
    ] as const;
    mintKinds.forEach((kind) => {
      it(`InvalidMintAccount: coin mint with ${kind}`, async () => {
        const { ctx, admin, mints, args } = await setup();
        const bad = await badMint(ctx, admin, kind);
        expectError(
          await initConfig(
            ctx,
            admin,
            args({ allowedMints: [...mints.coins.slice(0, 9), bad] })
          ),
          "InvalidMintAccount"
        );
      });
    });

    it("InvalidMintAccount: quote mint with a freeze authority", async () => {
      const { ctx, admin, args } = await setup();
      const quoteMint = await badMint(ctx, admin, "freezeAuthority");
      expectError(
        await initConfig(ctx, admin, args({ quoteMint })),
        "InvalidMintAccount"
      );
    });

    it("accepts the maximum settler tip", async () => {
      const { ctx, admin, args } = await setup();
      expectOk(
        await initConfig(
          ctx,
          admin,
          args({ settlerTipLamports: new BN(10_000_000) })
        )
      );
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
      const late = {
        treasury: Keypair.generate().publicKey,
        settlerTipLamports: new BN(10_000_001),
      };
      expectError(await initConfig(ctx, admin, args(late)), "InvalidTreasury");
      expectError(
        await initConfig(
          ctx,
          admin,
          args({ settlerTipLamports: late.settlerTipLamports })
        ),
        "TipTooHigh"
      );
    });
  });
});
