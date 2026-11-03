use anchor_lang::prelude::*;

/// v2 PRD §8. Notifications only; clients read state from accounts.
#[event]
pub struct ProtocolUpdated {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub max_entry_lamports: u64,
    pub match_fee_lamports: u64,
    pub settler_tip_lamports: u64,
    pub max_rake_bps: u16,
    pub paused: bool,
}

#[event]
pub struct ArenaUpdated {
    pub arena_id: u16,
}

#[event]
pub struct MatchCreated {
    pub match_account: Pubkey,
    pub pot: Pubkey,
    pub creator: Pubkey,
    pub arena_id: u16,
    pub window_secs: u32,
    pub entry_lamports: u64,
    pub allowed_opponent: Pubkey,
    pub join_deadline: i64,
    pub validator: Pubkey,
}

#[event]
pub struct MatchSponsored {
    pub match_account: Pubkey,
    pub sponsor: Pubkey,
    pub amount: u64,
    pub total: u64,
}

#[event]
pub struct MatchJoined {
    pub match_account: Pubkey,
    pub opponent: Pubkey,
    pub start_ts: i64,
    pub end_ts: i64,
}

#[event]
pub struct MatchCancelled {
    pub match_account: Pubkey,
    /// Entry + fee share returned to the creator.
    pub refunded_entry: u64,
    pub refunded_sponsored: u64,
}
