use anchor_lang::prelude::*;

use super::admin_checks::{check_arena_args, write_arena, ArenaArgs};
use crate::constants::{ARENA_SEED, PROTOCOL_SEED};
use crate::errors::RugRoyaleV2Error;
use crate::events::ArenaUpdated;
use crate::state::{Arena, Protocol};

/// v2 PRD §6.1.
#[derive(Accounts)]
#[instruction(arena_id: u16)]
pub struct CreateArena<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Arena::INIT_SPACE,
        seeds = [ARENA_SEED, &arena_id.to_le_bytes()],
        bump,
    )]
    pub arena: Box<Account<'info, Arena>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_arena(
    ctx: Context<CreateArena>,
    arena_id: u16,
    args: ArenaArgs,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.admin.key(),
        ctx.accounts.protocol.admin,
        RugRoyaleV2Error::Unauthorized
    );
    check_arena_args(&args, &ctx.accounts.protocol, None)?;
    write_arena(&mut ctx.accounts.arena, arena_id, &args, ctx.bumps.arena);
    emit!(ArenaUpdated { arena_id });
    Ok(())
}
