use anchor_lang::prelude::*;

/// Seeds `["escrow", duel]`. Program-owned (G1): lamports above rent = entries + sponsored.
/// Pay out by debiting lamports directly; never `system_program::transfer` FROM this account.
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub bump: u8,
}
