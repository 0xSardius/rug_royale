import { expect } from "chai";
import { Keypair, Transaction } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { FailedTransactionMetadata } from "litesvm";
import { findConfig } from "@rug-royale/sdk";
import { setup, PROGRAM_ID } from "./setup";

// Harness check: program loads in LiteSVM and an IDL-built instruction executes.
// Delete once the init_config suite exists.
describe("smoke", () => {
  it("runs init_config and creates the Config PDA", async () => {
    const { svm, payer, program } = setup();
    const mints = Array.from({ length: 10 }, () => Keypair.generate().publicKey);
    const ix = await program.methods
      .initConfig({
        treasury: payer.publicKey,
        quoteMint: Keypair.generate().publicKey,
        allowedMints: mints,
        tiers: [new BN(1), new BN(2), new BN(3)],
        windows: [30, 120, 300, 900],
        poolSeedRatio: new BN(10),
        settlerTipLamports: new BN(1_000_000),
        maxEntryLamports: new BN(1_000_000_000),
        rakeBps: 250,
        swapFeeBps: 30,
      })
      .accounts({ admin: payer.publicKey })
      .instruction();
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = payer.publicKey;
    tx.sign(payer);
    const res = svm.sendTransaction(tx);
    expect(res instanceof FailedTransactionMetadata, String(res)).to.equal(false);
    const [config] = findConfig(PROGRAM_ID);
    expect(svm.getAccount(config)?.owner.toBase58()).to.equal(PROGRAM_ID.toBase58());
  });
});
