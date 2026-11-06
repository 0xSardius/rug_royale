import { expect } from "chai";
import {
  ALERT_AFTER_S,
  DISABLE_AFTER_S,
  freshState,
  step,
  type FeedState,
  type Observation,
} from "../scripts/lib/feed-monitor-plan";

describe("feed monitor plan (v2 PRD §10.4)", () => {
  const obs = (
    nowS: number,
    ageS: number | null,
    o: Partial<Observation> = {}
  ): Observation => ({
    ageS,
    maxAgeS: 5,
    enabled: true,
    nowS,
    canDisable: true,
    ...o,
  });
  const run = (seq: Observation[], s: FeedState = freshState()) => {
    const out: string[][] = [];
    for (const o of seq) {
      const r = step(s, o);
      s = r.state;
      out.push(r.events);
    }
    return { events: out, state: s };
  };

  it("a fresh feed produces nothing", () => {
    expect(run([obs(0, 0), obs(5, 5), obs(10, 1)]).events.flat()).to.deep.equal(
      []
    );
  });

  it("stale for 30 s alerts once; 120 s disables once (with --pause); age == max is still fresh", () => {
    const { events } = run([
      obs(1000, 6),
      obs(1000 + ALERT_AFTER_S - 1, 40),
      obs(1000 + ALERT_AFTER_S, 41),
      obs(1000 + 60, 70),
      obs(1000 + DISABLE_AFTER_S, 130),
      obs(1000 + DISABLE_AFTER_S + 30, 160),
    ]);
    expect(events).to.deep.equal([[], [], ["alert"], [], ["disable"], []]);
    expect(step(freshState(), obs(0, 5)).state.staleSince).to.equal(null);
  });

  it("a missing/invalid feed counts as stale", () => {
    expect(run([obs(0, null), obs(ALERT_AFTER_S, null)]).events).to.deep.equal([
      [],
      ["alert"],
    ]);
  });

  it("without --pause (or if already disabled) it only alerts", () => {
    const seq = (o: Partial<Observation>) =>
      [obs(0, 9, o), obs(DISABLE_AFTER_S, 200, o)].map((x) => x);
    expect(run(seq({ canDisable: false })).events.flat()).to.deep.equal([
      "alert",
    ]);
    expect(run(seq({ enabled: false })).events.flat()).to.deep.equal(["alert"]);
  });

  it("recovery after an alert reports 'recovered' and resets; a blip under 30 s is silent", () => {
    const a = run([
      obs(0, 9),
      obs(ALERT_AFTER_S, 40),
      obs(ALERT_AFTER_S + 5, 1),
    ]);
    expect(a.events).to.deep.equal([[], ["alert"], ["recovered"]]);
    expect(a.state).to.deep.equal(freshState());
    expect(run([obs(0, 9), obs(10, 1)]).events.flat()).to.deep.equal([]);
  });
});
