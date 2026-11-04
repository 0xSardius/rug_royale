// Pure crank v2 decisions (v2 PRD §10.3), separate from I/O so they're unit-tested in CI.
// Where a match is comes from its BASE-LAYER owner (v2.matchLocation), never the router,
// which can report a match as delegated long after it came home (2026-11-04).
import { v2 } from "@rug-royale/sdk";

/** Cluster clock can lag wall clock; wait this long past a deadline before acting. */
export const CLOCK_GRACE_SECS = 2n;
/** Seconds after the end (or join deadline) before closing, so the UI can show results. */
export const CLOSE_DELAY_SECS = 600n;
/** v2 constants (programs/rug_royale_v2/src/constants.rs). */
export const MARK_TOLERANCE_S = 5n;
export const STALE_AFTER_SECS = 86_400n;

export type CrankAction =
  | "cancel"
  | "delegate"
  | "finalize"
  | "settle"
  | "refund"
  | "close";

export interface MatchView {
  /** From the base-layer owner: in the ER, home on base, or gone. */
  location: v2.MatchLocation;
  /** Read from wherever the live copy is (ER when "er", base when "base"); null if unknown. */
  status: v2.MatchStatus | null;
}

/**
 * The one action to take on a pot now (null = nothing to do yet). `finalize` is returned
 * while the mark window is open; the runtime schedules it precisely at end_ts.
 */
export function planAction(
  pot: Pick<v2.Pot, "status" | "endTs" | "joinDeadline">,
  m: MatchView,
  now: bigint
): CrankAction | null {
  switch (pot.status) {
    case v2.PotStatus.Open:
      return now >= pot.joinDeadline + CLOCK_GRACE_SECS ? "cancel" : null;

    case v2.PotStatus.Active: {
      const stale = now >= pot.endTs + STALE_AFTER_SECS;
      // Home and finalized: settle (beats refund even when stale; it pays the real result).
      if (m.location === "base" && m.status === v2.MatchStatus.Finalized)
        return "settle";
      // Joined but never delegated (the join+delegate tx was split or delegate failed).
      if (m.location === "base" && m.status === v2.MatchStatus.Active)
        return now < pot.endTs ? "delegate" : stale ? "refund" : null;
      if (m.location === "er" && m.status === v2.MatchStatus.Active) {
        if (now >= pot.endTs && now <= pot.endTs + MARK_TOLERANCE_S)
          return "finalize";
        return stale ? "refund" : null;
      }
      // In the ER and Finalized (commit in flight), unknown, or missing: only the safety net.
      return stale ? "refund" : null;
    }

    case v2.PotStatus.Settled:
    case v2.PotStatus.Refunded:
      return now >= pot.endTs + CLOSE_DELAY_SECS ? "close" : null;
    case v2.PotStatus.Cancelled:
      return now >= pot.joinDeadline + CLOSE_DELAY_SECS ? "close" : null;
  }
  return null;
}

/** When to fire finalize (ms since epoch): just after end_ts, and the last useful moment. */
export function finalizeWindowMs(endTs: bigint, leadMs = 200) {
  const end = Number(endTs) * 1000;
  return {
    firstAttemptAt: end + leadMs,
    giveUpAt: end + Number(MARK_TOLERANCE_S) * 1000,
  };
}

/** Errors meaning another crank/player already did it: not a failure. */
export const BEATEN = new Set([
  "MatchNotOpen", // cancel: already cancelled or joined
  "MatchNotActive", // finalize/delegate: already finalized
  "PotNotActive", // settle/refund: already paid
  "AccountNotInitialized", // close: already closed
  "AccountOwnedByWrongProgram", // delegate: already delegated
]);

/** Errors meaning "not yet": retry (finalize retries fast inside its window). */
export const TOO_EARLY = new Set([
  "WindowNotEnded",
  "DeadlineNotReached",
  "NotStaleYet",
  "MatchStillDelegated",
  "MarkWindowMissed", // inside the window this means no mark published at/after end_ts yet
]);
