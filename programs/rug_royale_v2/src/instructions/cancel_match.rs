use anchor_lang::prelude::*;

use super::credit::credit_or_redirect;
use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::MatchCancelled;
use crate::state::{Pot, PotStatus, Protocol};

/// v2 PRD §6.2. Permissionless once the join deadline passes with nobody joined.
/// `Match` was never delegated; `close_match` reclaims it later.
#[derive(Accounts)]
pub struct CancelMatch<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [POT_SEED, pot.match_account.as_ref()], bump = pot.bump)]
    pub pot: Box<Account<'info, Pot>>,
    /// CHECK: pinned to pot.creator; only receives lamports.
    #[account(mut, address = pot.creator)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: pinned to pot.sponsor; required only when a sponsor is set. Never pass an unset
    /// (default) pubkey as a writable account.
    #[account(mut, address = pot.sponsor)]
    pub sponsor: Option<UncheckedAccount<'info>>,
    /// CHECK: pinned to protocol.treasury; receives redirected sub-rent credits (M1).
    #[account(mut, address = protocol.treasury)]
    pub treasury: UncheckedAccount<'info>,
}

pub fn handle_cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pot = &ctx.accounts.pot;

    // v2 PRD §6.2 check order.
    require!(
        pot.status == PotStatus::Open,
        RugRoyaleV2Error::MatchNotOpen
    );
    require!(
        now >= pot.join_deadline,
        RugRoyaleV2Error::DeadlineNotReached
    );
    if pot.sponsor != Pubkey::default() && ctx.accounts.sponsor.is_none() {
        return err!(anchor_lang::error::ErrorCode::AccountNotEnoughKeys);
    }

    let refunded_entry = pot
        .entry_lamports
        .checked_add(pot.fee_share_lamports)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    let refunded_sponsored = pot.sponsored_lamports;
    let match_account = pot.match_account;

    let rent = Rent::get()?;
    let pot_info = ctx.accounts.pot.to_account_info();
    let treasury = ctx.accounts.treasury.to_account_info();
    credit_or_redirect(
        &pot_info,
        &ctx.accounts.creator.to_account_info(),
        &treasury,
        refunded_entry,
        &rent,
    )?;
    if let Some(sponsor) = &ctx.accounts.sponsor {
        credit_or_redirect(
            &pot_info,
            &sponsor.to_account_info(),
            &treasury,
            refunded_sponsored,
            &rent,
        )?;
    }

    ctx.accounts.pot.status = PotStatus::Cancelled;
    emit!(MatchCancelled {
        match_account,
        refunded_entry,
        refunded_sponsored,
    });
    Ok(())
}
