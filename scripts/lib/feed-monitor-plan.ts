// Pure feed-monitor decisions (v2 PRD §10.4), unit-tested in CI. One state per (arena asset,
// ER region): each region's ER holds its own copy of the oracle feed, and a match reads the
// copy in its own region. Disabling is arena-wide (buys only; sells and valuation still work)
// and is never undone automatically: re-enabling is a human call (`pnpm v2:arena update
// <id> --enable SYM`). A disabled asset doesn't save live matches already holding it: if its
// feed is dead at end_ts, finalize misses the mark window and refund_stale pays everyone back.

export const ALERT_AFTER_S = 30;
export const DISABLE_AFTER_S = 120;

export interface FeedState {
  /** Unix seconds when the feed was first seen stale in this streak; null = fresh. */
  staleSince: number | null;
  alerted: boolean;
  disableRequested: boolean;
}

export const freshState = (): FeedState => ({
  staleSince: null,
  alerted: false,
  disableRequested: false,
});

export type FeedEvent = "alert" | "disable" | "recovered";

export interface Observation {
  /** Seconds since the feed's publish_time; null = account missing or invalid. */
  ageS: number | null;
  /** The arena's max_price_age_s (what `trade` enforces). */
  maxAgeS: number;
  /** Asset currently enabled in the arena. */
  enabled: boolean;
  nowS: number;
  /** --pause given: allowed to disable assets. */
  canDisable: boolean;
}

/** Next state + events for one observation. */
export function step(
  s: FeedState,
  o: Observation
): { state: FeedState; events: FeedEvent[] } {
  const stale = o.ageS === null || o.ageS > o.maxAgeS;
  if (!stale) {
    return { state: freshState(), events: s.alerted ? ["recovered"] : [] };
  }
  const since = s.staleSince ?? o.nowS;
  const streak = o.nowS - since;
  const events: FeedEvent[] = [];
  const next: FeedState = { ...s, staleSince: since };
  if (!s.alerted && streak >= ALERT_AFTER_S) {
    events.push("alert");
    next.alerted = true;
  }
  if (
    o.canDisable &&
    o.enabled &&
    !s.disableRequested &&
    streak >= DISABLE_AFTER_S
  ) {
    events.push("disable");
    next.disableRequested = true;
  }
  return { state: next, events };
}
