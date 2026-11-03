//! Value checks shared by the admin instructions (v2 PRD §6.1), in PRD order.
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RugRoyaleV2Error;
use crate::state::{Arena, ArenaAsset, Protocol};

/// The numeric `Protocol` fields. `admin` is the signer (init) or an explicit argument
/// (update); `treasury` is an account.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProtocolArgs {
    pub max_entry_lamports: u64,
    pub match_fee_lamports: u64,
    pub settler_tip_lamports: u64,
    pub max_rake_bps: u16,
    pub paused: bool,
}

/// Every `Arena` field except `arena_id` (seed), `mode` (always LIVE_PRICE_DUEL in v2.1)
/// and `bump`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ArenaArgs {
    pub paused: bool,
    pub asset_count: u8,
    pub assets: [ArenaAsset; MAX_ASSETS],
    pub windows: [u32; NUM_WINDOWS],
    pub bankroll: u64,
    pub min_entry_lamports: u64,
    pub max_entry_lamports: u64,
    pub trade_fee_bps: u16,
    pub rake_bps: u16,
    pub max_price_age_s: u32,
    pub start_delay_secs: u16,
    pub freeroll_daily_cap: u8,
}

/// `RakeTooHigh`, `TipTooHigh`, then `InvalidTreasury`.
pub fn check_protocol_args(args: &ProtocolArgs, treasury: &AccountInfo) -> Result<()> {
    require!(
        args.max_rake_bps <= MAX_FEE_BPS,
        RugRoyaleV2Error::RakeTooHigh
    );
    require!(
        args.settler_tip_lamports <= MAX_SETTLER_TIP_LAMPORTS,
        RugRoyaleV2Error::TipTooHigh
    );
    check_treasury(treasury)
}

/// v1 audit M1: a System-owned, non-executable account at or above the 0-byte rent minimum,
/// so a small rake can never fail settle. Rejects `Pubkey::default()` (the System Program).
pub fn check_treasury(treasury: &AccountInfo) -> Result<()> {
    require!(
        treasury.owner == &System::id()
            && !treasury.executable
            && treasury.lamports() >= Rent::get()?.minimum_balance(0),
        RugRoyaleV2Error::InvalidTreasury
    );
    Ok(())
}

/// Arena checks in PRD order. `previous`: the arena being updated, whose existing asset
/// indices are immutable (feed, lazer id, exponent) so live matches stay valid.
pub fn check_arena_args(
    args: &ArenaArgs,
    protocol: &Protocol,
    previous: Option<&Arena>,
) -> Result<()> {
    check_assets(args, previous)?;
    check_windows(&args.windows)?;
    require!(args.bankroll > 0, RugRoyaleV2Error::InvalidBankroll);
    require!(
        (MIN_START_DELAY_SECS..=MAX_START_DELAY_SECS).contains(&args.start_delay_secs),
        RugRoyaleV2Error::InvalidStartDelay
    );
    require!(
        args.trade_fee_bps <= MAX_FEE_BPS,
        RugRoyaleV2Error::FeeTooHigh
    );
    require!(
        args.rake_bps <= protocol.max_rake_bps,
        RugRoyaleV2Error::RakeTooHigh
    );
    // Free-only arena (both 0), or a paid range whose minimum covers the match fee (D1).
    let free_only = args.min_entry_lamports == 0 && args.max_entry_lamports == 0;
    let paid_ok = protocol.match_fee_lamports < args.min_entry_lamports
        && args.min_entry_lamports <= args.max_entry_lamports
        && args.max_entry_lamports <= protocol.max_entry_lamports;
    require!(free_only || paid_ok, RugRoyaleV2Error::InvalidEntryRange);
    Ok(())
}

fn check_assets(args: &ArenaArgs, previous: Option<&Arena>) -> Result<()> {
    let n = args.asset_count as usize;
    require!(
        (1..=MAX_ASSETS).contains(&n),
        RugRoyaleV2Error::InvalidAssetList
    );
    let used = &args.assets[..n];
    require!(
        used.iter()
            .enumerate()
            .all(|(i, a)| a.feed != Pubkey::default()
                && a.exponent <= MAX_EXPONENT
                && !used[..i].iter().any(|b| b.feed == a.feed)),
        RugRoyaleV2Error::InvalidAssetList
    );
    require!(
        args.assets[n..].iter().all(|a| *a == ArenaAsset::default()),
        RugRoyaleV2Error::InvalidAssetList
    );
    if let Some(prev) = previous {
        let m = prev.asset_count as usize;
        require!(n >= m, RugRoyaleV2Error::InvalidAssetList);
        require!(
            prev.assets[..m]
                .iter()
                .zip(&args.assets[..m])
                .all(|(old, new)| {
                    old.feed == new.feed
                        && old.lazer_id == new.lazer_id
                        && old.exponent == new.exponent
                }),
            RugRoyaleV2Error::InvalidAssetList
        );
    }
    Ok(())
}

/// Used slots are a non-zero, strictly ascending prefix (at least one); the rest are 0.
fn check_windows(windows: &[u32; NUM_WINDOWS]) -> Result<()> {
    let used = windows.iter().take_while(|&&w| w > 0).count();
    require!(
        used >= 1
            && windows[used..].iter().all(|&w| w == 0)
            && windows[..used].windows(2).all(|w| w[0] < w[1]),
        RugRoyaleV2Error::InvalidWindowSet
    );
    Ok(())
}

pub fn write_arena(arena: &mut Arena, arena_id: u16, args: &ArenaArgs, bump: u8) {
    arena.arena_id = arena_id;
    arena.mode = crate::state::MODE_LIVE_PRICE_DUEL;
    arena.paused = args.paused;
    arena.asset_count = args.asset_count;
    arena.assets = args.assets;
    arena.windows = args.windows;
    arena.bankroll = args.bankroll;
    arena.min_entry_lamports = args.min_entry_lamports;
    arena.max_entry_lamports = args.max_entry_lamports;
    arena.trade_fee_bps = args.trade_fee_bps;
    arena.rake_bps = args.rake_bps;
    arena.max_price_age_s = args.max_price_age_s;
    arena.start_delay_secs = args.start_delay_secs;
    arena.freeroll_daily_cap = args.freeroll_daily_cap;
    arena.bump = bump;
}
