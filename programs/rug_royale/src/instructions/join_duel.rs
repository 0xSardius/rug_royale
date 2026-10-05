use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::state::{Config, Duel, Escrow};

/// PRD §6.4 — owner: Sidharth.
#[derive(Accounts)]
pub struct JoinDuel<'info> {
    #[account(mut)]
    pub opponent: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()],
        bump = duel.bump,
    )]
    pub duel: Box<Account<'info, Duel>>,
    #[account(mut, seeds = [ESCROW_SEED, duel.key().as_ref()], bump = escrow.bump)]
    pub escrow: Box<Account<'info, Escrow>>,
    /// CHECK: signer-only PDA, no data.
    #[account(seeds = [VAULT_SEED, duel.key().as_ref(), duel.creator.as_ref()], bump)]
    pub creator_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = creator_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub creator_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: signer-only PDA, no data.
    #[account(seeds = [VAULT_SEED, duel.key().as_ref(), opponent.key().as_ref()], bump)]
    pub opponent_vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = opponent,
        associated_token::mint = quote_mint,
        associated_token::authority = opponent_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub opponent_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = opponent,
        associated_token::mint = coin_mint,
        associated_token::authority = opponent_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub opponent_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = duel.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = duel.coin)]
    pub coin_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: signer-only PDA, mint authority of every demo mint.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump = config.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_join_duel(_ctx: Context<JoinDuel>) -> Result<()> {
    // TODO(Sidharth): PRD §6.4.
    Ok(())
}
