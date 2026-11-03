//! §7.3 Payout at settle. Parts always sum to `pot` exactly (I2).
use anchor_lang::prelude::*;

use super::overflow;
use crate::constants::{BPS_DENOMINATOR, RESULT_CREATOR, RESULT_PENDING, RESULT_TIE};
use crate::errors::RugRoyaleV2Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Payout {
    pub pot: u64,
    /// Match fee, reimbursing the joiner's delegation fee (D1, Q1).
    pub fee: u64,
    pub rake: u64,
    pub tip: u64,
    pub prize: u64,
    pub to_creator: u64,
    pub to_opponent: u64,
    pub to_treasury: u64,
    pub to_settler: u64,
}

/// V7 / Q1: each player's match-fee deposit; only free duels (entry 0) deposit.
pub fn fee_share(entry: u64, match_fee: u64) -> u64 {
    if entry == 0 {
        match_fee / 2 + match_fee % 2
    } else {
        0
    }
}

pub fn payout(
    entry: u64,
    sponsored: u64,
    match_fee: u64,
    fee_share: u64,
    settler_tip: u64,
    rake_bps: u16,
    result: u8,
) -> Result<Payout> {
    require!(
        result != RESULT_PENDING,
        RugRoyaleV2Error::MatchNotFinalized
    );
    let pot = entry
        .checked_mul(2)
        .and_then(|v| v.checked_add(sponsored))
        .and_then(|v| v.checked_add(fee_share.checked_mul(2)?))
        .ok_or_else(overflow)?;
    let fee = match_fee.min(pot);
    let rest = pot - fee;

    if result == RESULT_TIE {
        let tip = settler_tip.min(sponsored).min(rest);
        let share = rest - tip;
        return Ok(Payout {
            pot,
            fee,
            rake: 0,
            tip,
            prize: 0,
            to_creator: share / 2 + share % 2,
            to_opponent: share / 2 + fee,
            to_treasury: 0,
            to_settler: tip,
        });
    }

    let rake = if entry == 0 {
        0
    } else {
        ((rest as u128) * (rake_bps as u128) / BPS_DENOMINATOR as u128) as u64 // <= rest
    };
    let tip = settler_tip.min(rest - rake);
    let prize = rest - rake - tip;
    let creator_wins = result == RESULT_CREATOR;
    Ok(Payout {
        pot,
        fee,
        rake,
        tip,
        prize,
        to_creator: if creator_wins { prize } else { 0 },
        to_opponent: fee
            .checked_add(if creator_wins { 0 } else { prize })
            .ok_or_else(overflow)?,
        to_treasury: rake,
        to_settler: tip,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::RESULT_OPPONENT;
    use crate::math::vectors::{load, n};

    fn total(p: &Payout) -> u64 {
        p.to_creator + p.to_opponent + p.to_treasury + p.to_settler
    }

    #[test]
    fn payouts_match_ts_vectors() {
        let v = load();
        assert!(!v.payouts.is_empty());
        for (i, c) in v.payouts.iter().enumerate() {
            let got = payout(
                n(&c.entry),
                n(&c.sponsored),
                n(&c.match_fee),
                n(&c.fee_share),
                n(&c.settler_tip),
                c.rake_bps,
                c.result,
            )
            .unwrap_or_else(|e| panic!("case {i}: {e:?}"));
            let want = Payout {
                pot: n(&c.pot),
                fee: n(&c.fee),
                rake: n(&c.rake),
                tip: n(&c.tip),
                prize: n(&c.prize),
                to_creator: n(&c.to_creator),
                to_opponent: n(&c.to_opponent),
                to_treasury: n(&c.to_treasury),
                to_settler: n(&c.to_settler),
            };
            assert_eq!(got, want, "case {i}");
            assert_eq!(total(&got), got.pot, "case {i}: payouts != pot (I2)");
        }
    }

    /// Q1: a free unsponsored duel; both deposits reimburse the joiner, the winner gets ~nothing.
    #[test]
    fn free_duel_fee_goes_to_joiner() {
        let f = 3_010_000;
        let h = fee_share(0, f);
        assert_eq!(h, 1_505_000);
        let p = payout(0, 0, f, h, 1_000_000, 500, RESULT_CREATOR).unwrap();
        assert_eq!((p.fee, p.rake, p.to_opponent), (f, 0, f));
        assert_eq!(total(&p), p.pot);
    }

    /// Q1: a sponsored freeroll keeps the sponsor's prize whole (minus the tip).
    #[test]
    fn sponsored_freeroll_prize_is_whole() {
        let f = 3_010_001; // odd fee: deposits overpay by 1 lamport, which joins the prize
        let h = fee_share(0, f);
        let p = payout(0, 20_000_000, f, h, 1_000_000, 500, RESULT_OPPONENT).unwrap();
        assert_eq!(p.prize, 20_000_000 + 1 - 1_000_000);
        assert_eq!(p.to_opponent, f + p.prize);
        assert_eq!(total(&p), p.pot);
    }

    #[test]
    fn pending_result_is_rejected() {
        assert!(payout(1, 0, 0, 0, 0, 0, RESULT_PENDING).is_err());
    }
}
