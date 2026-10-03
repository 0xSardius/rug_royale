//! Rug Royale: 1v1 trading duels. Source of truth: docs/prd.md.
//! Handlers here are thin wrappers; logic lives in `instructions/`, math in `math/`.

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE");

#[program]
pub mod rug_royale {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
        instructions::init_config::handle_init_config(ctx, args)
    }

    pub fn create_duel(
        ctx: Context<CreateDuel>,
        nonce: u64,
        tier: u8,
        window_secs: u32,
        entry_lamports: u64,
        allowed_opponent: Pubkey,
        join_deadline: i64,
    ) -> Result<()> {
        instructions::create_duel::handle_create_duel(
            ctx,
            nonce,
            tier,
            window_secs,
            entry_lamports,
            allowed_opponent,
            join_deadline,
        )
    }

    pub fn sponsor_prize(ctx: Context<SponsorPrize>, amount: u64) -> Result<()> {
        instructions::sponsor_prize::handle_sponsor_prize(ctx, amount)
    }

    pub fn join_duel(ctx: Context<JoinDuel>) -> Result<()> {
        instructions::join_duel::handle_join_duel(ctx)
    }

    pub fn swap(ctx: Context<Swap>, side: Side, amount_in: u64, min_out: u64) -> Result<()> {
        instructions::swap::handle_swap(ctx, side, amount_in, min_out)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        instructions::settle::handle_settle(ctx)
    }

    pub fn cancel_duel(ctx: Context<CancelDuel>) -> Result<()> {
        instructions::cancel_duel::handle_cancel_duel(ctx)
    }

    pub fn close_duel(ctx: Context<CloseDuel>) -> Result<()> {
        instructions::close_duel::handle_close_duel(ctx)
    }
}
