use anchor_lang::prelude::*;

/// Seeds `["protocol"]`. Global caps, admin-adjustable behind a Squads multisig (V2).
#[account]
#[derive(InitSpace)]
pub struct Protocol {
    /// Squads vault on mainnet.
    pub admin: Pubkey,
    /// Rent-exempt system account (checked at init/update).
    pub treasury: Pubkey,
    /// Global entry cap; 0 = free play only (Stage 2).
    pub max_entry_lamports: u64,
    /// D1: reimburses the joiner's MagicBlock delegation fee.
    pub match_fee_lamports: u64,
    /// <= MAX_SETTLER_TIP_LAMPORTS.
    pub settler_tip_lamports: u64,
    /// <= MAX_FEE_BPS; arenas cannot exceed it.
    pub max_rake_bps: u16,
    /// Blocks create/join/sponsor; never blocks exits (cancel, settle, refund, close).
    pub paused: bool,
    pub bump: u8,
}
