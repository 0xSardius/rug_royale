//! v2 PRD §6.2 `settle`: base layer, permissionless (the crank, or the winner's Settle
//! button). Pays out the Pot once the finalized Match is back from the ER. The ER only ever
//! reports the result; all SOL moves here (V1).
use anchor_lang::prelude::*;

use super::credit::credit_or_redirect;
use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::MatchSettled;
use crate::math::payout::payout;
use crate::state::{Match, MatchStatus, PlayerStats, Pot, PotStatus, Protocol};

#[derive(Accounts)]
pub struct Settle<'info> {
    /// Receives the settler tip.
    #[account(mut)]
    pub settler: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [POT_SEED, pot.match_account.as_ref()], bump = pot.bump)]
    pub pot: Box<Account<'info, Pot>>,
    /// CHECK: pinned to the pot; may still be owned by the Delegation Program, so its owner
    /// and data are checked in the handler (`MatchStillDelegated`, `MatchNotFinalized`).
    #[account(address = pot.match_account)]
    pub match_account: UncheckedAccount<'info>,
    #[account(mut, seeds = [PLAYER_SEED, pot.creator.as_ref()], bump = creator_stats.bump)]
    pub creator_stats: Box<Account<'info, PlayerStats>>,
    #[account(mut, seeds = [PLAYER_SEED, pot.opponent.as_ref()], bump = opponent_stats.bump)]
    pub opponent_stats: Box<Account<'info, PlayerStats>>,
    /// CHECK: pinned to pot.creator; only receives lamports.
    #[account(mut, address = pot.creator)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: pinned to pot.opponent; only receives lamports.
    #[account(mut, address = pot.opponent)]
    pub opponent: UncheckedAccount<'info>,
    /// CHECK: pinned to protocol.treasury (rent-exempt by init/update_protocol).
    #[account(mut, address = protocol.treasury)]
    pub treasury: UncheckedAccount<'info>,
}

pub fn handle_settle(ctx: Context<Settle>) -> Result<()> {
    // v2 PRD §6.2 check order.
    require!(
        ctx.accounts.pot.status == PotStatus::Active,
        RugRoyaleV2Error::PotNotActive
    );
    let match_info = ctx.accounts.match_account.to_account_info();
    require_keys_eq!(
        *match_info.owner,
        crate::ID,
        RugRoyaleV2Error::MatchStillDelegated
    );
    let m = {
        let data = match_info.try_borrow_data()?;
        Match::try_deserialize(&mut &data[..])?
    };
    require!(
        m.status == MatchStatus::Finalized,
        RugRoyaleV2Error::MatchNotFinalized
    );

    let pot = &ctx.accounts.pot;
    let p = payout(
        pot.entry_lamports,
        pot.sponsored_lamports,
        pot.match_fee_lamports,
        pot.fee_share_lamports,
        pot.settler_tip_lamports,
        pot.rake_bps,
        m.result,
    )?;

    // Program-owned Pot (G1): debit lamports directly. Recipients are pinned (I8); credits that
    // would leave an emptied wallet below rent go to the treasury instead (M1). The settler may
    // also be a player; credits then add up.
    let rent = Rent::get()?;
    let pot_info = ctx.accounts.pot.to_account_info();
    let treasury = ctx.accounts.treasury.to_account_info();
    for (to, amount) in [
        (ctx.accounts.creator.to_account_info(), p.to_creator),
        (ctx.accounts.opponent.to_account_info(), p.to_opponent),
        (ctx.accounts.settler.to_account_info(), p.to_settler),
    ] {
        credit_or_redirect(&pot_info, &to, &treasury, amount, &rent)?;
    }
    if p.to_treasury > 0 {
        pot_info.sub_lamports(p.to_treasury)?;
        treasury.add_lamports(p.to_treasury)?;
    }

    let bump = |v: u32| v.checked_add(1).ok_or(RugRoyaleV2Error::MathOverflow);
    match m.result {
        RESULT_CREATOR => ctx.accounts.creator_stats.wins = bump(ctx.accounts.creator_stats.wins)?,
        RESULT_OPPONENT => {
            ctx.accounts.opponent_stats.wins = bump(ctx.accounts.opponent_stats.wins)?
        }
        _ => {
            ctx.accounts.creator_stats.ties = bump(ctx.accounts.creator_stats.ties)?;
            ctx.accounts.opponent_stats.ties = bump(ctx.accounts.opponent_stats.ties)?;
        }
    }

    ctx.accounts.pot.status = PotStatus::Settled;
    emit!(MatchSettled {
        match_account: ctx.accounts.pot.match_account,
        result: m.result,
        final_values: m.final_values,
        prize: p.prize,
        rake: p.rake,
        match_fee: p.fee,
        tip: p.tip,
    });
    Ok(())
}
