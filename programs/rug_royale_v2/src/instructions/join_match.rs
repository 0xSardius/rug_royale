use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::MatchJoined;
use crate::state::{Arena, Match, MatchStatus, PlayerStats, Pot, PotStatus, Protocol, Seat};

const SECS_PER_DAY: i64 = 86_400;

/// v2 PRD §6.2. The client sends `join_match` + `delegate_match` in one transaction.
#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(mut)]
    pub opponent: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [ARENA_SEED, &pot.arena_id.to_le_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    #[account(
        mut,
        seeds = [MATCH_SEED, pot.creator.as_ref(), &match_account.nonce.to_le_bytes()],
        bump = match_account.bump,
    )]
    pub match_account: Box<Account<'info, Match>>,
    #[account(mut, seeds = [POT_SEED, match_account.key().as_ref()], bump = pot.bump)]
    pub pot: Box<Account<'info, Pot>>,
    #[account(mut, seeds = [PLAYER_SEED, pot.creator.as_ref()], bump = creator_stats.bump)]
    pub creator_stats: Box<Account<'info, PlayerStats>>,
    #[account(
        init_if_needed,
        payer = opponent,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [PLAYER_SEED, opponent.key().as_ref()],
        bump,
    )]
    pub opponent_stats: Box<Account<'info, PlayerStats>>,
    pub system_program: Program<'info, System>,
}

/// Freerolls already counted today for these stats (0 if the last one was on another day).
fn freerolls_today(stats: &PlayerStats, today: u32) -> u8 {
    if stats.day == today {
        stats.freerolls_today
    } else {
        0
    }
}

pub fn handle_join_match(ctx: Context<JoinMatch>, session_key: Pubkey) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let opponent = ctx.accounts.opponent.key();
    let pot = &ctx.accounts.pot;
    let arena = &ctx.accounts.arena;

    // v2 PRD §6.2 check order.
    require!(
        !ctx.accounts.protocol.paused && !arena.paused,
        RugRoyaleV2Error::Paused
    );
    require!(
        pot.status == PotStatus::Open,
        RugRoyaleV2Error::MatchNotOpen
    );
    require!(
        now < pot.join_deadline,
        RugRoyaleV2Error::JoinDeadlinePassed
    );
    require_keys_neq!(opponent, pot.creator, RugRoyaleV2Error::CannotJoinOwnMatch);
    require!(
        pot.allowed_opponent == Pubkey::default() || pot.allowed_opponent == opponent,
        RugRoyaleV2Error::OpponentNotAllowed
    );
    // V9 / D4: sponsored freerolls count against both players' daily cap.
    let freeroll = pot.entry_lamports == 0 && pot.sponsored_lamports > 0;
    let today = u32::try_from(now / SECS_PER_DAY).map_err(|_| RugRoyaleV2Error::MathOverflow)?;
    let (c_count, o_count) = (
        freerolls_today(&ctx.accounts.creator_stats, today),
        freerolls_today(&ctx.accounts.opponent_stats, today),
    );
    if freeroll {
        let cap = arena.freeroll_daily_cap;
        require!(
            c_count < cap && o_count < cap,
            RugRoyaleV2Error::FreerollCapReached
        );
    }

    // Entry (+ the free-duel fee share, Q1) into the pot.
    let deposit = pot
        .entry_lamports
        .checked_add(pot.fee_share_lamports)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    if deposit > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.opponent.to_account_info(),
                    to: ctx.accounts.pot.to_account_info(),
                },
            ),
            deposit,
        )?;
    }

    let start_ts = now
        .checked_add(arena.start_delay_secs as i64)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    let end_ts = start_ts
        .checked_add(ctx.accounts.pot.window_secs as i64)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;

    let pot = &mut ctx.accounts.pot;
    pot.status = PotStatus::Active;
    pot.opponent = opponent;
    pot.end_ts = end_ts;

    let m = &mut ctx.accounts.match_account;
    // Same bankroll as the creator's seat (snapshotted at create), whatever the arena says now.
    let bankroll = m.seats[0].cash;
    m.seats[1] = Seat {
        player: opponent,
        session_key,
        cash: bankroll,
        qty: [0; MAX_ASSETS],
        trades: 0,
    };
    m.status = MatchStatus::Active;
    m.start_ts = start_ts;
    m.end_ts = end_ts;

    let o = &mut ctx.accounts.opponent_stats;
    if o.wallet == Pubkey::default() {
        o.wallet = opponent;
        o.bump = ctx.bumps.opponent_stats;
    }
    for (stats, count) in [
        (&mut ctx.accounts.creator_stats, c_count),
        (&mut ctx.accounts.opponent_stats, o_count),
    ] {
        stats.matches = stats
            .matches
            .checked_add(1)
            .ok_or(RugRoyaleV2Error::MathOverflow)?;
        if freeroll {
            stats.day = today;
            stats.freerolls_today = count + 1; // count < cap <= u8::MAX
        }
    }

    emit!(MatchJoined {
        match_account: m.key(),
        opponent,
        start_ts,
        end_ts,
    });
    Ok(())
}
