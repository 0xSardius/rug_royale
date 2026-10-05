use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::{Duel, Escrow};

/// PRD §6.7 — owner: Sidharth. Permissionless.
#[derive(Accounts)]
pub struct CancelDuel<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()],
        bump = duel.bump,
    )]
    pub duel: Box<Account<'info, Duel>>,
    #[account(mut, seeds = [ESCROW_SEED, duel.key().as_ref()], bump = escrow.bump)]
    pub escrow: Box<Account<'info, Escrow>>,
    /// CHECK: pinned to duel.creator; only receives lamports.
    #[account(mut, address = duel.creator)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: pinned to duel.sponsor; pass only when sponsored_lamports > 0.
    #[account(mut, address = duel.sponsor)]
    pub sponsor: Option<UncheckedAccount<'info>>,
}

pub fn handle_cancel_duel(_ctx: Context<CancelDuel>) -> Result<()> {
    // TODO(Sidharth): PRD §6.7. Require `sponsor` when sponsored_lamports > 0.
    Ok(())
}
