use anchor_lang::prelude::*;

/// Seeds `["player", wallet]`. Freeroll cap (V9) plus lifetime stats.
#[account]
#[derive(InitSpace)]
pub struct PlayerStats {
    pub wallet: Pubkey,
    /// `unix_ts / 86_400` of the last freeroll counted.
    pub day: u32,
    pub freerolls_today: u8,
    pub matches: u32,
    pub wins: u32,
    pub ties: u32,
    pub bump: u8,
}
