//! Seeds and fixed protocol constants (v2 PRD §5).

pub const PROTOCOL_SEED: &[u8] = b"protocol";
pub const ARENA_SEED: &[u8] = b"arena";
pub const PLAYER_SEED: &[u8] = b"player";
pub const POT_SEED: &[u8] = b"pot";
pub const MATCH_SEED: &[u8] = b"match";

/// MagicBlock Pricing Oracle (spike 01). Feed PDA: ["price_feed", "pyth-lazer", <lazer id>].
pub const ORACLE_PROGRAM_ID: anchor_lang::prelude::Pubkey =
    anchor_lang::pubkey!("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");

pub const MAX_ASSETS: usize = 10;
pub const NUM_WINDOWS: usize = 4;
pub const NUM_SEATS: usize = 2;

pub const BPS_DENOMINATOR: u64 = 10_000;
/// Hard cap on any fee or rake in bps (10%).
pub const MAX_FEE_BPS: u16 = 1_000;
/// Largest Pyth exponent magnitude an arena asset may use (keeps 10^e in u128 math tiny).
pub const MAX_EXPONENT: u8 = 18;

pub const MIN_START_DELAY_SECS: u16 = 5;
pub const MAX_START_DELAY_SECS: u16 = 120;
/// `join_deadline` must sit in `[now + MIN, now + MAX]`.
pub const MIN_JOIN_DEADLINE_SECS: i64 = 60;
pub const MAX_JOIN_DEADLINE_SECS: i64 = 86_400;
/// Final marks must have `publish_time` in `[end_ts, end_ts + MARK_TOLERANCE_S]` (V8).
pub const MARK_TOLERANCE_S: i64 = 5;
/// `refund_stale` opens this long after `end_ts`.
pub const STALE_AFTER_SECS: i64 = 86_400;

/// v1 audit L4: settler tip cap (0.01 SOL).
pub const MAX_SETTLER_TIP_LAMPORTS: u64 = 10_000_000;
/// v1 audit L2: minimum first sponsorship (0.01 SOL).
pub const MIN_SPONSOR_LAMPORTS: u64 = 10_000_000;

/// Cash is micro-USD; quantities are 1e-6 token units.
pub const USD_DECIMALS: u32 = 6;
pub const QTY_DECIMALS: u32 = 6;

/// `Match.result` values (G9).
pub const RESULT_PENDING: u8 = 0;
pub const RESULT_CREATOR: u8 = 1;
pub const RESULT_OPPONENT: u8 = 2;
pub const RESULT_TIE: u8 = 3;
