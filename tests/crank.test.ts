import { expect } from "chai";
import { DuelStatus } from "@rug-royale/sdk";
import {
  BEATEN,
  CLOCK_GRACE_SECS,
  CLOSE_DELAY_SECS,
  planAction,
} from "../scripts/lib/crank-plan";

describe("crank plan (PRD §10.4)", () => {
  const end = 1_000_000n;
  const deadline = 2_000_000n;
  const duel = (status: DuelStatus, closed = false) => ({
    status,
    closed,
    endTs: end,
    joinDeadline: deadline,
  });

  it("settles an Active duel only after end_ts (plus clock grace)", () => {
    expect(planAction(duel(DuelStatus.Active), end - 1n)).to.equal(null);
    expect(planAction(duel(DuelStatus.Active), end)).to.equal(null);
    expect(
      planAction(duel(DuelStatus.Active), end + CLOCK_GRACE_SECS)
    ).to.equal("settle");
  });

  it("cancels an Open duel only after join_deadline (plus clock grace)", () => {
    expect(planAction(duel(DuelStatus.Open), deadline - 1n)).to.equal(null);
    expect(
      planAction(duel(DuelStatus.Open), deadline + CLOCK_GRACE_SECS)
    ).to.equal("cancel");
  });

  it("closes Settled duels 10 minutes after end_ts, and Cancelled ones after join_deadline", () => {
    expect(
      planAction(duel(DuelStatus.Settled), end + CLOSE_DELAY_SECS - 1n)
    ).to.equal(null);
    expect(
      planAction(duel(DuelStatus.Settled), end + CLOSE_DELAY_SECS)
    ).to.equal("close");
    expect(
      planAction(duel(DuelStatus.Cancelled), deadline + CLOSE_DELAY_SECS)
    ).to.equal("close");
  });

  it("treats a lost close race (AccountNotInitialized) as beaten, not a failure", () => {
    expect(BEATEN.has("AccountNotInitialized")).to.equal(true);
  });

  it("never touches a duel that is already closed", () => {
    expect(
      planAction(duel(DuelStatus.Settled, true), end + 10n * CLOSE_DELAY_SECS)
    ).to.equal(null);
    expect(
      planAction(
        duel(DuelStatus.Cancelled, true),
        deadline + 10n * CLOSE_DELAY_SECS
      )
    ).to.equal(null);
  });
});
