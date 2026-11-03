use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::MatchSponsored;
use crate::state::{Pot, PotStatus, Protocol};

/// v2 PRD §6.2. One sponsor per match; they may top up.
#[derive(Accounts)]
pub struct SponsorMatch<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [POT_SEED, pot.match_account.as_ref()], bump = pot.bump)]
    pub pot: Box<Account<'info, Pot>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_sponsor_match(ctx: Context<SponsorMatch>, amount: u64) -> Result<()> {
    let pot = &ctx.accounts.pot;
    let sponsor = ctx.accounts.sponsor.key();

    // v2 PRD §6.2 check order (Paused added 2026-11-03: pausing blocks new money in).
    require!(!ctx.accounts.protocol.paused, RugRoyaleV2Error::Paused);
    require!(
        pot.status == PotStatus::Open,
        RugRoyaleV2Error::MatchNotOpen
    );
    require!(amount > 0, RugRoyaleV2Error::ZeroAmount);
    require!(
        pot.sponsor == Pubkey::default() || pot.sponsor == sponsor,
        RugRoyaleV2Error::SponsorMismatch
    );
    // v1 audit L2: taking the single sponsor slot must cost real money.
    require!(
        pot.sponsor == sponsor || amount >= MIN_SPONSOR_LAMPORTS,
        RugRoyaleV2Error::SponsorTooSmall
    );
    let total = pot
        .sponsored_lamports
        .checked_add(amount)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.sponsor.to_account_info(),
                to: ctx.accounts.pot.to_account_info(),
            },
        ),
        amount,
    )?;

    let pot = &mut ctx.accounts.pot;
    pot.sponsored_lamports = total;
    pot.sponsor = sponsor;
    emit!(MatchSponsored {
        match_account: pot.match_account,
        sponsor,
        amount,
        total,
    });
    Ok(())
}
