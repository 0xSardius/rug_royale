use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RugRoyaleError;
use crate::events::DuelCancelled;
use crate::state::{Duel, DuelStatus, Escrow};

/// PRD §6.7. Permissionless: the refunds go to the recorded creator and sponsor, never
/// to the caller.
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

pub fn handle_cancel_duel(ctx: Context<CancelDuel>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let duel = &ctx.accounts.duel;

    // PRD §6.7 check order. `now >= join_deadline` is the exact complement of join_duel's
    // `now < join_deadline`, so exactly one of them is valid at any moment (I8).
    require!(duel.status == DuelStatus::Open, RugRoyaleError::DuelNotOpen);
    require!(now >= duel.join_deadline, RugRoyaleError::DeadlineNotReached);

    let entry = duel.entry_lamports;
    let sponsored = duel.sponsored_lamports;

    // Escrow is program-owned (G1): debit it directly. Recipients are pinned by `address =`.
    let escrow = ctx.accounts.escrow.to_account_info();
    if entry > 0 {
        escrow.sub_lamports(entry)?;
        ctx.accounts.creator.add_lamports(entry)?;
    }
    if sponsored > 0 {
        let sponsor = ctx
            .accounts
            .sponsor
            .as_ref()
            .ok_or(ErrorCode::AccountNotEnoughKeys)?;
        escrow.sub_lamports(sponsored)?;
        sponsor.add_lamports(sponsored)?;
    }

    let duel_key = ctx.accounts.duel.key();
    ctx.accounts.duel.status = DuelStatus::Cancelled;
    emit!(DuelCancelled {
        duel: duel_key,
        refunded_entry: entry,
        refunded_sponsored: sponsored,
    });
    Ok(())
}
