import { expect } from "chai";
import {
  ALLOWED_METHODS,
  MAX_BATCH,
  MAX_BODY_BYTES,
  checkRpcBody,
} from "../app/lib/rpc-allowlist";

// The /api/rpc proxy keeps the RPC provider's API key server-side; it must not be an open proxy.
describe("app /api/rpc allowlist", () => {
  const req = (method: string, id = 1) => ({
    jsonrpc: "2.0",
    id,
    method,
    params: [],
  });

  it("passes the methods the app and wallet adapter use", () => {
    for (const m of [
      "getAccountInfo",
      "getProgramAccounts",
      "getMultipleAccounts",
      "getLatestBlockhash",
      "sendTransaction",
      "getSignatureStatuses",
    ])
      expect(checkRpcBody(JSON.stringify(req(m))).ok, m).to.equal(true);
  });

  it("rejects anything else (403), including in a batch", () => {
    for (const m of [
      "requestAirdrop",
      "getLargestAccounts",
      "minimumLedgerSlot",
      "",
    ]) {
      const r = checkRpcBody(JSON.stringify(req(m)));
      expect(r.ok === false && r.status === 403, m).to.equal(true);
    }
    const mixed = checkRpcBody(
      JSON.stringify([req("getSlot"), req("requestAirdrop", 2)])
    );
    expect(mixed.ok).to.equal(false);
    expect(ALLOWED_METHODS.has("requestAirdrop")).to.equal(false);
  });

  it("rejects bad JSON (400), oversized bodies (413), empty and oversized batches (400)", () => {
    const st = (raw: string) => {
      const r = checkRpcBody(raw);
      return r.ok ? 200 : r.status;
    };
    expect(st("{not json")).to.equal(400);
    expect(st("x".repeat(MAX_BODY_BYTES + 1))).to.equal(413);
    expect(st("[]")).to.equal(400);
    expect(
      st(
        JSON.stringify(
          Array.from({ length: MAX_BATCH + 1 }, (_, i) => req("getSlot", i))
        )
      )
    ).to.equal(400);
    expect(
      st(
        JSON.stringify(
          Array.from({ length: MAX_BATCH }, (_, i) => req("getSlot", i))
        )
      )
    ).to.equal(200);
  });
});
