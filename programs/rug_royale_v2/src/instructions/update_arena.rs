use anchor_lang::prelude::*;

use super::admin_checks::{check_arena_args, write_arena, ArenaArgs};
use crate::constants::{ARENA_SEED, PROTOCOL_SEED};
use crate::errors::RugRoyaleV2Error;
use crate::events::ArenaUpdated;
use crate::state::{Arena, Protocol};

/// v2 PRD §6.1. Existing asset indices keep their feed, lazer id and exponent; assets can be
/// disabled and new indices appended.
#[derive(Accounts)]
pub struct UpdateArena<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [ARENA_SEED, &arena.arena_id.to_le_bytes()], bump = arena.bump)]
    pub arena: Box<Account<'info, Arena>>,
}

pub fn handle_update_arena(ctx: Context<UpdateArena>, args: ArenaArgs) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.admin.key(),
        ctx.accounts.protocol.admin,
        RugRoyaleV2Error::Unauthorized
    );
    check_arena_args(&args, &ctx.accounts.protocol, Some(&ctx.accounts.arena))?;
    let (id, bump) = (ctx.accounts.arena.arena_id, ctx.accounts.arena.bump);
    write_arena(&mut ctx.accounts.arena, id, &args, bump);
    emit!(ArenaUpdated { arena_id: id });
    Ok(())
}
