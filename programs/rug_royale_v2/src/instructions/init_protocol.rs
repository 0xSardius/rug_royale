use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;

use super::admin_checks::{check_protocol_args, ProtocolArgs};
use crate::constants::PROTOCOL_SEED;
use crate::errors::RugRoyaleV2Error;
use crate::events::ProtocolUpdated;
use crate::state::Protocol;

/// v2 PRD §6.1. Only the program's upgrade authority can initialize (H1).
#[derive(Accounts)]
pub struct InitProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [PROTOCOL_SEED],
        bump,
    )]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
        constraint = program_data.upgrade_authority_address == Some(admin.key())
            @ RugRoyaleV2Error::Unauthorized,
    )]
    pub program_data: Account<'info, ProgramData>,
    /// CHECK: validated in the handler (`InvalidTreasury`).
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_protocol(ctx: Context<InitProtocol>, args: ProtocolArgs) -> Result<()> {
    check_protocol_args(&args, &ctx.accounts.treasury)?;
    let p = &mut ctx.accounts.protocol;
    p.admin = ctx.accounts.admin.key();
    p.treasury = ctx.accounts.treasury.key();
    p.max_entry_lamports = args.max_entry_lamports;
    p.match_fee_lamports = args.match_fee_lamports;
    p.settler_tip_lamports = args.settler_tip_lamports;
    p.max_rake_bps = args.max_rake_bps;
    p.paused = args.paused;
    p.bump = ctx.bumps.protocol;
    emit_protocol(p);
    Ok(())
}

pub(crate) fn emit_protocol(p: &Protocol) {
    emit!(ProtocolUpdated {
        admin: p.admin,
        treasury: p.treasury,
        max_entry_lamports: p.max_entry_lamports,
        match_fee_lamports: p.match_fee_lamports,
        settler_tip_lamports: p.settler_tip_lamports,
        max_rake_bps: p.max_rake_bps,
        paused: p.paused,
    });
}
