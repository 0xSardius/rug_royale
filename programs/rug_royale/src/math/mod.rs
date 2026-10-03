//! Pure math (PRD §7). u128 intermediates, round down, checked ops returning
//! `RugRoyaleError::MathOverflow`. Handlers call these; they never inline math.
//! Every change here must be mirrored in packages/sdk/src/math.ts (invariant I12).

pub mod amm;
pub mod payout;
pub mod valuation;
