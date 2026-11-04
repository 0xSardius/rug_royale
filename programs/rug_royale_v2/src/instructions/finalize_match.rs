//! v2 PRD §6.3 `finalize_match`: runs in the ER at/after `end_ts`. Marks every held asset to
//! MagicBlock's live oracle price, writes the result, then asks the ER (via the Magic
//! program) to commit `Match` to the base layer and undelegate it. The Delegation Program
//! then calls `process_undelegation` (injected by `#[ephemeral]`) to hand `Match` back.
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
// `build_and_invoke` comes from FoldableIntentBuilder; #[ephemeral] only imports it inside
// the program module, so handlers in their own files import it explicitly.
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::MatchFinalized;
use crate::math::valuation::{match_result, portfolio_value};
use crate::oracle::read_price;
use crate::state::{Arena, Match, MatchStatus};

/// Permissionless (the crank calls it within ~1 s of `end_ts`; a player can too).
/// `#[commit]` adds `magic_program` and `magic_context`.
/// remaining_accounts: the price feed of every arena asset `0..asset_count`, in index order.
#[commit]
#[derive(Accounts)]
pub struct FinalizeMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [MATCH_SEED, match_account.seats[0].player.as_ref(), &match_account.nonce.to_le_bytes()],
        bump = match_account.bump,
    )]
    pub match_account: Box<Account<'info, Match>>,
    #[account(seeds = [ARENA_SEED, &match_account.arena_id.to_le_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
}

pub fn handle_finalize_match<'info>(ctx: Context<'info, FinalizeMatch<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let m = &ctx.accounts.match_account;
    let arena = &ctx.accounts.arena;
    let n = m.asset_count as usize;

    // v2 PRD §6.3 check order.
    require!(
        m.status == MatchStatus::Active,
        RugRoyaleV2Error::MatchNotActive
    );
    require!(now >= m.end_ts, RugRoyaleV2Error::WindowNotEnded);
    let feeds = ctx.remaining_accounts;
    require!(
        feeds.len() == n
            && feeds
                .iter()
                .zip(&arena.assets[..n])
                .all(|(f, a)| f.key() == a.feed),
        RugRoyaleV2Error::WrongPriceFeed
    );

    // V8: mark each held asset at a price published in [end_ts, end_ts + MARK_TOLERANCE_S].
    let mark_deadline = m
        .end_ts
        .checked_add(MARK_TOLERANCE_S)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    let mut marks = [0u64; MAX_ASSETS];
    let mut exponents = [0u8; MAX_ASSETS];
    let mut oldest_publish = i64::MAX;
    for a in 0..n {
        exponents[a] = arena.assets[a].exponent;
        if m.seats.iter().all(|s| s.qty[a] == 0) {
            continue; // nobody holds it: no mark needed
        }
        let p = read_price(&feeds[a])?;
        require!(
            m.end_ts <= p.publish_time && p.publish_time <= mark_deadline,
            RugRoyaleV2Error::MarkWindowMissed
        );
        marks[a] = p.price;
        oldest_publish = oldest_publish.min(p.publish_time);
    }

    let v0 = portfolio_value(
        m.seats[0].cash,
        &m.seats[0].qty[..n],
        &marks[..n],
        &exponents[..n],
    )?;
    let v1 = portfolio_value(
        m.seats[1].cash,
        &m.seats[1].qty[..n],
        &marks[..n],
        &exponents[..n],
    )?;
    let result = match_result(v0, v1);
    // All cash (nothing held): no marks were needed; record end_ts.
    let mark_publish_time = if oldest_publish == i64::MAX {
        m.end_ts
    } else {
        oldest_publish
    };

    let m = &mut ctx.accounts.match_account;
    m.final_values = [v0, v1];
    m.mark_prices = marks;
    m.mark_publish_time = mark_publish_time;
    m.result = result;
    m.status = MatchStatus::Finalized;
    let match_key = m.key();

    // Serialize the finalized state before the commit snapshot is taken.
    m.exit(&crate::ID)?;
    MagicIntentBundleBuilder::new(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[ctx.accounts.match_account.to_account_info()])
    .build_and_invoke()?;

    emit!(MatchFinalized {
        match_account: match_key,
        result,
        final_values: [v0, v1],
        mark_publish_time,
    });
    Ok(())
}
