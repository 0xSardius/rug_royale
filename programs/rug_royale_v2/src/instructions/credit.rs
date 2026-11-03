//! Lamport payouts from the program-owned Pot (G1), shared by cancel, settle and refund.
use anchor_lang::prelude::*;

use crate::errors::RugRoyaleV2Error;

/// Debits `amount` from `pot` and credits `to`, unless that would leave `to` below the
/// rent-exempt minimum for its size (e.g. a tiny refund to a wallet the player emptied),
/// which would fail the whole transaction and could strand funds. That credit goes to the
/// treasury instead, which `init_protocol`/`update_protocol` keep rent-exempt (v1 audit M1).
/// Returns true if the credit was redirected.
pub fn credit_or_redirect<'info>(
    pot: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    treasury: &AccountInfo<'info>,
    amount: u64,
    rent: &Rent,
) -> Result<bool> {
    if amount == 0 {
        return Ok(false);
    }
    let after = to
        .lamports()
        .checked_add(amount)
        .ok_or(RugRoyaleV2Error::MathOverflow)?;
    let redirect = after < rent.minimum_balance(to.data_len());
    pot.sub_lamports(amount)?;
    if redirect {
        treasury.add_lamports(amount)?;
    } else {
        to.add_lamports(amount)?;
    }
    Ok(redirect)
}
