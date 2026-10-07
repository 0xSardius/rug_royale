use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::*;
use crate::errors::RugRoyaleError;
use crate::events::SwapExecuted;
use crate::math::amm;
use crate::state::{Config, Duel, DuelStatus, Pool, Side};

/// PRD §6.5 — owner: Yamin.
/// Vault accounts are bound to the signer by seeds (I10). `NotAParticipant` is a handler
/// check so it fires in PRD order; to hit it in a test, create ATAs for a non-player's
/// vault authority first (anyone can create an ATA for an off-curve owner).
/// `config` is read for `swap_fee_bps` (G4); added 2026-10-07, not in the original §6.5 list.
#[derive(Accounts)]
pub struct Swap<'info> {
    pub player: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()],
        bump = duel.bump,
    )]
    pub duel: Box<Account<'info, Duel>>,
    #[account(mut, seeds = [POOL_SEED, duel.key().as_ref()], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: signer-only PDA, no data.
    #[account(seeds = [VAULT_SEED, duel.key().as_ref(), player.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub player_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = coin_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub player_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program,
    )]
    pub pool_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = coin_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program,
    )]
    pub pool_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = duel.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = duel.coin)]
    pub coin_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_swap(ctx: Context<Swap>, side: Side, amount_in: u64, min_out: u64) -> Result<()> {
    let duel = &ctx.accounts.duel;
    let player = ctx.accounts.player.key();
    let now = Clock::get()?.unix_timestamp;

    // PRD §6.5 check order. WrongPool is enforced by the pool's seeds.
    require!(
        duel.status == DuelStatus::Active,
        RugRoyaleError::DuelNotActive
    );
    require!(now >= duel.start_ts, RugRoyaleError::WindowNotStarted);
    require!(now < duel.end_ts, RugRoyaleError::WindowEnded);
    require!(
        player == duel.creator || player == duel.opponent,
        RugRoyaleError::NotAParticipant
    );
    require!(amount_in > 0, RugRoyaleError::ZeroAmount);
    let source_balance = match side {
        Side::Buy => ctx.accounts.player_quote_vault.amount,
        Side::Sell => ctx.accounts.player_coin_vault.amount,
    };
    require!(
        amount_in <= source_balance,
        RugRoyaleError::InsufficientBankroll
    );

    let pool = &ctx.accounts.pool;
    let (quote_before, token_before) = (pool.quote_reserve, pool.token_reserve);
    let q = amm::swap_quote(
        side,
        amount_in,
        quote_before,
        token_before,
        ctx.accounts.config.swap_fee_bps,
    )?;
    require!(q.out > 0, RugRoyaleError::ZeroOutput);
    require!(q.out >= min_out, RugRoyaleError::SlippageExceeded);
    // Holds for every input (see the amm vectors); kept as a guard. The PRD names no error.
    require!(
        amm::k(q.quote_reserve, q.token_reserve) >= amm::k(quote_before, token_before),
        RugRoyaleError::MathOverflow
    );

    let duel_key = duel.key();
    let vault_bump = [ctx.bumps.vault_authority];
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, duel_key.as_ref(), player.as_ref(), &vault_bump];
    let pool_bump = [pool.bump];
    let pool_seeds: &[&[u8]] = &[POOL_SEED, duel_key.as_ref(), &pool_bump];

    let a = &ctx.accounts;
    let (player_in, pool_in, in_mint, pool_out, player_out, out_mint) = match side {
        Side::Buy => (
            &a.player_quote_vault,
            &a.pool_quote_vault,
            &a.quote_mint,
            &a.pool_coin_vault,
            &a.player_coin_vault,
            &a.coin_mint,
        ),
        Side::Sell => (
            &a.player_coin_vault,
            &a.pool_coin_vault,
            &a.coin_mint,
            &a.pool_quote_vault,
            &a.player_quote_vault,
            &a.quote_mint,
        ),
    };

    transfer_checked(
        CpiContext::new_with_signer(
            a.token_program.key(),
            TransferChecked {
                from: player_in.to_account_info(),
                mint: in_mint.to_account_info(),
                to: pool_in.to_account_info(),
                authority: a.vault_authority.to_account_info(),
            },
            &[vault_seeds],
        ),
        amount_in,
        in_mint.decimals,
    )?;
    transfer_checked(
        CpiContext::new_with_signer(
            a.token_program.key(),
            TransferChecked {
                from: pool_out.to_account_info(),
                mint: out_mint.to_account_info(),
                to: player_out.to_account_info(),
                authority: a.pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        q.out,
        out_mint.decimals,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.quote_reserve = q.quote_reserve;
    pool.token_reserve = q.token_reserve;

    emit!(SwapExecuted {
        duel: duel_key,
        player,
        side,
        amount_in,
        amount_out: q.out,
        quote_reserve: q.quote_reserve,
        token_reserve: q.token_reserve,
    });
    Ok(())
}
