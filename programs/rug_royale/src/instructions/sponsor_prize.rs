use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::{Duel, Escrow};

/// PRD §6.3 — owner: Sidharth.
#[derive(Accounts)]
pub struct SponsorPrize<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(
        mut,
        seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()],
        bump = duel.bump,
    )]
    pub duel: Box<Account<'info, Duel>>,
    #[account(mut, seeds = [ESCROW_SEED, duel.key().as_ref()], bump = escrow.bump)]
    pub escrow: Box<Account<'info, Escrow>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_sponsor_prize(_ctx: Context<SponsorPrize>, _amount: u64) -> Result<()> {
    // TODO(Sidharth): PRD §6.3.
    Ok(())
}
