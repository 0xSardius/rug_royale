//! PRD §7 payout. The sum of all transfers equals `pot` exactly (I2).
//! Mirrors `payout` in packages/sdk/src/math.ts (I12).

use anchor_lang::prelude::*;

use crate::constants::{RESULT_CREATOR, RESULT_OPPONENT, RESULT_TIE};
use crate::errors::RugRoyaleError;
use crate::math::amm::BPS;

/// Lamports owed out of escrow at settle. `prize` is 0 on a tie.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Payout {
    pub pot: u64,
    pub rake: u64,
    pub tip: u64,
    pub prize: u64,
    pub to_creator: u64,
    pub to_opponent: u64,
    pub to_treasury: u64,
    pub to_settler: u64,
}

/// Winner: rake (0 when entry is 0), then tip from what remains, rest to the winner.
/// Tie: entries back in full, no rake, tip from sponsored only, sponsored remainder split
/// with the odd lamport to the creator (G8, G15).
///
/// `result` must be `RESULT_CREATOR`, `RESULT_OPPONENT`, or `RESULT_TIE` (from
/// `valuation::duel_result`); anything else returns `MathOverflow`.
pub fn payout(
    entry_lamports: u64,
    sponsored_lamports: u64,
    settler_tip_lamports: u64,
    rake_bps: u16,
    result: u8,
) -> Result<Payout> {
    let e = entry_lamports;
    let s = sponsored_lamports;
    let pot = e
        .checked_mul(2)
        .and_then(|x| x.checked_add(s))
        .ok_or(RugRoyaleError::MathOverflow)?;

    if result == RESULT_TIE {
        let tip = settler_tip_lamports.min(s);
        let rest = s - tip; // tip <= s
        let half = rest / 2;
        return Ok(Payout {
            pot,
            rake: 0,
            tip,
            prize: 0,
            to_creator: e
                .checked_add(half + rest % 2)
                .ok_or(RugRoyaleError::MathOverflow)?,
            to_opponent: e.checked_add(half).ok_or(RugRoyaleError::MathOverflow)?,
            to_treasury: 0,
            to_settler: tip,
        });
    }

    let (to_creator_wins, to_opponent_wins) = match result {
        RESULT_CREATOR => (true, false),
        RESULT_OPPONENT => (false, true),
        _ => return err!(RugRoyaleError::MathOverflow),
    };

    let rake = if e == 0 {
        0
    } else {
        // rake_bps <= 10_000 keeps this <= pot, so it fits in u64.
        u64::try_from(
            (pot as u128)
                .checked_mul(rake_bps as u128)
                .ok_or(RugRoyaleError::MathOverflow)?
                / BPS,
        )
        .map_err(|_| RugRoyaleError::MathOverflow)?
    };
    let after_rake = pot.checked_sub(rake).ok_or(RugRoyaleError::MathOverflow)?;
    let tip = settler_tip_lamports.min(after_rake);
    let prize = after_rake - tip; // tip <= after_rake

    Ok(Payout {
        pot,
        rake,
        tip,
        prize,
        to_creator: if to_creator_wins { prize } else { 0 },
        to_opponent: if to_opponent_wins { prize } else { 0 },
        to_treasury: rake,
        to_settler: tip,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Vectors {
        payouts: Vec<PayoutCase>,
    }

    #[derive(Deserialize)]
    struct PayoutCase {
        entry_lamports: String,
        sponsored_lamports: String,
        settler_tip_lamports: String,
        rake_bps: u16,
        result: u8,
        pot: String,
        rake: String,
        tip: String,
        prize: String,
        to_creator: String,
        to_opponent: String,
        to_treasury: String,
        to_settler: String,
    }

    fn n(s: &str) -> u64 {
        s.parse().expect("vector value fits u64")
    }

    fn total(p: &Payout) -> u64 {
        p.to_creator + p.to_opponent + p.to_treasury + p.to_settler
    }

    #[test]
    fn payouts_match_ts_vectors() {
        let v: Vectors = serde_json::from_str(include_str!("../../tests/vectors/math.json"))
            .expect("valid vectors");
        assert!(!v.payouts.is_empty());
        for (i, c) in v.payouts.iter().enumerate() {
            let got = payout(
                n(&c.entry_lamports),
                n(&c.sponsored_lamports),
                n(&c.settler_tip_lamports),
                c.rake_bps,
                c.result,
            )
            .unwrap_or_else(|e| panic!("case {i}: {e:?}"));
            let want = Payout {
                pot: n(&c.pot),
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

    /// Scenario 3: true tie, odd sponsored remainder goes to the creator.
    #[test]
    fn tie_splits_odd_lamport_to_creator() {
        let p = payout(100, 11, 4, 250, RESULT_TIE).unwrap();
        assert_eq!((p.to_creator, p.to_opponent, p.to_settler), (104, 103, 4));
        assert_eq!((p.rake, p.prize), (0, 0));
        assert_eq!(total(&p), p.pot);
    }

    /// Tie tip comes from sponsored only; entries are never touched.
    #[test]
    fn tie_tip_capped_by_sponsored() {
        let p = payout(100, 0, 50, 250, RESULT_TIE).unwrap();
        assert_eq!((p.to_creator, p.to_opponent, p.to_settler), (100, 100, 0));
    }

    /// Scenario 4: freeroll, entry 0, so no rake; winner gets sponsored minus tip.
    #[test]
    fn freeroll_has_no_rake() {
        let p = payout(0, 500_000_000, 5_000, 250, RESULT_OPPONENT).unwrap();
        assert_eq!(p.rake, 0);
        assert_eq!(p.to_opponent, 500_000_000 - 5_000);
        assert_eq!(p.to_creator, 0);
    }

    /// Scenario 5: unranked, nothing in the pot, settle pays nothing.
    #[test]
    fn unranked_pays_nothing() {
        let p = payout(0, 0, 5_000, 250, RESULT_CREATOR).unwrap();
        assert_eq!(total(&p), 0);
    }

    #[test]
    fn pending_result_is_rejected() {
        assert!(payout(1, 1, 1, 0, crate::constants::RESULT_PENDING).is_err());
    }
}
