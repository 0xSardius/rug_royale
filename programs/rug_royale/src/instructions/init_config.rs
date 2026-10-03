use anchor_lang::prelude::*;

/// PRD §6.1 — owner: Sidharth. STUB: only the signer is declared.
/// Full account list, checks (in PRD order) and effects are specified in PRD §6.1.
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
}

/// Every `Config` field except `admin` (the signer) and bumps.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitConfigArgs {
    pub treasury: Pubkey,
    pub quote_mint: Pubkey,
    pub allowed_mints: [Pubkey; crate::constants::NUM_ALLOWED_MINTS],
    pub tiers: [u64; crate::constants::NUM_TIERS],
    pub windows: [u32; crate::constants::NUM_WINDOWS],
    pub pool_seed_ratio: u64,
    pub settler_tip_lamports: u64,
    pub max_entry_lamports: u64,
    pub rake_bps: u16,
    pub swap_fee_bps: u16,
}

pub fn handle_init_config(_ctx: Context<InitConfig>, _args: InitConfigArgs) -> Result<()> {
    Ok(())
}
