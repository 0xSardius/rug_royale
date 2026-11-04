//! v2 PRD §6.2 `refund_stale`: the safety net when a match can never finalize (ER outage,
//! crank down past the mark window, a feed stalled at end_ts). Base layer, permissionless,
//! `STALE_AFTER_SECS` after `end_ts`. It never reads `Match`, which may still be delegated.
//! Each depositor gets back exactly what they put in; no rake, fee reimbursement or tip (the
//! joiner absorbs the delegation fee in this rare case).
use anchor_lang::prelude::*;

use super::credit::credit_or_redirect;
use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::MatchRefunded;
use crate::state::{Pot, PotStatus, Protocol};

#[derive(Accounts)]
pub struct RefundStale<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [POT_SEED, pot.match_account.as_ref()], bump = pot.bump)]
    pub pot: Box<Account<'info, Pot>>,
    /// CHECK: pinned to pot.creator; only receives lamports.
    #[account(mut, address = pot.creator)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: pinned to pot.opponent; only receives lamports.
    #[account(mut, address = pot.opponent)]
    pub opponent: UncheckedAccount<'info>,
    /// CHECK: pinned to pot.sponsor; required only when a sponsor is set.
    #[account(mut, address = pot.sponsor)]
    pub sponsor: Option<UncheckedAccount<'info>>,
    /// CHECK: pinned to protocol.treasury; receives redirected sub-rent credits (M1).
    #[account(mut, address = protocol.treasury)]
    pub treasury: UncheckedAccount<'info>,
}

pub fn handle_refund_stale(ctx: Context<RefundStale>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pot = &ctx.accounts.pot;

    // v2 PRD §6.2 check order.
    require!(
        pot.status == PotStatus::Active,
        RugRoyaleV2Error::PotNotActive
    );
    let opens_at = pot
        .end_ts
        .checked_add(STALE_AFTER_SECS)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    require!(now >= opens_at, RugRoyaleV2Error::NotStaleYet);
    if pot.sponsor != Pubkey::default() && ctx.accounts.sponsor.is_none() {
        return err!(anchor_lang::error::ErrorCode::AccountNotEnoughKeys);
    }

    let each = pot
        .entry_lamports
        .checked_add(pot.fee_share_lamports)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    let sponsored = pot.sponsored_lamports;
    let match_account = pot.match_account;

    let rent = Rent::get()?;
    let pot_info = ctx.accounts.pot.to_account_info();
    let treasury = ctx.accounts.treasury.to_account_info();
    for to in [
        ctx.accounts.creator.to_account_info(),
        ctx.accounts.opponent.to_account_info(),
    ] {
        credit_or_redirect(&pot_info, &to, &treasury, each, &rent)?;
    }
    if let Some(sponsor) = &ctx.accounts.sponsor {
        credit_or_redirect(
            &pot_info,
            &sponsor.to_account_info(),
            &treasury,
            sponsored,
            &rent,
        )?;
    }

    ctx.accounts.pot.status = PotStatus::Refunded;
    emit!(MatchRefunded {
        match_account,
        refunded_each: each,
        refunded_sponsored: sponsored,
    });
    Ok(())
}
