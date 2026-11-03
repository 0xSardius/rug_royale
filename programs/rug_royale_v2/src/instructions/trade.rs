//! v2 PRD §6.3 `trade`: runs in the ER against the delegated `Match`, priced by MagicBlock's
//! oracle feed (also updated inside the ER). Signed by the seat's wallet or its in-browser
//! session key (V5); ER transactions are fee-free, so the session key needs no SOL.
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::events::Traded;
use crate::math::trade::{buy_quote, sell_quote};
use crate::oracle::read_price;
use crate::state::{Arena, Match, MatchStatus, Side};

#[derive(Accounts)]
pub struct Trade<'info> {
    /// The seat's wallet or session key.
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [MATCH_SEED, match_account.seats[0].player.as_ref(), &match_account.nonce.to_le_bytes()],
        bump = match_account.bump,
    )]
    pub match_account: Box<Account<'info, Match>>,
    /// Base-layer account; the ER clones it read-only.
    #[account(seeds = [ARENA_SEED, &match_account.arena_id.to_le_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
    /// CHECK: must equal the arena asset's feed (`WrongPriceFeed`); parsed by `read_price`.
    pub price_feed: UncheckedAccount<'info>,
}

/// Wallets first, then session keys, so a seat's session key can never claim the other
/// seat's wallet (I6).
fn seat_of(m: &Match, signer: &Pubkey) -> Option<usize> {
    m.seats
        .iter()
        .position(|s| s.player == *signer)
        .or_else(|| {
            m.seats
                .iter()
                .position(|s| s.session_key != Pubkey::default() && s.session_key == *signer)
        })
}

pub fn handle_trade(
    ctx: Context<Trade>,
    asset_index: u8,
    side: Side,
    amount: u64,
    limit_price: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let m = &ctx.accounts.match_account;
    let a = asset_index as usize;

    // v2 PRD §6.3 check order. Authorization first, so spam fails cheaply.
    let seat = seat_of(m, ctx.accounts.signer.key).ok_or(RugRoyaleV2Error::NotAParticipant)?;
    require!(
        m.status == MatchStatus::Active,
        RugRoyaleV2Error::MatchNotActive
    );
    require!(now >= m.start_ts, RugRoyaleV2Error::WindowNotStarted);
    require!(now < m.end_ts, RugRoyaleV2Error::WindowEnded);
    require!(a < m.asset_count as usize, RugRoyaleV2Error::InvalidAsset);
    let asset = ctx.accounts.arena.assets[a];
    require!(
        side == Side::Sell || asset.enabled,
        RugRoyaleV2Error::AssetDisabled
    );
    require_keys_eq!(
        ctx.accounts.price_feed.key(),
        asset.feed,
        RugRoyaleV2Error::WrongPriceFeed
    );
    let p = read_price(&ctx.accounts.price_feed)?;
    require!(
        now.saturating_sub(p.publish_time) <= m.max_price_age_s as i64,
        RugRoyaleV2Error::PriceStale
    );
    require!(amount > 0, RugRoyaleV2Error::ZeroAmount);
    match side {
        Side::Buy => require!(p.price <= limit_price, RugRoyaleV2Error::LimitPriceExceeded),
        Side::Sell => require!(p.price >= limit_price, RugRoyaleV2Error::LimitPriceExceeded),
    }

    let fee_bps = m.trade_fee_bps; // snapshotted at create (I9)
    let s = &m.seats[seat];
    let (cash, qty, out) = match side {
        Side::Buy => {
            require!(amount <= s.cash, RugRoyaleV2Error::InsufficientCash);
            let q = buy_quote(amount, p.price, asset.exponent, fee_bps)?;
            require!(q.qty_out > 0, RugRoyaleV2Error::ZeroOutput);
            let qty = s.qty[a]
                .checked_add(q.qty_out)
                .ok_or(RugRoyaleV2Error::MathOverflow)?;
            (s.cash - amount, qty, q.qty_out)
        }
        Side::Sell => {
            require!(amount <= s.qty[a], RugRoyaleV2Error::InsufficientQty);
            let q = sell_quote(amount, p.price, asset.exponent, fee_bps)?;
            require!(q.cash_out > 0, RugRoyaleV2Error::ZeroOutput);
            let cash = s
                .cash
                .checked_add(q.cash_out)
                .ok_or(RugRoyaleV2Error::MathOverflow)?;
            (cash, s.qty[a] - amount, q.cash_out)
        }
    };

    let match_key = ctx.accounts.match_account.key();
    let s = &mut ctx.accounts.match_account.seats[seat];
    s.cash = cash;
    s.qty[a] = qty;
    s.trades = s
        .trades
        .checked_add(1)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;

    emit!(Traded {
        match_account: match_key,
        seat: seat as u8,
        asset_index,
        side: side as u8,
        amount_in: amount,
        amount_out: out,
        price: p.price,
        publish_time: p.publish_time,
    });
    Ok(())
}
