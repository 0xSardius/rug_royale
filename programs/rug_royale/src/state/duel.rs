use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum DuelStatus {
    Open,
    Active,
    Settled,
    Cancelled,
}

/// Seeds `["duel", creator, nonce.to_le_bytes()]`. Never closed: it is the permanent record.
///
/// FIXED LAYOUT (G9). No `Option` fields; `Pubkey::default()` means unset.
/// Lobby `memcmp` filters depend on these byte offsets (see packages/sdk/src/layout.ts):
/// `status` @ 8, `creator` @ 89, `opponent` @ 121. Do not reorder or insert fields.
#[account]
#[derive(InitSpace)]
pub struct Duel {
    pub status: DuelStatus,
    /// RESULT_PENDING | RESULT_CREATOR | RESULT_OPPONENT | RESULT_TIE
    pub result: u8,
    pub tier: u8,
    pub closed: bool,
    pub bump: u8,
    pub window_secs: u32,
    pub nonce: u64,
    pub entry_lamports: u64,
    pub sponsored_lamports: u64,
    pub bankroll: u64,
    /// Creator final value, raw quote units.
    pub final_a: u64,
    /// Opponent final value, raw quote units.
    pub final_b: u64,
    pub join_deadline: i64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub creator: Pubkey,
    pub opponent: Pubkey,
    pub allowed_opponent: Pubkey,
    pub sponsor: Pubkey,
    pub coin: Pubkey,
    pub quote_mint: Pubkey,
}

pub const DUEL_STATUS_OFFSET: usize = 8;
pub const DUEL_CREATOR_OFFSET: usize = 89;
pub const DUEL_OPPONENT_OFFSET: usize = 121;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lobby_offsets_match_layout() {
        let creator = Pubkey::new_unique();
        let opponent = Pubkey::new_unique();
        let duel = Duel {
            status: DuelStatus::Settled,
            result: 0,
            tier: 0,
            closed: false,
            bump: 0,
            window_secs: 0,
            nonce: 0,
            entry_lamports: 0,
            sponsored_lamports: 0,
            bankroll: 0,
            final_a: 0,
            final_b: 0,
            join_deadline: 0,
            start_ts: 0,
            end_ts: 0,
            creator,
            opponent,
            allowed_opponent: Pubkey::default(),
            sponsor: Pubkey::default(),
            coin: Pubkey::default(),
            quote_mint: Pubkey::default(),
        };
        let mut data = Vec::new();
        duel.try_serialize(&mut data).unwrap();
        assert_eq!(data[DUEL_STATUS_OFFSET], DuelStatus::Settled as u8);
        assert_eq!(&data[DUEL_CREATOR_OFFSET..DUEL_CREATOR_OFFSET + 32], creator.as_ref());
        assert_eq!(&data[DUEL_OPPONENT_OFFSET..DUEL_OPPONENT_OFFSET + 32], opponent.as_ref());
        assert_eq!(data.len(), 8 + Duel::INIT_SPACE);
    }
}
