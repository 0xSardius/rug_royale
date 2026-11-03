use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum PotStatus {
    Open,
    Active,
    Settled,
    Cancelled,
    Refunded,
}

/// Seeds `["pot", match]`. Holds the real SOL; base only, never delegated (V1, G1).
///
/// FIXED LAYOUT (G9). No `Option` fields; `Pubkey::default()` means unset. Lobby `memcmp`
/// filters read the offsets below (mirrored in packages/sdk/src/v2/layout.ts). Do not
/// reorder or insert fields.
#[account]
#[derive(InitSpace)]
pub struct Pot {
    pub status: PotStatus,
    pub bump: u8,
    pub arena_id: u16,
    pub window_secs: u32,
    pub entry_lamports: u64,
    pub sponsored_lamports: u64,
    /// F, snapshotted from Protocol at create.
    pub match_fee_lamports: u64,
    /// ceil(F/2) if entry == 0, else 0 (V7, Q1).
    pub fee_share_lamports: u64,
    /// Snapshotted at create.
    pub settler_tip_lamports: u64,
    /// Snapshotted at create.
    pub rake_bps: u16,
    pub join_deadline: i64,
    /// Set at join.
    pub end_ts: i64,
    pub match_account: Pubkey,
    pub creator: Pubkey,
    /// Default until joined.
    pub opponent: Pubkey,
    /// Default = anyone.
    pub allowed_opponent: Pubkey,
    /// Default = none.
    pub sponsor: Pubkey,
    /// ER validator identity (region) pinned at delegation (V4).
    pub validator: Pubkey,
}

pub const POT_STATUS_OFFSET: usize = 8;
pub const POT_ARENA_ID_OFFSET: usize = 10;
pub const POT_CREATOR_OFFSET: usize = 106;
pub const POT_OPPONENT_OFFSET: usize = 138;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lobby_offsets_match_layout() {
        let creator = Pubkey::new_unique();
        let opponent = Pubkey::new_unique();
        let pot = Pot {
            status: PotStatus::Refunded,
            bump: 0,
            arena_id: 0xBEEF,
            window_secs: 0,
            entry_lamports: 0,
            sponsored_lamports: 0,
            match_fee_lamports: 0,
            fee_share_lamports: 0,
            settler_tip_lamports: 0,
            rake_bps: 0,
            join_deadline: 0,
            end_ts: 0,
            match_account: Pubkey::default(),
            creator,
            opponent,
            allowed_opponent: Pubkey::default(),
            sponsor: Pubkey::default(),
            validator: Pubkey::default(),
        };
        let mut data = Vec::new();
        pot.try_serialize(&mut data).unwrap();
        assert_eq!(data[POT_STATUS_OFFSET], PotStatus::Refunded as u8);
        assert_eq!(
            &data[POT_ARENA_ID_OFFSET..POT_ARENA_ID_OFFSET + 2],
            &0xBEEFu16.to_le_bytes()
        );
        assert_eq!(
            &data[POT_CREATOR_OFFSET..POT_CREATOR_OFFSET + 32],
            creator.as_ref()
        );
        assert_eq!(
            &data[POT_OPPONENT_OFFSET..POT_OPPONENT_OFFSET + 32],
            opponent.as_ref()
        );
        assert_eq!(data.len(), 8 + Pot::INIT_SPACE);
    }
}
