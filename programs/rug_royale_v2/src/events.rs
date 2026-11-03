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
