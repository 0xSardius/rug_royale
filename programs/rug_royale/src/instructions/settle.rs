use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::RugRoyaleError;
use crate::events::DuelSettled;
use crate::math::{payout, valuation};
use crate::state::{Config, Duel, DuelStatus, Escrow, Pool};

/// PRD §6.6 — owner: Yamin. No sponsor account (G15). Payout recipients are pinned
/// with `address =` (I11).
#[derive(Accounts)]
pub struct Settle<'info> {
    /// Receives the tip.
    #[account(mut)]
    pub settler: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()],
        bump = duel.bump,
    )]
    pub duel: Box<Account<'info, Duel>>,
    #[account(seeds = [POOL_SEED, duel.key().as_ref()], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, seeds = [ESCROW_SEED, duel.key().as_ref()], bump = escrow.bump)]
    pub escrow: Box<Account<'info, Escrow>>,
    /// CHECK: signer-only PDA, no data.
    #[account(seeds = [VAULT_SEED, duel.key().as_ref(), duel.creator.as_ref()], bump)]
    pub creator_vault_authority: UncheckedAccount<'info>,
    /// CHECK: signer-only PDA, no data.
    #[account(seeds = [VAULT_SEED, duel.key().as_ref(), duel.opponent.as_ref()], bump)]
    pub opponent_vault_authority: UncheckedAccount<'info>,
    #[account(
        associated_token::mint = quote_mint,
        associated_token::authority = creator_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub creator_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        associated_token::mint = coin_mint,
        associated_token::authority = creator_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub creator_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        associated_token::mint = quote_mint,
        associated_token::authority = opponent_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub opponent_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        associated_token::mint = coin_mint,
        associated_token::authority = opponent_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub opponent_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = duel.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = duel.coin)]
    pub coin_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: pinned to config.treasury; only receives lamports.
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: pinned to duel.creator; only receives lamports.
    #[account(mut, address = duel.creator)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: pinned to duel.opponent; only receives lamports.
    #[account(mut, address = duel.opponent)]
    pub opponent: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_settle(ctx: Context<Settle>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let duel = &ctx.accounts.duel;

    // PRD §6.6 check order. No upper time limit: a late settle gives the same result (I7),
    // because swaps stop at end_ts and nothing else moves the pool or the vaults.
    require!(
        duel.status == DuelStatus::Active,
        RugRoyaleError::DuelNotActive
    );
    require!(now >= duel.end_ts, RugRoyaleError::WindowNotEnded);

    // PRD §7: each player valued alone against the same end reserves (I6).
    let config = &ctx.accounts.config;
    let (qr, tr) = (
        ctx.accounts.pool.quote_reserve,
        ctx.accounts.pool.token_reserve,
    );
    let fee = config.swap_fee_bps;
    let final_a = valuation::final_value(
        ctx.accounts.creator_quote_vault.amount,
        ctx.accounts.creator_coin_vault.amount,
        qr,
        tr,
        fee,
    )?;
    let final_b = valuation::final_value(
        ctx.accounts.opponent_quote_vault.amount,
        ctx.accounts.opponent_coin_vault.amount,
        qr,
        tr,
        fee,
    )?;
    let result = valuation::duel_result(final_a, final_b);
    let p = payout::payout(
        duel.entry_lamports,
        duel.sponsored_lamports,
        config.settler_tip_lamports,
        config.rake_bps,
        result,
    )?;

    // Escrow is program-owned (G1): debit it directly. Recipients are pinned by `address =`
    // (I11). The settler may also be a player or the treasury; credits then add up.
    let escrow = ctx.accounts.escrow.to_account_info();
    for (to, amount) in [
        (ctx.accounts.creator.to_account_info(), p.to_creator),
        (ctx.accounts.opponent.to_account_info(), p.to_opponent),
        (ctx.accounts.treasury.to_account_info(), p.to_treasury),
        (ctx.accounts.settler.to_account_info(), p.to_settler),
    ] {
        if amount > 0 {
            escrow.sub_lamports(amount)?;
            to.add_lamports(amount)?;
        }
    }

    let duel_key = ctx.accounts.duel.key();
    let duel = &mut ctx.accounts.duel;
    duel.final_a = final_a;
    duel.final_b = final_b;
    duel.result = result;
    duel.status = DuelStatus::Settled;

    emit!(DuelSettled {
        duel: duel_key,
        result,
        final_a,
        final_b,
        prize: p.prize,
        rake: p.rake,
        tip: p.tip,
    });
    Ok(())
}
