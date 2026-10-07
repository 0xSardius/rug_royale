//! PRD §7 swap math: constant product, fee stays in the pool (G4).
//! Mirrors `buyOut` / `sellOut` in packages/sdk/src/math.ts (I12).
//!
//! These functions only compute. The handler enforces `ZeroOutput`, `SlippageExceeded`,
//! and `k_after >= k_before`, because `settle` also values positions with `sell_out`
//! and a zero coin balance must value to zero there, not fail.

use anchor_lang::prelude::*;

use crate::errors::RugRoyaleError;
use crate::state::Side;

pub const BPS: u128 = 10_000;

/// Result of a swap: tokens out (coin for a buy, quote for a sell) and the reserves after.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SwapQuote {
    pub out: u64,
    pub quote_reserve: u64,
    pub token_reserve: u64,
}

/// `amount_in * (10_000 - fee_bps) / 10_000`, rounded down.
pub fn net_of_fee(amount_in: u64, fee_bps: u16) -> Result<u128> {
    let keep = BPS
        .checked_sub(fee_bps as u128)
        .ok_or(RugRoyaleError::MathOverflow)?;
    Ok((amount_in as u128)
        .checked_mul(keep)
        .ok_or(RugRoyaleError::MathOverflow)?
        / BPS)
}

/// `reserve_out * in_net / (reserve_in + in_net)`, rounded down. Used by valuation too.
pub fn amount_out(in_net: u128, reserve_in: u64, reserve_out: u64) -> Result<u64> {
    let num = (reserve_out as u128)
        .checked_mul(in_net)
        .ok_or(RugRoyaleError::MathOverflow)?;
    let den = (reserve_in as u128)
        .checked_add(in_net)
        .ok_or(RugRoyaleError::MathOverflow)?;
    let out = num.checked_div(den).ok_or(RugRoyaleError::MathOverflow)?;
    // out < reserve_out whenever den > 0, so this never fails in practice.
    Ok(u64::try_from(out).map_err(|_| RugRoyaleError::MathOverflow)?)
}

/// Buy: quote in, coin out. `quote_reserve += amount_in; token_reserve -= out`.
pub fn buy_out(
    amount_in: u64,
    quote_reserve: u64,
    token_reserve: u64,
    fee_bps: u16,
) -> Result<SwapQuote> {
    let in_net = net_of_fee(amount_in, fee_bps)?;
    let out = amount_out(in_net, quote_reserve, token_reserve)?;
    Ok(SwapQuote {
        out,
        quote_reserve: quote_reserve
            .checked_add(amount_in)
            .ok_or(RugRoyaleError::MathOverflow)?,
        token_reserve: token_reserve
            .checked_sub(out)
            .ok_or(RugRoyaleError::MathOverflow)?,
    })
}

/// Sell: coin in, quote out. `token_reserve += amount_in; quote_reserve -= out`.
pub fn sell_out(
    amount_in: u64,
    quote_reserve: u64,
    token_reserve: u64,
    fee_bps: u16,
) -> Result<SwapQuote> {
    let in_net = net_of_fee(amount_in, fee_bps)?;
    let out = amount_out(in_net, token_reserve, quote_reserve)?;
    Ok(SwapQuote {
        out,
        quote_reserve: quote_reserve
            .checked_sub(out)
            .ok_or(RugRoyaleError::MathOverflow)?,
        token_reserve: token_reserve
            .checked_add(amount_in)
            .ok_or(RugRoyaleError::MathOverflow)?,
    })
}

pub fn swap_quote(
    side: Side,
    amount_in: u64,
    quote_reserve: u64,
    token_reserve: u64,
    fee_bps: u16,
) -> Result<SwapQuote> {
    match side {
        Side::Buy => buy_out(amount_in, quote_reserve, token_reserve, fee_bps),
        Side::Sell => sell_out(amount_in, quote_reserve, token_reserve, fee_bps),
    }
}

/// `quote_reserve * token_reserve` in u128 (cannot overflow: two u64s).
pub fn k(quote_reserve: u64, token_reserve: u64) -> u128 {
    (quote_reserve as u128) * (token_reserve as u128)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Vectors {
        swaps: Vec<SwapCase>,
    }

    #[derive(Deserialize)]
    struct SwapCase {
        side: String,
        amount_in: String,
        quote_reserve: String,
        token_reserve: String,
        fee_bps: u16,
        out: String,
        quote_reserve_after: String,
        token_reserve_after: String,
    }

    fn n(s: &str) -> u64 {
        s.parse().expect("vector value fits u64")
    }

    #[test]
    fn swaps_match_ts_vectors() {
        let v: Vectors = serde_json::from_str(include_str!("../../tests/vectors/math.json"))
            .expect("valid vectors");
        assert!(!v.swaps.is_empty());
        for (i, c) in v.swaps.iter().enumerate() {
            let side = match c.side.as_str() {
                "buy" => Side::Buy,
                "sell" => Side::Sell,
                other => panic!("case {i}: unknown side {other}"),
            };
            let q = swap_quote(
                side,
                n(&c.amount_in),
                n(&c.quote_reserve),
                n(&c.token_reserve),
                c.fee_bps,
            )
            .unwrap_or_else(|e| panic!("case {i}: {e:?}"));
            let want = SwapQuote {
                out: n(&c.out),
                quote_reserve: n(&c.quote_reserve_after),
                token_reserve: n(&c.token_reserve_after),
            };
            assert_eq!(q, want, "case {i}");
            assert!(
                k(q.quote_reserve, q.token_reserve) >= k(n(&c.quote_reserve), n(&c.token_reserve)),
                "case {i}: k decreased"
            );
        }
    }

    /// PRD §7 sanity check, fees off, seed 100/100 (6 decimals): A buys 10, then B buys 10.
    #[test]
    fn prd_example_fees_off() {
        const ONE: u64 = 1_000_000;
        let a = buy_out(10 * ONE, 100 * ONE, 100 * ONE, 0).unwrap();
        assert_eq!(a.out, 9_090_909); // 9.091 coin
        let b = buy_out(10 * ONE, a.quote_reserve, a.token_reserve, 0).unwrap();
        assert_eq!(b.out, 7_575_757); // 7.576 coin
    }

    #[test]
    fn fee_is_taken_from_input() {
        assert_eq!(net_of_fee(10_000, 30).unwrap(), 9_970);
        assert_eq!(net_of_fee(1, 30).unwrap(), 0);
        assert!(net_of_fee(1, 10_001).is_err());
    }

    #[test]
    fn tiny_input_gives_zero_out() {
        let q = buy_out(1, 1_000_000, 1, 0).unwrap();
        assert_eq!(q.out, 0);
    }

    #[test]
    fn reserve_overflow_is_an_error() {
        assert!(buy_out(u64::MAX, 1, 1_000, 0).is_err());
    }
}
