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

/// Emitted in the ER; the client reads it from its own transaction result.
#[event]
pub struct Traded {
    pub match_account: Pubkey,
    pub seat: u8,
    pub asset_index: u8,
    /// 0 = buy, 1 = sell.
    pub side: u8,
    pub amount_in: u64,
    pub amount_out: u64,
    pub price: u64,
    pub publish_time: i64,
}

/// Emitted in the ER when the result is final (before the commit lands on base).
#[event]
pub struct MatchFinalized {
    pub match_account: Pubkey,
    pub result: u8,
    pub final_values: [u64; 2],
    pub mark_publish_time: i64,
}

#[event]
pub struct MatchSettled {
    pub match_account: Pubkey,
    pub result: u8,
    pub final_values: [u64; 2],
    pub prize: u64,
    pub rake: u64,
    /// Match fee reimbursed to the joiner (D1, Q1).
    pub match_fee: u64,
    pub tip: u64,
}

#[event]
pub struct MatchRefunded {
    pub match_account: Pubkey,
    /// Entry + fee share returned to each player.
    pub refunded_each: u64,
    pub refunded_sponsored: u64,
}

#[event]
pub struct MatchClosed {
    pub match_account: Pubkey,
    /// False when Match is still delegated (a stale-refunded match): only the Pot closed.
    pub match_closed: bool,
}
