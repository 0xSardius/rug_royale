// Byte offsets into v2 accounts for getProgramAccounts filters (v2 PRD §5, G9).
// Must match programs/rug_royale_v2/src/state/{pot,match_state}.rs (their layout tests
// assert the same offsets). Lobby queries read Pot, which is never delegated, so they work
// on the base layer whether or not the match is in an ER.
export const POT_SIZE = 8 + 258;
export const POT_STATUS_OFFSET = 8;
export const POT_ARENA_ID_OFFSET = 10;
export const POT_CREATOR_OFFSET = 106;
export const POT_OPPONENT_OFFSET = 138;

export const MATCH_SIZE = 8 + 484;
export const MATCH_STATUS_OFFSET = 8;

export enum PotStatus {
  Open = 0,
  Active = 1,
  Settled = 2,
  Cancelled = 3,
  Refunded = 4,
}

export enum MatchStatus {
  Open = 0,
  Active = 1,
  Finalized = 2,
}

export enum MatchResult {
  Pending = 0,
  Creator = 1,
  Opponent = 2,
  Tie = 3,
}
