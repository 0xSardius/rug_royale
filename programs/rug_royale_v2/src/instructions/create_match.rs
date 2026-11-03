use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::MatchCreated;
use crate::math::payout::fee_share;
use crate::state::{Arena, Match, MatchStatus, PlayerStats, Pot, PotStatus, Protocol, Seat};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMatchArgs {
    pub nonce: u64,
    pub window_secs: u32,
    pub entry_lamports: u64,
    /// Default = anyone may join.
    pub allowed_opponent: Pubkey,
    pub join_deadline: i64,
    /// V5: browser-held key that may sign `trade` for this seat. Default = wallet only.
    pub session_key: Pubkey,
    /// V4 / D6: ER validator identity (region) pinned at delegation.
    pub validator: Pubkey,
}

/// v2 PRD §6.2.
#[derive(Accounts)]
#[instruction(arena_id: u16, args: CreateMatchArgs)]
pub struct CreateMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [ARENA_SEED, &arena_id.to_le_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    #[account(
        init,
        payer = creator,
        space = 8 + Match::INIT_SPACE,
        seeds = [MATCH_SEED, creator.key().as_ref(), &args.nonce.to_le_bytes()],
        bump,
    )]
    pub match_account: Box<Account<'info, Match>>,
    #[account(
        init,
        payer = creator,
        space = 8 + Pot::INIT_SPACE,
        seeds = [POT_SEED, match_account.key().as_ref()],
        bump,
    )]
    pub pot: Box<Account<'info, Pot>>,
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [PLAYER_SEED, creator.key().as_ref()],
        bump,
    )]
    pub creator_stats: Box<Account<'info, PlayerStats>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_match(
    ctx: Context<CreateMatch>,
    arena_id: u16,
    args: CreateMatchArgs,
) -> Result<()> {
    let protocol = &ctx.accounts.protocol;
    let arena = &ctx.accounts.arena;
    let creator = ctx.accounts.creator.key();
    let now = Clock::get()?.unix_timestamp;

    // v2 PRD §6.2 check order.
    require!(!protocol.paused && !arena.paused, RugRoyaleV2Error::Paused);
    require!(
        args.window_secs > 0 && arena.windows.contains(&args.window_secs),
        RugRoyaleV2Error::InvalidWindow
    );
    let e = args.entry_lamports;
    require!(
        e == 0
            || (arena.min_entry_lamports <= e
                && e <= arena.max_entry_lamports
                && e <= protocol.max_entry_lamports),
        RugRoyaleV2Error::EntryOutOfRange
    );
    let earliest = now
        .checked_add(MIN_JOIN_DEADLINE_SECS)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    let latest = now
        .checked_add(MAX_JOIN_DEADLINE_SECS)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    require!(
        args.join_deadline >= earliest,
        RugRoyaleV2Error::DeadlineTooSoon
    );
    require!(
        args.join_deadline <= latest,
        RugRoyaleV2Error::DeadlineTooFar
    );
    require_keys_neq!(
        args.allowed_opponent,
        creator,
        RugRoyaleV2Error::CannotJoinOwnMatch
    );
    require!(
        args.validator != Pubkey::default(),
        RugRoyaleV2Error::InvalidValidator
    );

    // Entry (+ the free-duel match-fee share, Q1) into the program-owned pot (G1).
    let share = fee_share(e, protocol.match_fee_lamports);
    let deposit = e.checked_add(share).ok_or(RugRoyaleV2Error::MathOverflow)?;
    if deposit > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.pot.to_account_info(),
                },
            ),
            deposit,
        )?;
    }

    let match_key = ctx.accounts.match_account.key();
    let pot_key = ctx.accounts.pot.key();
    let (bankroll, asset_count, fee_bps, max_age, rake_bps) = (
        arena.bankroll,
        arena.asset_count,
        arena.trade_fee_bps,
        arena.max_price_age_s,
        arena.rake_bps,
    );
    let (match_fee, tip) = (protocol.match_fee_lamports, protocol.settler_tip_lamports);

    ctx.accounts.pot.set_inner(Pot {
        status: PotStatus::Open,
        bump: ctx.bumps.pot,
        arena_id,
        window_secs: args.window_secs,
        entry_lamports: e,
        sponsored_lamports: 0,
        match_fee_lamports: match_fee,
        fee_share_lamports: share,
        settler_tip_lamports: tip,
        rake_bps,
        join_deadline: args.join_deadline,
        end_ts: 0,
        match_account: match_key,
        creator,
        opponent: Pubkey::default(),
        allowed_opponent: args.allowed_opponent,
        sponsor: Pubkey::default(),
        validator: args.validator,
    });

    let mut seats = [Seat::default(); NUM_SEATS];
    seats[0] = Seat {
        player: creator,
        session_key: args.session_key,
        cash: bankroll,
        qty: [0; MAX_ASSETS],
        trades: 0,
    };
    ctx.accounts.match_account.set_inner(Match {
        status: MatchStatus::Open,
        result: RESULT_PENDING,
        bump: ctx.bumps.match_account,
        asset_count,
        arena_id,
        nonce: args.nonce,
        start_ts: 0,
        end_ts: 0,
        trade_fee_bps: fee_bps,
        max_price_age_s: max_age,
        pot: pot_key,
        seats,
        final_values: [0; NUM_SEATS],
        mark_prices: [0; MAX_ASSETS],
        mark_publish_time: 0,
    });

    let stats = &mut ctx.accounts.creator_stats;
    if stats.wallet == Pubkey::default() {
        stats.wallet = creator;
        stats.bump = ctx.bumps.creator_stats;
    }

    emit!(MatchCreated {
        match_account: match_key,
        pot: pot_key,
        creator,
        arena_id,
        window_secs: args.window_secs,
        entry_lamports: e,
        allowed_opponent: args.allowed_opponent,
        join_deadline: args.join_deadline,
        validator: args.validator,
    });
    Ok(())
}
