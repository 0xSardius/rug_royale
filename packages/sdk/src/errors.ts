// Program error code -> plain sentence for the UI (PRD §11). Codes and names come from the
// raw IDL JSON, so they track RugRoyaleError's order and match on-chain log names
// ("WindowEnded"). OVERRIDES make the common ones friendlier than the #[msg] text.
import { IDL_JSON } from "./idl";

const OVERRIDES: Record<string, string> = {
  WindowEnded: "The trading window has ended.",
  WindowNotStarted: "Trading hasn't started yet. Wait for the countdown.",
  SlippageExceeded: "Price moved more than your slippage. Try again.",
  InsufficientBankroll: "You don't have enough balance for that trade.",
  JoinDeadlinePassed: "This duel's join deadline has passed.",
  CannotJoinOwnDuel: "You can't join your own duel.",
  OpponentNotAllowed: "This duel is reserved for a specific opponent.",
  DuelNotOpen: "This duel is no longer open.",
  DuelNotActive: "This duel isn't active.",
  WindowNotEnded: "The duel hasn't ended yet.",
};

const BY_CODE = new Map<number, { name: string; msg?: string }>(
  IDL_JSON.errors.map((e) => [e.code, e])
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

/** Finds the first program error in transaction logs ("Error Number: 6019"). */
export function programErrorFromLogs(logs: string[]): ProgramErrorInfo | null {
  for (const l of logs) {
    const m = l.match(/Error Number: (\d+)/);
    if (m) return programError(Number(m[1]));
  }
  return null;
}
