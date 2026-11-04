//! v2 PRD §6.2 `close_match`: base layer, permissionless, once the Pot is Settled, Cancelled
//! or Refunded. Returns the Pot's and Match's rent (plus any dust sent to the Pot) to the
//! creator, who paid it. A Match still owned by the Delegation Program (a stale-refunded
//! match whose ER never committed) can't be touched; only the Pot closes then.
use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::MatchClosed;
use crate::state::{Pot, PotStatus};

#[derive(Accounts)]
pub struct CloseMatch<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [POT_SEED, pot.match_account.as_ref()],
        bump = pot.bump,
        close = creator,
    )]
    pub pot: Box<Account<'info, Pot>>,
    /// CHECK: pinned to the pot; closed only if owned by this program.
    #[account(mut, address = pot.match_account)]
    pub match_account: UncheckedAccount<'info>,
    /// CHECK: pinned to pot.creator; receives the rent.
    #[account(mut, address = pot.creator)]
    pub creator: UncheckedAccount<'info>,
}

pub fn handle_close_match(ctx: Context<CloseMatch>) -> Result<()> {
    require!(
        matches!(
            ctx.accounts.pot.status,
            PotStatus::Settled | PotStatus::Cancelled | PotStatus::Refunded
        ),
        RugRoyaleV2Error::MatchStillLive
    );

    let m = ctx.accounts.match_account.to_account_info();
    let match_closed = m.owner == &crate::ID;
    if match_closed {
        // Same as Anchor's `close`: move every lamport, then hand the empty account back to
        // the System Program.
        let lamports = m.lamports();
        m.sub_lamports(lamports)?;
        ctx.accounts.creator.add_lamports(lamports)?;
        m.assign(&system_program::ID);
        m.resize(0)?;
    }
    // The Pot itself closes to the creator via `close = creator`.

    emit!(MatchClosed {
        match_account: ctx.accounts.pot.match_account,
        match_closed,
    });
    Ok(())
}
