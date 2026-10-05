use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::state::{Duel, Pool, Side};

/// PRD §6.5 — owner: Yamin.
/// Vault accounts are bound to the signer by seeds (I10). `NotAParticipant` is a handler
/// check so it fires in PRD order; to hit it in a test, create ATAs for a non-player's
/// vault authority first (anyone can create an ATA for an off-curve owner).
#[derive(Accounts)]
pub struct Swap<'info> {
    pub player: Signer<'info>,
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

pub fn handle_swap(_ctx: Context<Swap>, _side: Side, _amount_in: u64, _min_out: u64) -> Result<()> {
    // TODO(Yamin): PRD §6.5 using math::amm.
    Ok(())
}
