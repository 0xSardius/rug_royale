use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::state::{Duel, Escrow, Pool};

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

pub fn handle_close_duel(ctx: Context<CloseDuel>) -> Result<()> {
    ctx.accounts.verify_ata_addresses()?;
    // TODO(Sidharth): PRD §6.8. Check status/closed/escrow first, burn + close every
    // token account, set duel.closed = true.
    Ok(())
}
