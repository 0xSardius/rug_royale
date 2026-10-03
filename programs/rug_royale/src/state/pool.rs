use anchor_lang::prelude::*;

/// Seeds `["pool", duel]`. One constant-product pool per duel; the only price source (REQ10).
#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub duel: Pubkey,
    pub coin: Pubkey,
    pub quote_reserve: u64,
    pub token_reserve: u64,
    pub bump: u8,
}
