//! PRD §7 valuation at settle. Pure, no pool mutation, order-independent (I6).
//! Mirrors `finalValue` / `duelResult` in packages/sdk/src/math.ts (I12).

use anchor_lang::prelude::*;

use crate::constants::{RESULT_CREATOR, RESULT_OPPONENT, RESULT_TIE};
use crate::errors::RugRoyaleError;
use crate::math::amm::{amount_out, net_of_fee};

/// `quote_vault + sell_out(coin_vault, end reserves)`, fee included, so the on-screen
/// "value if I sold now" equals what `settle` computes. Only the sell's `out` is used, so
/// the post-sell reserves are never computed and cannot overflow.
pub fn final_value(
    quote_vault: u64,
    coin_vault: u64,
    quote_reserve: u64,
    token_reserve: u64,
    fee_bps: u16,
) -> Result<u64> {
    let sold = if coin_vault == 0 {
        0
    } else {
        amount_out(
            net_of_fee(coin_vault, fee_bps)?,
            token_reserve,
            quote_reserve,
        )?
    };
    Ok(quote_vault
        .checked_add(sold)
        .ok_or(RugRoyaleError::MathOverflow)?)
}

/// `Duel.result`: creator if `final_a > final_b`, opponent if less, tie if equal.
pub fn duel_result(final_a: u64, final_b: u64) -> u8 {
    if final_a > final_b {
        RESULT_CREATOR
    } else if final_a < final_b {
        RESULT_OPPONENT
    } else {
        RESULT_TIE
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::amm::buy_out;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Vectors {
        valuations: Vec<ValuationCase>,
        results: Vec<ResultCase>,
    }

    #[derive(Deserialize)]
    struct ValuationCase {
        quote_vault: String,
        coin_vault: String,
        quote_reserve: String,
        token_reserve: String,
        fee_bps: u16,
        value: String,
    }

    #[derive(Deserialize)]
    struct ResultCase {
        final_a: String,
        final_b: String,
        result: u8,
    }

    fn n(s: &str) -> u64 {
        s.parse().expect("vector value fits u64")
    }

    fn vectors() -> Vectors {
        serde_json::from_str(include_str!("../../tests/vectors/math.json")).expect("valid vectors")
    }

    #[test]
    fn valuations_match_ts_vectors() {
        let v = vectors();
        assert!(!v.valuations.is_empty());
        for (i, c) in v.valuations.iter().enumerate() {
            let got = final_value(
                n(&c.quote_vault),
                n(&c.coin_vault),
                n(&c.quote_reserve),
                n(&c.token_reserve),
                c.fee_bps,
            )
            .unwrap_or_else(|e| panic!("case {i}: {e:?}"));
            assert_eq!(got, n(&c.value), "case {i}");
        }
    }

    #[test]
    fn results_match_ts_vectors() {
        let v = vectors();
        assert!(!v.results.is_empty());
        for (i, c) in v.results.iter().enumerate() {
            assert_eq!(
                duel_result(n(&c.final_a), n(&c.final_b)),
                c.result,
                "case {i}"
            );
        }
    }

    /// PRD §7 sanity check, fees off, seed 100/100, bankroll 100 each (6 decimals):
    /// A buys 10, then B buys 10. A's final is 101.80, B's is 100.00, so A wins.
    #[test]
    fn prd_example_fees_off() {
        const ONE: u64 = 1_000_000;
        let a = buy_out(10 * ONE, 100 * ONE, 100 * ONE, 0).unwrap();
        let b = buy_out(10 * ONE, a.quote_reserve, a.token_reserve, 0).unwrap();
        let (qr, tr) = (b.quote_reserve, b.token_reserve);
        let final_a = final_value(90 * ONE, a.out, qr, tr, 0).unwrap();
        let final_b = final_value(90 * ONE, b.out, qr, tr, 0).unwrap();
        assert_eq!(final_a, 101_803_278); // 101.80
        assert_eq!(final_b, 99_999_999); // 100.00 (rounds down to 99.999999 raw)
        assert_eq!(duel_result(final_a, final_b), RESULT_CREATOR);
    }

    /// I6: each player is valued alone against the same reserves, so order cannot matter.
    #[test]
    fn valuation_is_order_independent() {
        let (qr, tr) = (120_000_000, 83_333_334);
        let a1 = final_value(90_000_000, 9_090_909, qr, tr, 30).unwrap();
        let b1 = final_value(90_000_000, 7_575_757, qr, tr, 30).unwrap();
        let b2 = final_value(90_000_000, 7_575_757, qr, tr, 30).unwrap();
        let a2 = final_value(90_000_000, 9_090_909, qr, tr, 30).unwrap();
        assert_eq!((a1, b1), (a2, b2));
    }

    #[test]
    fn empty_coin_vault_is_quote_only() {
        assert_eq!(final_value(5, 0, 0, 0, 0).unwrap(), 5);
    }
}
