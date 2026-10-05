use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::state::{Config, Duel, Escrow, Pool};

/// PRD §6.2 — owner: Sidharth.
/// `coin_mint` is deliberately unconstrained here: membership in `config.allowed_mints`
/// is a handler check so it raises `MintNotAllowed` in PRD order.
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateDuel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        init,
        payer = creator,
        space = 8 + Duel::INIT_SPACE,
        seeds = [DUEL_SEED, creator.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub duel: Box<Account<'info, Duel>>,
    #[account(
        init,
        payer = creator,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [ESCROW_SEED, duel.key().as_ref()],
        bump,
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    /// CHECK: signer-only PDA, no data.
    #[account(seeds = [VAULT_SEED, duel.key().as_ref(), creator.key().as_ref()], bump)]
    pub creator_vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = creator_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub creator_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = coin_mint,
        associated_token::authority = creator_vault_authority,
        associated_token::token_program = token_program,
    )]
    pub creator_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = creator,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED, duel.key().as_ref()],
        bump,
    )]
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program,
    )]
    pub pool_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = coin_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program,
    )]
    pub pool_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = config.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub coin_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: signer-only PDA, mint authority of every demo mint.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump = config.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_duel(
    _ctx: Context<CreateDuel>,
    _nonce: u64,
    _tier: u8,
    _window_secs: u32,
    _entry_lamports: u64,
    _allowed_opponent: Pubkey,
    _join_deadline: i64,
) -> Result<()> {
    // TODO(Sidharth): PRD §6.2 checks, Duel/Escrow/Pool writes, entry transfer, pool seed mints.
    Ok(())
}
