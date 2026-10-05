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

pub fn handle_init_config(_ctx: Context<InitConfig>, _args: InitConfigArgs) -> Result<()> {
    // TODO(Sidharth): checks in PRD §6.1 order, then write Config (bumps from ctx.bumps;
    // mint_authority_bump via Pubkey::find_program_address([MINT_AUTHORITY_SEED])).
    Ok(())
}
