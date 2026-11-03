//! Reading MagicBlock Pricing Oracle feeds (spike 01). Each feed is a Pyth `PriceUpdateV2`
//! account owned by the oracle program and updated inside the ER every 50-200 ms:
//!
//! ```text
//! 0   discriminator (8)
//! 8   write_authority (32)
//! 40  verification_level: borsh enum, 0 = Partial { num_signatures: u8 } (2 bytes),
//!                                     1 = Full (1 byte)
//! v   price_message: feed_id (32), price i64, conf u64, exponent i32, publish_time i64,
//!                    prev_publish_time i64, ema_price i64, ema_conf u64
//! v+84 posted_slot u64
//! ```
//!
//! The message's `exponent` field is deliberately ignored: it reads 8 for every feed, even
//! BONK whose real exponent is -10 (spike 01). The arena's exponent is used instead (V3).
use anchor_lang::prelude::*;

use crate::constants::ORACLE_PROGRAM_ID;
use crate::errors::RugRoyaleV2Error;

const VERIFICATION_OFFSET: usize = 40;
const FEED_ID_LEN: usize = 32;
/// From the start of `price_message` (after feed_id) to each field.
const PRICE_REL: usize = FEED_ID_LEN;
const PUBLISH_TIME_REL: usize = FEED_ID_LEN + 8 + 8 + 4;
const POSTED_SLOT_REL: usize = FEED_ID_LEN + 8 + 8 + 4 + 8 + 8 + 8 + 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OraclePrice {
    /// Raw price at the arena's exponent; always > 0.
    pub price: u64,
    /// Upstream publish time, unix seconds (1 s resolution).
    pub publish_time: i64,
}

/// Validates owner, layout, `posted_slot > 0` and `price > 0` (`PriceInvalid`). Freshness is
/// the caller's check, since trade (age) and finalize (mark window) use different rules.
pub fn read_price(feed: &AccountInfo) -> Result<OraclePrice> {
    require_keys_eq!(
        *feed.owner,
        ORACLE_PROGRAM_ID,
        RugRoyaleV2Error::PriceInvalid
    );
    let data = feed.try_borrow_data()?;
    parse(&data).ok_or_else(|| error!(RugRoyaleV2Error::PriceInvalid))
}

fn parse(data: &[u8]) -> Option<OraclePrice> {
    let msg = match *data.get(VERIFICATION_OFFSET)? {
        0 => VERIFICATION_OFFSET + 2, // Partial { num_signatures }
        1 => VERIFICATION_OFFSET + 1, // Full
        _ => return None,
    };
    let rd =
        |rel: usize| -> Option<[u8; 8]> { data.get(msg + rel..msg + rel + 8)?.try_into().ok() };
    let price = i64::from_le_bytes(rd(PRICE_REL)?);
    let publish_time = i64::from_le_bytes(rd(PUBLISH_TIME_REL)?);
    let posted_slot = u64::from_le_bytes(rd(POSTED_SLOT_REL)?);
    if price <= 0 || posted_slot == 0 {
        return None;
    }
    Some(OraclePrice {
        price: price as u64,
        publish_time,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real devnet JUP feed account (spike 01 hex dump): price 25,764,558 (e=8),
    /// publish_time 0x6ae7cf8d, Full verification, 134 bytes.
    const JUP: &str = "eaa10e24acef0fe8000000000000000000000000000000000000000000000000000000000000000001df5223b0b628cafeccac8839b0870f7e35e054e7a374ef2666701bd1f9548e87ce228901000000000000000000000000080000008dcfe76a000000008dcfe76a0000000000000000000000000000000000000000f65e3a390000000000";

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn parses_a_real_devnet_feed() {
        let d = hex(JUP);
        assert_eq!(d.len(), 134);
        assert_eq!(
            parse(&d),
            Some(OraclePrice {
                price: 25_764_558,
                publish_time: 0x6ae7cf8d
            })
        );
    }

    #[test]
    fn partial_verification_shifts_the_message_by_one_byte() {
        let mut d = hex(JUP);
        d[40] = 0;
        d.insert(41, 3); // num_signatures
        assert_eq!(parse(&d).unwrap().price, 25_764_558);
    }

    #[test]
    fn rejects_bad_feeds() {
        let mut short = hex(JUP);
        short.truncate(130);
        assert_eq!(parse(&short), None);
        let mut bad_tag = hex(JUP);
        bad_tag[40] = 7;
        assert_eq!(parse(&bad_tag), None);
        let mut unposted = hex(JUP);
        unposted[125..133].fill(0);
        assert_eq!(parse(&unposted), None);
        let mut zero = hex(JUP);
        zero[73..81].fill(0);
        assert_eq!(parse(&zero), None);
    }
}
