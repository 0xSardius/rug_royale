use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token_interface::{
    burn_checked, close_account, BurnChecked, CloseAccount, Mint, TokenAccount, TokenInterface,
};

use crate::constants::*;
use crate::errors::RugRoyaleError;
use crate::events::DuelClosed;
use crate::state::{Duel, DuelStatus, Escrow, Pool};

/// PRD §6.8 — owner: Sidharth. Permissionless.
/// The four `opponent*` accounts are absent for a Cancelled duel (nobody joined).
/// Escrow and pool close to the creator on success; token accounts are burned then
/// closed in the handler, rent to whoever paid for them.
///
/// Stack budget: token accounts use `token::` (mint/owner) constraints, not
/// `associated_token::`, because 6 ATA derivations pushed `try_accounts` past the 4 KB BPF
/// stack (4,736 bytes). `verify_ata_addresses` restores the exact-ATA guarantee in its own
/// frame and must stay the first call in the handler.
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
        token::mint = quote_mint,
        token::authority = creator_vault_authority,
        token::token_program = token_program,
    )]
    pub creator_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = coin_mint,
        token::authority = creator_vault_authority,
        token::token_program = token_program,
    )]
    pub creator_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = opponent_vault_authority,
        token::token_program = token_program,
    )]
    pub opponent_quote_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    #[account(
        mut,
        token::mint = coin_mint,
        token::authority = opponent_vault_authority,
        token::token_program = token_program,
    )]
    pub opponent_coin_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    #[account(
        mut,
        token::mint = quote_mint,
        token::authority = pool,
        token::token_program = token_program,
    )]
    pub pool_quote_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = coin_mint,
        token::authority = pool,
        token::token_program = token_program,
    )]
    pub pool_coin_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = duel.quote_mint)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = duel.coin)]
    pub coin_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> CloseDuel<'info> {
    /// Each token account must be the canonical ATA, not just any account with the right
    /// mint and owner; otherwise a decoy could be closed while the real vault stays open.
    #[inline(never)]
    pub fn verify_ata_addresses(&self) -> Result<()> {
        let tp = self.token_program.key();
        let (quote, coin) = (self.quote_mint.key(), self.coin_mint.key());
        let check = |account: Pubkey, owner: Pubkey, mint: Pubkey| -> Result<()> {
            require_keys_eq!(
                account,
                get_associated_token_address_with_program_id(&owner, &mint, &tp),
                ErrorCode::AccountNotAssociatedTokenAccount
            );
            Ok(())
        };
        let creator_va = self.creator_vault_authority.key();
        check(self.creator_quote_vault.key(), creator_va, quote)?;
        check(self.creator_coin_vault.key(), creator_va, coin)?;
        let pool = self.pool.key();
        check(self.pool_quote_vault.key(), pool, quote)?;
        check(self.pool_coin_vault.key(), pool, coin)?;
        if let Some(opponent_va) = &self.opponent_vault_authority {
            let opponent_va = opponent_va.key();
            if let Some(v) = &self.opponent_quote_vault {
                check(v.key(), opponent_va, quote)?;
            }
            if let Some(v) = &self.opponent_coin_vault {
                check(v.key(), opponent_va, coin)?;
            }
        }
        Ok(())
    }
}

/// Burns `vault`'s whole balance and closes it, rent to `rent_to`. `owner` is the PDA that
/// owns the token account and signs with `seeds`. Own frame to keep the handler's stack small.
#[inline(never)]
fn burn_and_close<'info>(
    token_program: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    owner: AccountInfo<'info>,
    rent_to: AccountInfo<'info>,
    seeds: &[&[u8]],
) -> Result<()> {
    let signer = &[seeds];
    if vault.amount > 0 {
        burn_checked(
            CpiContext::new_with_signer(
                token_program.key(),
                BurnChecked {
                    mint: mint.to_account_info(),
                    from: vault.to_account_info(),
                    authority: owner.clone(),
                },
                signer,
            ),
            vault.amount,
            mint.decimals,
        )?;
    }
    close_account(CpiContext::new_with_signer(
        token_program.key(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_to,
            authority: owner,
        },
        signer,
    ))
}

pub fn handle_close_duel(ctx: Context<CloseDuel>) -> Result<()> {
    ctx.accounts.verify_ata_addresses()?;

    // PRD §6.8 checks. These must stay ahead of everything else: `close = creator` on
    // escrow and pool runs on success, so without them a creator could close an Active
    // duel and take the opponent's entry.
    let duel = &ctx.accounts.duel;
    require!(
        duel.status == DuelStatus::Settled || duel.status == DuelStatus::Cancelled,
        RugRoyaleError::DuelStillLive
    );
    require!(!duel.closed, RugRoyaleError::AlreadyClosed);
    // No EscrowNotEmpty check (PRD §6.8 amended 2026-10-08): anyone could send 1 lamport to
    // escrow and block close forever. settle/cancel leave escrow at exactly rent, and
    // `close = creator` sweeps any donated dust to the creator.

    // Once someone joined, all four opponent accounts are required; otherwise they could be
    // left out, verify_ata_addresses would skip them, and their rent would be stranded.
    let joined = duel.opponent != Pubkey::default();
    let a = &ctx.accounts;
    let opponent_side = if joined {
        match (
            &a.opponent,
            &a.opponent_vault_authority,
            &a.opponent_quote_vault,
            &a.opponent_coin_vault,
        ) {
            (Some(o), Some(va), Some(q), Some(c)) => Some((o, va, q, c)),
            _ => return err!(ErrorCode::AccountNotEnoughKeys),
        }
    } else {
        None
    };

    let duel_key = duel.key();
    let creator_key = duel.creator;
    let tp = &a.token_program;
    let creator = a.creator.to_account_info();

    let creator_bump = [ctx.bumps.creator_vault_authority];
    let creator_seeds: &[&[u8]] = &[
        VAULT_SEED,
        duel_key.as_ref(),
        creator_key.as_ref(),
        &creator_bump,
    ];
    let creator_va = a.creator_vault_authority.to_account_info();
    burn_and_close(
        tp,
        &a.creator_quote_vault,
        &a.quote_mint,
        creator_va.clone(),
        creator.clone(),
        creator_seeds,
    )?;
    burn_and_close(
        tp,
        &a.creator_coin_vault,
        &a.coin_mint,
        creator_va,
        creator.clone(),
        creator_seeds,
    )?;

    if let Some((opponent, opponent_va, quote, coin)) = opponent_side {
        let opponent_key = duel.opponent;
        let bump = [ctx
            .bumps
            .opponent_vault_authority
            .ok_or(ErrorCode::AccountNotEnoughKeys)?];
        let seeds: &[&[u8]] = &[VAULT_SEED, duel_key.as_ref(), opponent_key.as_ref(), &bump];
        let va = opponent_va.to_account_info();
        let rent_to = opponent.to_account_info();
        burn_and_close(tp, quote, &a.quote_mint, va.clone(), rent_to.clone(), seeds)?;
        burn_and_close(tp, coin, &a.coin_mint, va, rent_to, seeds)?;
    }

    // The pool's token accounts were paid for by the creator in create_duel.
    let pool_bump = [a.pool.bump];
    let pool_seeds: &[&[u8]] = &[POOL_SEED, duel_key.as_ref(), &pool_bump];
    let pool = a.pool.to_account_info();
    burn_and_close(
        tp,
        &a.pool_quote_vault,
        &a.quote_mint,
        pool.clone(),
        creator.clone(),
        pool_seeds,
    )?;
    burn_and_close(
        tp,
        &a.pool_coin_vault,
        &a.coin_mint,
        pool,
        creator,
        pool_seeds,
    )?;

    // Escrow and pool close to the creator on exit (`close = creator`). Duel stays (I13).
    ctx.accounts.duel.closed = true;
    emit!(DuelClosed { duel: duel_key });
    Ok(())
}
