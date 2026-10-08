use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    mint_to_checked, Mint, MintToChecked, TokenAccount, TokenInterface,
};

use crate::constants::*;
use crate::errors::RugRoyaleError;
use crate::events::DuelCreated;
use crate::state::{Config, Duel, DuelStatus, Escrow, Pool};

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
    ctx: Context<CreateDuel>,
    nonce: u64,
    tier: u8,
    window_secs: u32,
    entry_lamports: u64,
    allowed_opponent: Pubkey,
    join_deadline: i64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let coin = ctx.accounts.coin_mint.key();
    let now = Clock::get()?.unix_timestamp;

    // PRD §6.2 check order.
    require!((tier as usize) < NUM_TIERS, RugRoyaleError::InvalidTier);
    require!(
        config.windows.contains(&window_secs),
        RugRoyaleError::InvalidWindow
    );
    require!(
        config.allowed_mints.contains(&coin),
        RugRoyaleError::MintNotAllowed
    );
    let earliest = now
        .checked_add(MIN_JOIN_DEADLINE_SECS)
        .ok_or(RugRoyaleError::MathOverflow)?;
    let latest = now
        .checked_add(MAX_JOIN_DEADLINE_SECS)
        .ok_or(RugRoyaleError::MathOverflow)?;
    require!(join_deadline >= earliest, RugRoyaleError::DeadlineTooSoon);
    require!(join_deadline <= latest, RugRoyaleError::DeadlineTooFar);
    require!(
        entry_lamports <= config.max_entry_lamports,
        RugRoyaleError::EntryTooHigh
    );
    // Not in PRD §6.2: inviting yourself makes a duel nobody can join (join_duel rejects the
    // creator), locking the entry and any sponsor money until the deadline.
    require_keys_neq!(
        allowed_opponent,
        ctx.accounts.creator.key(),
        RugRoyaleError::OpponentNotAllowed
    );

    let bankroll = config.tiers[tier as usize];
    let seed = bankroll
        .checked_mul(config.pool_seed_ratio)
        .ok_or(RugRoyaleError::MathOverflow)?;
    let mint_authority_bump = config.mint_authority_bump;
    let quote_mint = ctx.accounts.quote_mint.key();
    let creator = ctx.accounts.creator.key();
    let duel_key = ctx.accounts.duel.key();

    ctx.accounts.duel.set_inner(Duel {
        status: DuelStatus::Open,
        result: RESULT_PENDING,
        tier,
        closed: false,
        bump: ctx.bumps.duel,
        window_secs,
        nonce,
        entry_lamports,
        sponsored_lamports: 0,
        bankroll,
        final_a: 0,
        final_b: 0,
        join_deadline,
        start_ts: 0,
        end_ts: 0,
        creator,
        opponent: Pubkey::default(),
        allowed_opponent,
        sponsor: Pubkey::default(),
        coin,
        quote_mint,
    });
    ctx.accounts.escrow.bump = ctx.bumps.escrow;
    ctx.accounts.pool.set_inner(Pool {
        duel: duel_key,
        coin,
        quote_reserve: seed,
        token_reserve: seed,
        bump: ctx.bumps.pool,
    });

    // Escrow is program-owned (G1); deposits use a normal system transfer from the signer.
    if entry_lamports > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            entry_lamports,
        )?;
    }

    // Seed the pool at a 1:1 price (G5): `seed` raw units of quote and of coin.
    let mint_authority_seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[mint_authority_bump]];
    let a = &ctx.accounts;
    for (mint, to) in [
        (&a.quote_mint, &a.pool_quote_vault),
        (&a.coin_mint, &a.pool_coin_vault),
    ] {
        mint_to_checked(
            CpiContext::new_with_signer(
                a.token_program.key(),
                MintToChecked {
                    mint: mint.to_account_info(),
                    to: to.to_account_info(),
                    authority: a.mint_authority.to_account_info(),
                },
                &[mint_authority_seeds],
            ),
            seed,
            mint.decimals,
        )?;
    }

    emit!(DuelCreated {
        duel: duel_key,
        creator,
        coin,
        tier,
        window_secs,
        entry_lamports,
        join_deadline,
    });
    Ok(())
}
