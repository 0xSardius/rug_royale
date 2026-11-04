// v2 program error code -> plain sentence for the UI. Codes and names come from the v2 IDL,
// so they track RugRoyaleV2Error's order and match on-chain log names. OVERRIDES make the
// ones players actually hit friendlier than the #[msg] text.
import { IDL_JSON } from "./idl";

const OVERRIDES: Record<string, string> = {
  // Lobby / joining
  Paused: "Rug Royale is paused right now. Try again soon.",
  MatchNotOpen: "This duel is no longer open.",
  JoinDeadlinePassed: "This duel's join deadline has passed.",
  CannotJoinOwnMatch: "You can't join your own duel.",
  OpponentNotAllowed: "This duel is reserved for a specific opponent.",
  FreerollCapReached:
    "You've hit today's free-duel limit. Come back tomorrow or play a paid duel.",
  EntryOutOfRange: "That entry is outside this arena's limits.",
  SponsorTooSmall: "Sponsorships start at 0.01 SOL.",
  // Trading (ER)
  WindowNotStarted: "Trading hasn't started yet. Wait for the countdown.",
  WindowEnded: "The trading window has ended.",
  PriceStale: "The price feed is lagging. Try again in a moment.",
  LimitPriceExceeded: "The price moved past your slippage limit. Try again.",
  InsufficientCash: "You don't have enough cash for that trade.",
  InsufficientQty: "You don't hold that much of this coin.",
  ZeroOutput: "That trade is too small.",
  AssetDisabled:
    "This coin is temporarily disabled for new buys. You can still sell it.",
  NotAParticipant:
    "Your trading session isn't valid for this duel. Reload the duel room.",
  // Settlement
  WindowNotEnded: "The duel hasn't ended yet.",
  MatchStillDelegated:
    "The result is still settling. This usually takes a few seconds.",
  MatchNotFinalized: "The result isn't final yet.",
  NotStaleYet: "Refunds open 24 hours after a duel that never finished.",
};

const BY_CODE = new Map<number, { name: string; msg?: string }>(
  IDL_JSON.errors.map((e) => [e.code, e])
);
const BY_NAME = new Map<string, number>(
  IDL_JSON.errors.map((e) => [e.name, e.code])
);

export interface ProgramErrorInfo {
  code: number;
  name: string;
  message: string;
}

export function programError(code: number): ProgramErrorInfo | null {
  const e = BY_CODE.get(code);
  if (!e) return null;
  return { code, name: e.name, message: OVERRIDES[e.name] ?? e.msg ?? e.name };
}

/** Error code for a RugRoyaleV2Error name, e.g. "PriceStale" -> 6032. */
export const programErrorCode = (name: string) => BY_NAME.get(name) ?? null;

/** Finds the first v2 program error in transaction logs ("Error Number: 6032"). */
export function programErrorFromLogs(logs: string[]): ProgramErrorInfo | null {
  for (const l of logs) {
    const m = l.match(/Error Number: (\d+)/);
    if (m) {
      const info = programError(Number(m[1]));
      if (info) return info;
    }
  }
  return null;
}
