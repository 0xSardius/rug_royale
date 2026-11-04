import { expect } from "chai";
import { v2 } from "@rug-royale/sdk";
import {
  BEATEN,
  CLOCK_GRACE_SECS,
  CLOSE_DELAY_SECS,
  MARK_TOLERANCE_S,
  STALE_AFTER_SECS,
  TOO_EARLY,
  finalizeWindowMs,
  planAction,
} from "../scripts/lib/crank-plan-v2";

const { PotStatus: P, MatchStatus: M } = v2;

describe("crank v2 plan (v2 PRD §10.3)", () => {
  const end = 1_000_000n;
  const deadline = 900_000n;
  const pot = (status: v2.PotStatus) => ({
    status,
    endTs: end,
    joinDeadline: deadline,
  });
  const er = (status: v2.MatchStatus) => ({ location: "er" as const, status });
  const base = (status: v2.MatchStatus) => ({
    location: "base" as const,
    status,
  });

  it("cancels an Open pot only after join_deadline (plus clock grace)", () => {
    expect(planAction(pot(P.Open), base(M.Open), deadline)).to.equal(null);
    expect(
      planAction(pot(P.Open), base(M.Open), deadline + CLOCK_GRACE_SECS)
    ).to.equal("cancel");
  });

  it("finalizes an Active match in the ER exactly within [end_ts, end_ts + 5]", () => {
    const m = er(M.Active);
    expect(planAction(pot(P.Active), m, end - 1n)).to.equal(null);
    expect(planAction(pot(P.Active), m, end)).to.equal("finalize");
    expect(planAction(pot(P.Active), m, end + MARK_TOLERANCE_S)).to.equal(
      "finalize"
    );
    expect(planAction(pot(P.Active), m, end + MARK_TOLERANCE_S + 1n)).to.equal(
      null
    ); // missed: wait for refund
  });

  it("waits while the commit is in flight (Finalized in the ER), then settles once home", () => {
    expect(planAction(pot(P.Active), er(M.Finalized), end + 3n)).to.equal(null);
    expect(planAction(pot(P.Active), base(M.Finalized), end + 3n)).to.equal(
      "settle"
    );
  });

  it("delegates a joined-but-undelegated match before end_ts; afterwards only the safety net", () => {
    expect(planAction(pot(P.Active), base(M.Active), end - 10n)).to.equal(
      "delegate"
    );
    expect(planAction(pot(P.Active), base(M.Active), end)).to.equal(null);
    expect(
      planAction(pot(P.Active), base(M.Active), end + STALE_AFTER_SECS)
    ).to.equal("refund");
  });

  it("refunds a stuck match after 24 h, wherever it is; settle wins if it's home and final", () => {
    for (const m of [
      er(M.Active),
      er(M.Finalized),
      { location: "missing" as const, status: null },
    ]) {
      expect(
        planAction(pot(P.Active), m, end + STALE_AFTER_SECS - 1n)
      ).to.equal(null);
      expect(planAction(pot(P.Active), m, end + STALE_AFTER_SECS)).to.equal(
        "refund"
      );
    }
    expect(
      planAction(pot(P.Active), base(M.Finalized), end + STALE_AFTER_SECS)
    ).to.equal("settle");
  });

  it("closes Settled/Refunded pots 10 min after end_ts, Cancelled ones after the join deadline", () => {
    for (const s of [P.Settled, P.Refunded]) {
      expect(
        planAction(pot(s), base(M.Finalized), end + CLOSE_DELAY_SECS - 1n)
      ).to.equal(null);
      expect(
        planAction(pot(s), base(M.Finalized), end + CLOSE_DELAY_SECS)
      ).to.equal("close");
    }
    expect(
      planAction(pot(P.Cancelled), base(M.Open), deadline + CLOSE_DELAY_SECS)
    ).to.equal("close");
  });

  it("finalize fires just after end_ts and gives up at end_ts + 5 s", () => {
    expect(finalizeWindowMs(1_000n)).to.deep.equal({
      firstAttemptAt: 1_000_200,
      giveUpAt: 1_005_000,
    });
  });

  it("race and timing errors are classified, and every name is a real v2 or Anchor error", () => {
    const v2Names = new Set<string>(
      v2.IDL_JSON.errors.map((e) => e.name as string)
    );
    const anchor = new Set([
      "AccountNotInitialized",
      "AccountOwnedByWrongProgram",
    ]);
    for (const n of [...BEATEN, ...TOO_EARLY])
      expect(v2Names.has(n) || anchor.has(n), n).to.equal(true);
    for (const n of BEATEN) expect(TOO_EARLY.has(n), n).to.equal(false);
  });
});
