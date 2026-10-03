//! Seeds and fixed protocol constants (PRD §5, §6).

pub const CONFIG_SEED: &[u8] = b"config";
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";
pub const DUEL_SEED: &[u8] = b"duel";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POOL_SEED: &[u8] = b"pool";

pub const NUM_ALLOWED_MINTS: usize = 10;
pub const NUM_TIERS: usize = 3;
pub const NUM_WINDOWS: usize = 4;

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_RAKE_BPS: u16 = 1_000;
pub const MAX_SWAP_FEE_BPS: u16 = 1_000;

/// Delay between `join_duel` and the start of the trading window.
pub const START_DELAY_SECS: i64 = 60;
/// `join_deadline` must sit in `[now + MIN, now + MAX]`.
pub const MIN_JOIN_DEADLINE_SECS: i64 = 60;
pub const MAX_JOIN_DEADLINE_SECS: i64 = 86_400;

/// `Duel.result` values (G9).
pub const RESULT_PENDING: u8 = 0;
pub const RESULT_CREATOR: u8 = 1;
pub const RESULT_OPPONENT: u8 = 2;
pub const RESULT_TIE: u8 = 3;
