use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::constants::*;
use crate::errors::RugRoyaleError;
use crate::events::PrizeSponsored;
use crate::state::{Duel, DuelStatus, Escrow};

/// PRD §6.3 — owner: Yamin (picked up from Sidharth).
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

pub fn handle_sponsor_prize(ctx: Context<SponsorPrize>, amount: u64) -> Result<()> {
    let duel = &ctx.accounts.duel;
    let sponsor = ctx.accounts.sponsor.key();

    // PRD §6.3 check order. One sponsor per duel; they may top up.
    require!(duel.status == DuelStatus::Open, RugRoyaleError::DuelNotOpen);
    require!(amount > 0, RugRoyaleError::ZeroAmount);
    require!(
        duel.sponsor == Pubkey::default() || duel.sponsor == sponsor,
        RugRoyaleError::SponsorMismatch
    );
    let total = duel
        .sponsored_lamports
        .checked_add(amount)
        .ok_or(RugRoyaleError::MathOverflow)?;

    // Deposits into the program-owned escrow use a normal system transfer (G1).
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.sponsor.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
            },
        ),
        amount,
    )?;

    let duel_key = ctx.accounts.duel.key();
    let duel = &mut ctx.accounts.duel;
    duel.sponsored_lamports = total;
    duel.sponsor = sponsor;

    emit!(PrizeSponsored {
        duel: duel_key,
        sponsor,
        amount,
        total,
    });
    Ok(())
}
