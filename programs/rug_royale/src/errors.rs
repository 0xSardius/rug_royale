use anchor_lang::prelude::*;

/// PRD §8. Variant order is part of the client contract: append only, never reorder.
#[error_code]
pub enum RugRoyaleError {
    // Config
    #[msg("Rake exceeds the 10% maximum")]
    RakeTooHigh,
    #[msg("Swap fee exceeds the 10% maximum")]
    FeeTooHigh,
    #[msg("Windows must be non-zero and ascending")]
    InvalidWindowSet,
    #[msg("Tiers must be non-zero")]
    InvalidTierSet,
    #[msg("Allowed mints must be 10 distinct mints, none equal to the quote mint")]
    InvalidMintList,
    // Create
    #[msg("Tier index out of range")]
    InvalidTier,
    #[msg("Window is not one of the configured windows")]
    InvalidWindow,
    #[msg("Coin is not in the allowed top-10 list")]
    MintNotAllowed,
    #[msg("Join deadline is too soon")]
    DeadlineTooSoon,
    #[msg("Join deadline is too far in the future")]
    DeadlineTooFar,
    #[msg("Entry exceeds the configured maximum")]
    EntryTooHigh,
    // Lifecycle
    #[msg("Duel is not open")]
    DuelNotOpen,
    #[msg("Duel is not active")]
    DuelNotActive,
    #[msg("Join deadline has passed")]
    JoinDeadlinePassed,
    #[msg("Join deadline has not been reached")]
    DeadlineNotReached,
    #[msg("Creator cannot join their own duel")]
    CannotJoinOwnDuel,
    #[msg("Signer is not the allowed opponent")]
    OpponentNotAllowed,
    #[msg("Duel already has a different sponsor")]
    SponsorMismatch,
    // Window
    #[msg("Trading window has not started")]
    WindowNotStarted,
    #[msg("Trading window has ended")]
    WindowEnded,
    #[msg("Trading window has not ended")]
    WindowNotEnded,
    // Swap
    #[msg("Signer is not a participant in this duel")]
    NotAParticipant,
    #[msg("Pool does not belong to this duel")]
    WrongPool,
    #[msg("Amount exceeds vault balance")]
    InsufficientBankroll,
    #[msg("Output below minimum (slippage)")]
    SlippageExceeded,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Swap output rounds to zero")]
    ZeroOutput,
    // Cleanup
    #[msg("Duel is still open or active")]
    DuelStillLive,
    #[msg("Duel accounts are already closed")]
    AlreadyClosed,
    #[msg("Escrow holds more than rent")]
    EscrowNotEmpty,
    // Math
    #[msg("Math overflow")]
    MathOverflow,
    // Appended 2026-10-05 (PRD §8): init_config's pool_seed_ratio >= 1 check.
    #[msg("Pool seed ratio must be at least 1")]
    InvalidSeedRatio,
}
