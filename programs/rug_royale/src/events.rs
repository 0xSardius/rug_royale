//! PRD §6 / §8. Events are notifications only; clients read state from accounts.
use anchor_lang::prelude::*;

use crate::state::Side;

#[event]
pub struct DuelCreated {
    pub duel: Pubkey,
    pub creator: Pubkey,
    pub coin: Pubkey,
    pub tier: u8,
    pub window_secs: u32,
    pub entry_lamports: u64,
    pub join_deadline: i64,
}

#[event]
pub struct PrizeSponsored {
    pub duel: Pubkey,
    pub sponsor: Pubkey,
    pub amount: u64,
    pub total: u64,
}

#[event]
pub struct DuelJoined {
    pub duel: Pubkey,
    pub opponent: Pubkey,
    pub start_ts: i64,
    pub end_ts: i64,
}

#[event]
pub struct SwapExecuted {
    pub duel: Pubkey,
    pub player: Pubkey,
    pub side: Side,
    pub amount_in: u64,
    pub amount_out: u64,
    pub quote_reserve: u64,
    pub token_reserve: u64,
}

#[event]
pub struct DuelSettled {
    pub duel: Pubkey,
    pub result: u8,
    pub final_a: u64,
    pub final_b: u64,
    pub prize: u64,
    pub rake: u64,
    pub tip: u64,
}

#[event]
pub struct DuelCancelled {
    pub duel: Pubkey,
    pub refunded_entry: u64,
    pub refunded_sponsored: u64,
}

#[event]
pub struct DuelClosed {
    pub duel: Pubkey,
}
