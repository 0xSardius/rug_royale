use anchor_lang::prelude::*;

use crate::constants::{MAX_ASSETS, NUM_SEATS};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MatchStatus {
    Open,
    Active,
    Finalized,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, InitSpace, Debug,
)]
pub struct Seat {
    pub player: Pubkey,
    /// V5: may sign `trade` for this seat only, while the window is open. Default = wallet only.
    pub session_key: Pubkey,
    /// Micro-USD.
    pub cash: u64,
    /// Per arena asset, 1e-6 token units.
    pub qty: [u64; MAX_ASSETS],
    pub trades: u32,
}

/// Seeds `["match", creator, nonce.to_le_bytes()]`. Base while Open; delegated to the ER
/// from `delegate_match` until `finalize_match` commits and undelegates it (V1).
///
/// FIXED LAYOUT (G9): `status` @ 8. Do not reorder or insert fields.
#[account]
#[derive(InitSpace)]
pub struct Match {
    pub status: MatchStatus,
    /// RESULT_PENDING | RESULT_CREATOR | RESULT_OPPONENT | RESULT_TIE
    pub result: u8,
    pub bump: u8,
    /// Copied from the arena at create.
    pub asset_count: u8,
    pub arena_id: u16,
    pub nonce: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    /// Snapshotted from the arena at create so admin changes never touch a live match (I9).
    pub trade_fee_bps: u16,
    pub max_price_age_s: u32,
    pub pot: Pubkey,
    /// [creator, opponent]
    pub seats: [Seat; NUM_SEATS],
    /// Micro-USD.
    pub final_values: [u64; NUM_SEATS],
    /// Raw feed price used per asset at finalize (audit trail); 0 when unused.
    pub mark_prices: [u64; MAX_ASSETS],
    /// Oldest `publish_time` among the marks used.
    pub mark_publish_time: i64,
}

pub const MATCH_STATUS_OFFSET: usize = 8;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_offset_and_size() {
        let m = Match {
            status: MatchStatus::Finalized,
            result: 0,
            bump: 0,
            asset_count: 0,
            arena_id: 0,
            nonce: 0,
            start_ts: 0,
            end_ts: 0,
            trade_fee_bps: 0,
            max_price_age_s: 0,
            pot: Pubkey::default(),
            seats: [Seat::default(); NUM_SEATS],
            final_values: [0; NUM_SEATS],
            mark_prices: [0; MAX_ASSETS],
            mark_publish_time: 0,
        };
        let mut data = Vec::new();
        m.try_serialize(&mut data).unwrap();
        assert_eq!(data[MATCH_STATUS_OFFSET], MatchStatus::Finalized as u8);
        assert_eq!(data.len(), 8 + Match::INIT_SPACE);
    }
}
