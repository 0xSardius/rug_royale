use anchor_lang::prelude::*;

use crate::constants::{MAX_ASSETS, NUM_WINDOWS};

#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, InitSpace, Debug,
)]
pub struct ArenaAsset {
    /// Oracle feed PDA `["price_feed", "pyth-lazer", <lazer_id>]` (checked off-chain at setup).
    pub feed: Pubkey,
    pub lazer_id: u32,
    /// |exponent| from Pyth's list (e.g. 8 for SOL, 10 for BONK). The feed account's own
    /// exponent field is never read (spike 01: it says 8 for every feed).
    pub exponent: u8,
    /// Disabled: no new buys; sells and valuation still work.
    pub enabled: bool,
}

/// Seeds `["arena", arena_id.to_le_bytes()]`. Base only; cloned read-only into the ER.
#[account]
#[derive(InitSpace)]
pub struct Arena {
    pub arena_id: u16,
    /// 0 = LIVE_PRICE_DUEL.
    pub mode: u8,
    /// Blocks create/join only.
    pub paused: bool,
    /// 1..=MAX_ASSETS; entries at index >= asset_count are zeroed.
    pub asset_count: u8,
    pub assets: [ArenaAsset; MAX_ASSETS],
    /// Seconds, a non-zero ascending prefix; 0 = unused slot.
    pub windows: [u32; NUM_WINDOWS],
    /// Virtual bankroll per seat, micro-USD.
    pub bankroll: u64,
    pub min_entry_lamports: u64,
    pub max_entry_lamports: u64,
    pub trade_fee_bps: u16,
    pub rake_bps: u16,
    pub max_price_age_s: u32,
    /// Q2: delay from join to the start of trading.
    pub start_delay_secs: u16,
    /// D4: sponsored freerolls per wallet per day.
    pub freeroll_daily_cap: u8,
    pub bump: u8,
}

pub const MODE_LIVE_PRICE_DUEL: u8 = 0;
