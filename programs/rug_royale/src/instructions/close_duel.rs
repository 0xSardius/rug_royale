use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::state::{Duel, Escrow, Pool};

/// PRD §6.8 — owner: Sidharth. Permissionless.
/// The four `opponent*` accounts are absent for a Cancelled duel (nobody joined).
/// Escrow and pool close to the creator on success; token accounts are burned then
/// closed in the handler, rent to whoever paid for them.
#[derive(Accounts)]
pub struct CloseDuel<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()],
        bump = duel.bump,
    )]
    pub duel: Box<Account<'info, Duel>>,
    #[account(
        mut,
        close = creator,
        seeds = [ESCROW_SEED, duel.key().as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        close = creator,
        seeds = [POOL_SEED, duel.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: pinned to duel.creator; receives rent.
    #[account(mut, address = duel.creator)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: pinned to duel.opponent; receives rent for the opponent's vaults.
    #[account(mut, address = duel.opponent)]
    pub opponent: Option<UncheckedAccount<'info>>,
    /// CHECK: signer-only PDA, no data.
    #[account(seeds = [VAULT_SEED, duel.key().as_ref(), duel.creator.as_ref()], bump)]
    pub creator_vault_authority: UncheckedAccount<'info>,
    /// CHECK: signer-only PDA, no data.
    #[account(seeds = [VAULT_SEED, duel.key().as_ref(), duel.opponent.as_ref()], bump)]
    pub opponent_vault_authority: Option<UncheckedAccount<'info>>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = creator_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub creator_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = coin_mint,
        associated_token::authority = creator_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub creator_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = opponent_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub opponent_quote_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    #[account(
        mut,
        associated_token::mint = coin_mint,
        associated_token::authority = opponent_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub opponent_coin_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
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
    #[account(mut, address = duel.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = duel.coin)]
    pub coin_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_duel(_ctx: Context<CloseDuel>) -> Result<()> {
    // TODO(Sidharth): PRD §6.8. Check status/closed/escrow first, burn + close every
    // token account, set duel.closed = true.
    Ok(())
}
