use anchor_lang::prelude::*;

use crate::constants::{NUM_ALLOWED_MINTS, NUM_TIERS, NUM_WINDOWS};

/// Seeds `["config"]`. Written once by `init_config`; there is no update path (G12).
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub quote_mint: Pubkey,
    /// Demo mints standing in for the StonkFun top 10.
    pub allowed_mints: [Pubkey; NUM_ALLOWED_MINTS],
    /// Bankroll per tier, raw quote units.
    pub tiers: [u64; NUM_TIERS],
    /// Allowed `window_secs` values, ascending.
    pub windows: [u32; NUM_WINDOWS],
    /// Pool seed = bankroll * ratio, in both quote and coin (G5).
    pub pool_seed_ratio: u64,
    pub settler_tip_lamports: u64,
    /// Devnet safety cap on `entry_lamports` (G6).
    pub max_entry_lamports: u64,
    pub rake_bps: u16,
    pub swap_fee_bps: u16,
    pub bump: u8,
    pub mint_authority_bump: u8,
}
