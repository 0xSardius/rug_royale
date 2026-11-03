//! Rug Royale v2: 1v1 paper-trading duels on live prices. Source of truth: the v2 PRD
//! (team-internal). Thin handler wrappers; logic lives in `instructions/<name>.rs`.
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::admin_checks::{ArenaArgs, ProtocolArgs};
use instructions::create_match::CreateMatchArgs;
use instructions::*;

declare_id!("2hcR5rib7mNkcFHnPEfjhH1yJdNsPmK6SVkU3dDjD9Cr");

/// `#[ephemeral]` injects `process_undelegation`, the callback MagicBlock's Delegation
/// Program invokes to hand `Match` back to this program after `finalize_match` commits and
/// undelegates it. It must sit before `#[program]`.
#[ephemeral]
#[program]
pub mod rug_royale_v2 {
    use super::*;

    // Admin (§6.1)
    pub fn init_protocol(ctx: Context<InitProtocol>, args: ProtocolArgs) -> Result<()> {
        instructions::init_protocol::handle_init_protocol(ctx, args)
    }

    pub fn update_protocol(
        ctx: Context<UpdateProtocol>,
        new_admin: Pubkey,
        args: ProtocolArgs,
    ) -> Result<()> {
        instructions::update_protocol::handle_update_protocol(ctx, new_admin, args)
    }

    pub fn create_arena(ctx: Context<CreateArena>, arena_id: u16, args: ArenaArgs) -> Result<()> {
        instructions::create_arena::handle_create_arena(ctx, arena_id, args)
    }

    pub fn update_arena(ctx: Context<UpdateArena>, args: ArenaArgs) -> Result<()> {
        instructions::update_arena::handle_update_arena(ctx, args)
    }

    // Contest (§6.2)
    pub fn create_match(
        ctx: Context<CreateMatch>,
        arena_id: u16,
        args: CreateMatchArgs,
    ) -> Result<()> {
        instructions::create_match::handle_create_match(ctx, arena_id, args)
    }

    pub fn sponsor_match(ctx: Context<SponsorMatch>, amount: u64) -> Result<()> {
        instructions::sponsor_match::handle_sponsor_match(ctx, amount)
    }

    pub fn join_match(ctx: Context<JoinMatch>, session_key: Pubkey) -> Result<()> {
        instructions::join_match::handle_join_match(ctx, session_key)
    }

    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        instructions::cancel_match::handle_cancel_match(ctx)
    }

    pub fn delegate_match(ctx: Context<DelegateMatch>) -> Result<()> {
        instructions::delegate_match::handle_delegate_match(ctx)
    }
}
