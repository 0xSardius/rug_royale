// Byte offsets into the Duel account for getProgramAccounts memcmp filters (PRD §5, G9).
// Must match programs/rug_royale/src/state/duel.rs (asserted by its lobby_offsets_match_layout test).
export const DUEL_STATUS_OFFSET = 8;
export const DUEL_CREATOR_OFFSET = 89;
export const DUEL_OPPONENT_OFFSET = 121;

export enum DuelStatus {
  Open = 0,
  Active = 1,
  Settled = 2,
  Cancelled = 3,
}

export enum DuelResult {
  Pending = 0,
  Creator = 1,
  Opponent = 2,
  Tie = 3,
}
