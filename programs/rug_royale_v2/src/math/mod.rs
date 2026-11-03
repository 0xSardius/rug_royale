//! Pure math (v2 PRD §7). u128 intermediates, round down (toward the protocol), checked ops
//! returning `RugRoyaleV2Error::MathOverflow`. Handlers call these and never inline math.
//! Every change here must be mirrored in packages/sdk/src/v2/math.ts (invariant I12).

pub mod payout;
pub mod trade;
pub mod valuation;

use crate::errors::RugRoyaleV2Error;
use anchor_lang::prelude::*;

pub(crate) fn pow10(e: u8) -> Result<u128> {
    10u128
        .checked_pow(e as u32)
        .ok_or_else(|| error!(RugRoyaleV2Error::MathOverflow))
}

pub(crate) fn to_u64(v: u128) -> Result<u64> {
    u64::try_from(v).map_err(|_| error!(RugRoyaleV2Error::MathOverflow))
}

pub(crate) fn overflow() -> Error {
    error!(RugRoyaleV2Error::MathOverflow)
}

#[cfg(test)]
pub(crate) mod vectors {
    use serde::Deserialize;

    #[derive(Deserialize)]
    pub struct Vectors {
        pub trades: Vec<TradeCase>,
        pub valuations: Vec<ValuationCase>,
        pub payouts: Vec<PayoutCase>,
    }

    #[derive(Deserialize)]
    pub struct TradeCase {
        pub side: String,
        pub amount: String,
        pub price: String,
        pub exponent: u8,
        pub fee_bps: u16,
        /// "overflow" when the program must return MathOverflow.
        pub out: String,
        pub fee: String,
    }

    #[derive(Deserialize)]
    pub struct ValuationCase {
        pub cash: String,
        pub qty: Vec<String>,
        pub marks: Vec<String>,
        pub exponents: Vec<u8>,
        pub value: String,
    }

    #[derive(Deserialize)]
    pub struct PayoutCase {
        pub entry: String,
        pub sponsored: String,
        pub match_fee: String,
        pub fee_share: String,
        pub settler_tip: String,
        pub rake_bps: u16,
        pub result: u8,
        pub pot: String,
        pub fee: String,
        pub rake: String,
        pub tip: String,
        pub prize: String,
        pub to_creator: String,
        pub to_opponent: String,
        pub to_treasury: String,
        pub to_settler: String,
    }

    pub fn load() -> Vectors {
        serde_json::from_str(include_str!("../../tests/vectors/math.json")).expect("valid vectors")
    }

    pub fn n(s: &str) -> u64 {
        s.parse().expect("vector value fits u64")
    }
}
