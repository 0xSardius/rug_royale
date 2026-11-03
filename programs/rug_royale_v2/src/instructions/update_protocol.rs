use anchor_lang::prelude::*;

use super::admin_checks::{check_protocol_args, ProtocolArgs};
use super::init_protocol::emit_protocol;
use crate::constants::PROTOCOL_SEED;
use crate::errors::RugRoyaleV2Error;
use crate::state::Protocol;

/// v2 PRD §6.1. `new_admin` rotates the admin (e.g. dev key -> Squads vault); it must not be
/// `Pubkey::default()`, which nobody can sign for (`Unauthorized`).
#[derive(Accounts)]
pub struct UpdateProtocol<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    /// CHECK: validated in the handler (`InvalidTreasury`).
    pub treasury: UncheckedAccount<'info>,
}

pub fn handle_update_protocol(
    ctx: Context<UpdateProtocol>,
    new_admin: Pubkey,
    args: ProtocolArgs,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.admin.key(),
        ctx.accounts.protocol.admin,
        RugRoyaleV2Error::Unauthorized
    );
    require!(
        new_admin != Pubkey::default(),
        RugRoyaleV2Error::Unauthorized
    );
    check_protocol_args(&args, &ctx.accounts.treasury)?;
    let p = &mut ctx.accounts.protocol;
    p.admin = new_admin;
    p.treasury = ctx.accounts.treasury.key();
    p.max_entry_lamports = args.max_entry_lamports;
    p.match_fee_lamports = args.match_fee_lamports;
    p.settler_tip_lamports = args.settler_tip_lamports;
    p.max_rake_bps = args.max_rake_bps;
    p.paused = args.paused;
    emit_protocol(p);
    Ok(())
}
