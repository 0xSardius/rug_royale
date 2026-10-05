use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::Config;

/// PRD §6.1 — owner: Sidharth.
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,
    pub system_program: Program<'info, System>,
}

/// Every `Config` field except `admin` (the signer) and bumps.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitConfigArgs {
    pub treasury: Pubkey,
    pub quote_mint: Pubkey,
    pub allowed_mints: [Pubkey; NUM_ALLOWED_MINTS],
    pub tiers: [u64; NUM_TIERS],
    pub windows: [u32; NUM_WINDOWS],
    pub pool_seed_ratio: u64,
    pub settler_tip_lamports: u64,
    pub max_entry_lamports: u64,
    pub rake_bps: u16,
    pub swap_fee_bps: u16,
}

pub fn handle_init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
    // TODO(Sidharth): checks in PRD §6.1 order (RakeTooHigh, FeeTooHigh, InvalidWindowSet,
    // InvalidTierSet, InvalidMintList, pool_seed_ratio >= 1) before the writes below.
    // The writes are here already so every other handler's `config` seeds check passes in tests.
    let (_, mint_authority_bump) =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], ctx.program_id);
    ctx.accounts.config.set_inner(Config {
        admin: ctx.accounts.admin.key(),
        treasury: args.treasury,
        quote_mint: args.quote_mint,
        allowed_mints: args.allowed_mints,
        tiers: args.tiers,
        windows: args.windows,
        pool_seed_ratio: args.pool_seed_ratio,
        settler_tip_lamports: args.settler_tip_lamports,
        max_entry_lamports: args.max_entry_lamports,
        rake_bps: args.rake_bps,
        swap_fee_bps: args.swap_fee_bps,
        bump: ctx.bumps.config,
        mint_authority_bump,
    });
    Ok(())
}
