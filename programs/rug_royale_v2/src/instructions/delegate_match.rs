//! v2 PRD §6.2 `delegate_match`: hands `Match` to MagicBlock's Delegation Program so the
//! pinned ER validator can run `trade` / `finalize_match` against it (V1, V4).
//!
//! What happens on-chain (one CPI, built by `#[delegate]` + `delegate_match_account`):
//! 1. `Match` data is copied into `buffer_match_account` (a PDA of this program).
//! 2. `Match` is zeroed and reassigned to the Delegation Program, which writes
//!    `delegation_record` (owner program, validator, commit frequency) and
//!    `delegation_metadata` (seeds, rent payer; the 0.003 SOL session fee is taken from it
//!    at undelegation), then copies the data back from the buffer.
//! 3. The ER validator in `pot.validator` clones `Match` and executes this program on it.
//!    The base-layer copy is frozen until `finalize_match` commits and undelegates.
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::state::{Match, MatchStatus, Pot, PotStatus};

/// Never auto-commit: `finalize_match` commits exactly once, so the duel pays one session
/// fee and no per-commit fees (spike 02). This is also the SDK default.
const NO_AUTO_COMMIT: u32 = u32::MAX;

/// Permissionless; normally the joiner calls it in the same transaction as `join_match`.
/// The payer funds the delegation record/metadata deposits and gets them back (minus the
/// session fee) at undelegation; the match fee (D1/Q1) reimburses that fee at settle.
#[delegate]
#[derive(Accounts)]
pub struct DelegateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [POT_SEED, match_account.key().as_ref()], bump = pot.bump)]
    pub pot: Box<Account<'info, Pot>>,
    /// CHECK: the match PDA being delegated; pinned to the pot (whose seeds bind it), its
    /// owner and status are checked in the handler. `del` makes `#[delegate]` add the
    /// buffer / record / metadata accounts and `delegate_match_account`.
    #[account(mut, del, address = pot.match_account)]
    pub match_account: UncheckedAccount<'info>,
}

pub fn handle_delegate_match(ctx: Context<DelegateMatch>) -> Result<()> {
    // Once delegated, the Delegation Program owns the account; a second delegation fails here.
    require_keys_eq!(
        *ctx.accounts.match_account.owner,
        crate::ID,
        anchor_lang::error::ErrorCode::AccountOwnedByWrongProgram
    );
    let m = {
        let data = ctx.accounts.match_account.try_borrow_data()?;
        Match::try_deserialize(&mut &data[..])?
    };
    require!(
        ctx.accounts.pot.status == PotStatus::Active && m.status == MatchStatus::Active,
        RugRoyaleV2Error::MatchNotActive
    );

    let creator = ctx.accounts.pot.creator;
    let nonce = m.nonce.to_le_bytes();
    ctx.accounts.delegate_match_account(
        &ctx.accounts.payer,
        &[MATCH_SEED, creator.as_ref(), &nonce],
        DelegateConfig {
            commit_frequency_ms: NO_AUTO_COMMIT,
            validator: Some(ctx.accounts.pot.validator),
        },
    )?;
    Ok(())
}
