import { expect } from "chai";
import {
  MemoryLimiter,
  WINDOW_MS,
  clientIp,
  costOf,
  upstashCheck,
} from "../app/lib/rate-limit";

// /api/rpc rate limiting: nobody can spend the RPC provider's credits through the proxy.
describe("app /api/rpc rate limit", () => {
  const r = (method: string) => ({ jsonrpc: "2.0", id: 1, method });

  it("weights getProgramAccounts (the lobby's expensive call) above point reads; batches add up", () => {
    expect(costOf(r("getAccountInfo"))).to.equal(1);
    expect(costOf(r("getProgramAccounts"))).to.equal(10);
    expect(
      costOf([r("getProgramAccounts"), r("getSlot"), r("getTransaction")])
    ).to.equal(13);
  });

  it("takes the client IP from x-forwarded-for's first entry, then x-real-ip", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))
    ).to.equal("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).to.equal(
      "5.6.7.8"
    );
    expect(clientIp(new Headers())).to.equal("unknown");
  });

  it("memory limiter: allows up to the budget per window, then 429s until the window resets; per IP", () => {
    let t = 10 * WINDOW_MS + 1_000;
    const lim = new MemoryLimiter(25, () => t);
    expect(lim.check("a", 10).allowed).to.equal(true);
    expect(lim.check("a", 10).allowed).to.equal(true);
    const denied = lim.check("a", 10); // 30 > 25
    expect([denied.allowed, denied.used, denied.retryAfterS]).to.deep.equal([
      false,
      20,
      59,
    ]);
    expect(lim.check("a", 5).allowed).to.equal(true); // exactly 25
    expect(lim.check("b", 25).allowed).to.equal(true); // another IP has its own budget
    t += WINDOW_MS;
    expect(lim.check("a", 25).allowed).to.equal(true); // new window
  });

  it("upstash: one INCRBY + EXPIRE pipeline per request; over the limit is rejected; errors throw", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let reply: unknown = [{ result: 7 }, { result: 1 }];
    let status = 200;
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: status === 200, status, json: async () => reply };
    }) as unknown as typeof fetch;
    const now = 3 * WINDOW_MS + 500;

    const ok = await upstashCheck(
      "https://x.upstash.io/",
      "tok",
      "1.2.3.4",
      10,
      300,
      now,
      fake
    );
    expect([ok.allowed, ok.used]).to.deep.equal([true, 7]);
    expect(calls[0].url).to.equal("https://x.upstash.io/pipeline");
    expect(
      (calls[0].init.headers as Record<string, string>).authorization
    ).to.equal("Bearer tok");
    expect(JSON.parse(calls[0].init.body as string)).to.deep.equal([
      ["INCRBY", "rl:rpc:1.2.3.4:3", 10],
      ["EXPIRE", "rl:rpc:1.2.3.4:3", 120],
    ]);

    reply = [{ result: 301 }, { result: 1 }];
    expect(
      (
        await upstashCheck(
          "https://x.upstash.io",
          "tok",
          "1.2.3.4",
          1,
          300,
          now,
          fake
        )
      ).allowed
    ).to.equal(false);

    status = 500;
    let threw = false;
    try {
      await upstashCheck(
        "https://x.upstash.io",
        "tok",
        "ip",
        1,
        300,
        now,
        fake
      );
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
