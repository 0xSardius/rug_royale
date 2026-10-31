use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;
use anchor_spl::token_2022::spl_token_2022::{extension::StateWithExtensions, state::Mint};

use crate::constants::*;
use crate::errors::RugRoyaleError;
use crate::state::Config;

/// PRD §6.1. Only the program's upgrade authority can initialize Config, so nobody can
/// front-run the first `init_config` after a deploy.
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
    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
        constraint = program_data.upgrade_authority_address == Some(admin.key())
            @ RugRoyaleError::Unauthorized,
    )]
    pub program_data: Account<'info, ProgramData>,
    /// CHECK: validated in the handler (`InvalidTreasury`).
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: validated in the handler (`InvalidMintAccount`).
    pub quote_mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: the 10 allowed coin mints, in Config.allowed_mints order.
}

/// The numeric `Config` fields. `treasury`, `quote_mint` and `allowed_mints` come from accounts.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitConfigArgs {
    pub tiers: [u64; NUM_TIERS],
    pub windows: [u32; NUM_WINDOWS],
    pub pool_seed_ratio: u64,
    pub settler_tip_lamports: u64,
    pub max_entry_lamports: u64,
    pub rake_bps: u16,
    pub swap_fee_bps: u16,
}

pub fn handle_init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
    // PRD §6.1 check order (`Unauthorized` already ran as an account constraint).
    require!(args.rake_bps <= MAX_RAKE_BPS, RugRoyaleError::RakeTooHigh);
    require!(args.swap_fee_bps <= MAX_SWAP_FEE_BPS, RugRoyaleError::FeeTooHigh);
    require!(
        args.windows[0] > 0 && args.windows.windows(2).all(|w| w[0] < w[1]),
        RugRoyaleError::InvalidWindowSet
    );
    require!(args.tiers.iter().all(|&t| t > 0), RugRoyaleError::InvalidTierSet);

    let quote_mint = ctx.accounts.quote_mint.key();
    let coin_infos = ctx.remaining_accounts;
    require!(
        coin_infos.len() == NUM_ALLOWED_MINTS,
        RugRoyaleError::InvalidMintList
    );
    let mut allowed_mints = [Pubkey::default(); NUM_ALLOWED_MINTS];
    for (slot, info) in allowed_mints.iter_mut().zip(coin_infos) {
        *slot = info.key();
    }
    require!(
        allowed_mints.iter().enumerate().all(|(i, m)| *m != Pubkey::default()
            && *m != quote_mint
            && !allowed_mints[..i].contains(m)),
        RugRoyaleError::InvalidMintList
    );
    require!(args.pool_seed_ratio >= 1, RugRoyaleError::InvalidSeedRatio);

    let treasury = &ctx.accounts.treasury;
    require!(
        treasury.owner == &System::id()
            && !treasury.executable
            && treasury.lamports() >= Rent::get()?.minimum_balance(0),
        RugRoyaleError::InvalidTreasury
    );
    require!(
        args.settler_tip_lamports <= MAX_SETTLER_TIP_LAMPORTS,
        RugRoyaleError::TipTooHigh
    );

    let (mint_authority, mint_authority_bump) =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], ctx.program_id);
    require!(
        is_valid_demo_mint(&ctx.accounts.quote_mint.to_account_info(), &mint_authority)
            && coin_infos.iter().all(|m| is_valid_demo_mint(m, &mint_authority)),
        RugRoyaleError::InvalidMintAccount
    );

    ctx.accounts.config.set_inner(Config {
        admin: ctx.accounts.admin.key(),
        treasury: treasury.key(),
        quote_mint,
        allowed_mints,
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

/// Token-2022, no extensions (exactly the base length), initialized, no freeze authority,
/// and minted only by the program's `MintAuthority` PDA (G3, G11).
fn is_valid_demo_mint(info: &AccountInfo, mint_authority: &Pubkey) -> bool {
    if info.owner != &anchor_spl::token_2022::ID || info.data_len() != MINT_BASE_LEN {
        return false;
    }
    let Ok(data) = info.try_borrow_data() else {
        return false;
    };
    let Ok(mint) = StateWithExtensions::<Mint>::unpack(&data) else {
        return false;
    };
    mint.base.is_initialized
        && mint.base.freeze_authority.is_none()
        && mint.base.mint_authority == Some(*mint_authority).into()
}
