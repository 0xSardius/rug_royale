//! §7.2 Valuation at finalize: each seat valued alone against the same marks (no fee).
use anchor_lang::prelude::*;

use super::{overflow, pow10, to_u64};
use crate::constants::{RESULT_CREATOR, RESULT_OPPONENT, RESULT_TIE};

/// `cash + Σ qty[a] * mark[a] / 10^e[a]`, rounding each term down. Assets with qty 0 are
/// skipped, so their mark may be 0 (finalize only marks assets someone holds).
pub fn portfolio_value(cash: u64, qty: &[u64], marks: &[u64], exponents: &[u8]) -> Result<u64> {
    let mut v = cash as u128;
    for ((&q, &m), &e) in qty.iter().zip(marks).zip(exponents) {
        if q == 0 {
            continue;
        }
        let term = (q as u128).checked_mul(m as u128).ok_or_else(overflow)? / pow10(e)?;
        v = v.checked_add(term).ok_or_else(overflow)?;
    }
    to_u64(v)
}

pub fn match_result(v0: u64, v1: u64) -> u8 {
    if v0 > v1 {
        RESULT_CREATOR
    } else if v0 < v1 {
        RESULT_OPPONENT
    } else {
        RESULT_TIE
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::vectors::{load, n};

    #[test]
    fn valuations_match_ts_vectors() {
        let v = load();
        assert!(!v.valuations.is_empty());
        for (i, c) in v.valuations.iter().enumerate() {
            let qty: Vec<u64> = c.qty.iter().map(|s| n(s)).collect();
            let marks: Vec<u64> = c.marks.iter().map(|s| n(s)).collect();
            let got = portfolio_value(n(&c.cash), &qty, &marks, &c.exponents);
            if c.value == "overflow" {
                assert!(got.is_err(), "case {i}: expected MathOverflow");
            } else {
                assert_eq!(
                    got.unwrap_or_else(|e| panic!("case {i}: {e:?}")),
                    n(&c.value),
                    "case {i}"
                );
            }
        }
    }

    #[test]
    fn unheld_assets_ignore_their_mark() {
        assert_eq!(
            portfolio_value(5, &[0, 0], &[0, u64::MAX], &[8, 8]).unwrap(),
            5
        );
    }

    #[test]
    fn results() {
        assert_eq!(match_result(2, 1), RESULT_CREATOR);
        assert_eq!(match_result(1, 2), RESULT_OPPONENT);
        assert_eq!(match_result(7, 7), RESULT_TIE);
    }
}
