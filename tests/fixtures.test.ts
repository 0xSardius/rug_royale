import { expect } from "chai";
import { unpackMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  findConfig,
  findEscrow,
  findMintAuthority,
  playerVaults,
  poolAccounts,
} from "@rug-royale/sdk";
import {
  DECIMALS,
  createDuel,
  expectOk,
  liteCtx,
  newWallet,
  setupProtocol,
} from "./fixtures";

// Checks the harness itself and that the frozen account structs accept the SDK account
// maps. Handler logic is still stubbed, so this asserts accounts exist, not their contents.
describe("fixtures", () => {
  it("creates Token-2022 mints owned by the MintAuthority PDA and inits Config", async () => {
    const ctx = liteCtx();
    const { mints } = await setupProtocol(ctx);
    const [authority] = findMintAuthority(ctx.programId);
    for (const m of [mints.quote, ...mints.coins]) {
      const data = await ctx.sender.accountData(m);
      const mint = unpackMint(
        m,
        {
          data: data!,
          owner: TOKEN_2022_PROGRAM_ID,
          lamports: 0,
          executable: false,
        },
        TOKEN_2022_PROGRAM_ID
      );
      expect(mint.mintAuthority?.toBase58()).to.equal(authority.toBase58());
      expect(mint.decimals).to.equal(DECIMALS);
    }
    expect(mints.coins).to.have.length(10);
    expect(
      await ctx.sender.accountData(findConfig(ctx.programId)[0])
    ).to.not.equal(null);
  });

  it("create_duel initializes duel, escrow, pool, and all four token accounts", async () => {
    const ctx = liteCtx();
    const { mints } = await setupProtocol(ctx);
    const creator = await newWallet(ctx);
    const { res, ref } = await createDuel(ctx, { creator, mints });
    expectOk(res);
    const v = playerVaults(ref, creator.publicKey);
    const p = poolAccounts(ref);
    for (const pk of [
      ref.duel,
      findEscrow(ctx.programId, ref.duel)[0],
      p.pool,
      p.quote,
      p.coin,
      v.quote,
      v.coin,
    ]) {
      expect(await ctx.sender.accountData(pk), pk.toBase58()).to.not.equal(
        null
      );
    }
    console.log(
      `      create_duel CU (stub handler, accounts only): ${res.cu}`
    );
  });

  it("can warp the LiteSVM clock", async () => {
    const ctx = liteCtx();
    const t = await ctx.sender.now();
    ctx.sender.warpTo(t + 3_600n);
    expect(await ctx.sender.now()).to.equal(t + 3_600n);
  });
});
