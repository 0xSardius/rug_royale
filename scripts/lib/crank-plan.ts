// Pure crank decisions (PRD §10.4), kept separate from I/O so they're unit-tested.
import { DuelStatus, type Duel } from "@rug-royale/sdk";

/** Seconds after a duel ends before the crank closes it (gives the UI time to show results). */
export const CLOSE_DELAY_SECS = 600n;
/** Cluster clock can lag wall clock; wait this long past a deadline before acting. */
export const CLOCK_GRACE_SECS = 2n;

export type CrankAction = "settle" | "cancel" | "close";

/** The one action the crank should take on this duel now, or null. */
export function planAction(
  d: Pick<Duel, "status" | "closed" | "endTs" | "joinDeadline">,
  now: bigint
): CrankAction | null {
  switch (d.status) {
    case DuelStatus.Active:
      return now >= d.endTs + CLOCK_GRACE_SECS ? "settle" : null;
    case DuelStatus.Open:
      return now >= d.joinDeadline + CLOCK_GRACE_SECS ? "cancel" : null;
    case DuelStatus.Settled:
      return !d.closed && now >= d.endTs + CLOSE_DELAY_SECS ? "close" : null;
    case DuelStatus.Cancelled:
      return !d.closed && now >= d.joinDeadline + CLOSE_DELAY_SECS
        ? "close"
        : null;
  }
}

/** Errors meaning another settler got there first: not a failure. */
export const BEATEN = new Set([
  "DuelNotActive",
  "DuelNotOpen",
  "AlreadyClosed",
]);
/** Errors meaning the cluster clock hasn't caught up yet: retry next tick. */
export const TOO_EARLY = new Set(["WindowNotEnded", "DeadlineNotReached"]);
