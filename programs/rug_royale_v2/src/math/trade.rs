//! §7.1 Trade at the live oracle price. `exponent` is |e| from the arena (V3); the real price
//! is `price * 10^-exponent`. Cash is micro-USD, quantity is 1e-6 token units.
use anchor_lang::prelude::*;

use super::{overflow, pow10, to_u64};
use crate::constants::BPS_DENOMINATOR;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuyQuote {
    pub fee: u64,
    /// 0 means the handler rejects with ZeroOutput.
    pub qty_out: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SellQuote {
    pub gross: u64,
    pub fee: u64,
    /// 0 means the handler rejects with ZeroOutput.
    pub cash_out: u64,
}

/// Buy: `amount` micro-USD in. `price` must be > 0 (the handler checks PriceInvalid first).
pub fn buy_quote(amount: u64, price: u64, exponent: u8, fee_bps: u16) -> Result<BuyQuote> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or_else(overflow)?
        / BPS_DENOMINATOR as u128;
    let net = (amount as u128).checked_sub(fee).ok_or_else(overflow)?;
    let qty_out = net
        .checked_mul(pow10(exponent)?)
        .ok_or_else(overflow)?
        .checked_div(price as u128)
        .ok_or_else(overflow)?;
    Ok(BuyQuote {
        fee: to_u64(fee)?,
        qty_out: to_u64(qty_out)?,
    })
}

/// Sell: `amount` quantity in; cash out after the fee.
pub fn sell_quote(amount: u64, price: u64, exponent: u8, fee_bps: u16) -> Result<SellQuote> {
    let gross = (amount as u128)
        .checked_mul(price as u128)
        .ok_or_else(overflow)?
        / pow10(exponent)?;
    let fee = gross.checked_mul(fee_bps as u128).ok_or_else(overflow)? / BPS_DENOMINATOR as u128;
    let cash_out = gross.checked_sub(fee).ok_or_else(overflow)?;
    Ok(SellQuote {
        gross: to_u64(gross)?,
        fee: to_u64(fee)?,
        cash_out: to_u64(cash_out)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::vectors::{load, n};

    #[test]
    fn trades_match_ts_vectors() {
        let v = load();
        assert!(!v.trades.is_empty());
        for (i, c) in v.trades.iter().enumerate() {
            let (amount, price) = (n(&c.amount), n(&c.price));
            let got = match c.side.as_str() {
                "buy" => {
                    buy_quote(amount, price, c.exponent, c.fee_bps).map(|q| (q.qty_out, q.fee))
                }
                _ => sell_quote(amount, price, c.exponent, c.fee_bps).map(|q| (q.cash_out, q.fee)),
            };
            if c.out == "overflow" {
                assert!(got.is_err(), "case {i}: expected MathOverflow");
            } else {
                let got = got.unwrap_or_else(|e| panic!("case {i}: {e:?}"));
                assert_eq!(got, (n(&c.out), n(&c.fee)), "case {i}");
            }
        }
    }

    /// Spike 01 prices: $1,000 of SOL at $94.36 (e=8) and of BONK at $0.00000292 (e=10).
    #[test]
    fn real_world_prices() {
        let sol = buy_quote(1_000_000_000, 9_436_170_000, 8, 10).unwrap();
        assert_eq!(sol.fee, 1_000_000);
        assert_eq!(sol.qty_out, 10_586_922); // 10.586922 SOL
        let bonk = buy_quote(1_000_000_000, 29_220, 10, 0).unwrap();
        assert_eq!(bonk.qty_out, 342_231_348_391_512); // 342,231,348.39 BONK
        let back = sell_quote(bonk.qty_out, 29_220, 10, 0).unwrap();
        assert!(back.cash_out <= 1_000_000_000 && back.cash_out >= 999_999_999);
    }
}
