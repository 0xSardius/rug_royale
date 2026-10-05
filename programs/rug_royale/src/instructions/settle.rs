use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::state::{Config, Duel, Escrow, Pool};

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

pub fn handle_settle(_ctx: Context<Settle>) -> Result<()> {
    // TODO(Yamin): PRD §6.6 using math::valuation and math::payout.
    Ok(())
}
