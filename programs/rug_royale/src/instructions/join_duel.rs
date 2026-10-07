use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::{create, AssociatedToken, Create};
use anchor_spl::token_interface::{mint_to_checked, Mint, MintToChecked, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::RugRoyaleError;
use crate::events::DuelJoined;
use crate::state::{Config, Duel, DuelStatus, Escrow};

/// PRD §6.4 — owner: Sidharth (implemented by Justin under the fallback rule).
///
/// The opponent vaults are created in the handler (ATA program CPI), not with `init`:
/// Anchor runs `init` before any check, so a creator joining their own duel would hit
/// "already in use" on their own vaults instead of `CannotJoinOwnDuel`. The ATA program
/// verifies each vault's address when it creates it.
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
    /// CHECK: created in the handler by the ATA program, which checks it is
    /// ATA(opponent_vault_authority, quote_mint).
    #[account(mut)]
    pub opponent_quote_vault: UncheckedAccount<'info>,
    /// CHECK: created in the handler by the ATA program, which checks it is
    /// ATA(opponent_vault_authority, coin_mint).
    #[account(mut)]
    pub opponent_coin_vault: UncheckedAccount<'info>,
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

pub fn handle_join_duel(ctx: Context<JoinDuel>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let opponent = ctx.accounts.opponent.key();
    let d = &ctx.accounts.duel;

    // PRD §6.4 check order.
    require!(d.status == DuelStatus::Open, RugRoyaleError::DuelNotOpen);
    require!(now < d.join_deadline, RugRoyaleError::JoinDeadlinePassed);
    require_keys_neq!(opponent, d.creator, RugRoyaleError::CannotJoinOwnDuel);
    require!(
        d.allowed_opponent == Pubkey::default() || d.allowed_opponent == opponent,
        RugRoyaleError::OpponentNotAllowed
    );

    let entry = ctx.accounts.duel.entry_lamports;
    let bankroll = ctx.accounts.duel.bankroll;
    let start_ts = now.checked_add(START_DELAY_SECS).ok_or(RugRoyaleError::MathOverflow)?;
    let end_ts = start_ts
        .checked_add(ctx.accounts.duel.window_secs as i64)
        .ok_or(RugRoyaleError::MathOverflow)?;

    if entry > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.opponent.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            entry,
        )?;
    }

    // Opponent vaults (rent paid by the opponent). The ATA program checks each address.
    let a = &ctx.accounts;
    for (vault, mint) in [
        (&a.opponent_quote_vault, a.quote_mint.to_account_info()),
        (&a.opponent_coin_vault, a.coin_mint.to_account_info()),
    ] {
        create(CpiContext::new(
            a.associated_token_program.key(),
            Create {
                payer: a.opponent.to_account_info(),
                associated_token: vault.to_account_info(),
                authority: a.opponent_vault_authority.to_account_info(),
                mint,
                system_program: a.system_program.to_account_info(),
                token_program: a.token_program.to_account_info(),
            },
        ))?;
    }

    // Equal bankrolls into both quote vaults; MintAuthority signs by seeds (RT-2).
    let mint_authority_seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[ctx.accounts.config.mint_authority_bump]];
    for to in [
        a.creator_quote_vault.to_account_info(),
        a.opponent_quote_vault.to_account_info(),
    ] {
        mint_to_checked(
            CpiContext::new_with_signer(
                a.token_program.key(),
                MintToChecked {
                    mint: a.quote_mint.to_account_info(),
                    to,
                    authority: a.mint_authority.to_account_info(),
                },
                &[mint_authority_seeds],
            ),
            bankroll,
            a.quote_mint.decimals,
        )?;
    }

    let duel = &mut ctx.accounts.duel;
    duel.opponent = opponent;
    duel.start_ts = start_ts;
    duel.end_ts = end_ts;
    duel.status = DuelStatus::Active;

    emit!(DuelJoined {
        duel: duel.key(),
        opponent,
        start_ts,
        end_ts,
    });
    Ok(())
}
