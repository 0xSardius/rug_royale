import { expect } from "chai";
import { Transaction } from "@solana/web3.js";
import { FailedTransactionMetadata } from "litesvm";
import { setup } from "./setup";

// Harness check: program loads in LiteSVM and an instruction built from the IDL executes.
// Delete once real handler suites exist.
describe("smoke", () => {
  it("loads the program and executes a stubbed handler", async () => {
    const { svm, payer, program } = setup();
    const ix = await program.methods
      .joinDuel()
      .accounts({ opponent: payer.publicKey })
      .instruction();
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = payer.publicKey;
    tx.sign(payer);
    const res = svm.sendTransaction(tx);
    expect(res instanceof FailedTransactionMetadata, String(res)).to.equal(
      false
    );
  });
});
