use anchor_lang::prelude::*;

/// v2 PRD §8. Variant order is part of the client contract: append only once the IDL is frozen.
#[error_code]
pub enum RugRoyaleV2Error {
    // Admin
    #[msg("Signer is not authorized")]
    Unauthorized,
    #[msg("Rake exceeds the maximum")]
    RakeTooHigh,
    #[msg("Fee exceeds the 10% maximum")]
    FeeTooHigh,
    #[msg("Settler tip exceeds the maximum")]
    TipTooHigh,
    #[msg("Treasury must be a funded, rent-exempt system account")]
    InvalidTreasury,
    #[msg("Arena asset list is invalid")]
    InvalidAssetList,
    #[msg("Windows must be a non-zero ascending prefix")]
    InvalidWindowSet,
    #[msg("Bankroll must be greater than zero")]
    InvalidBankroll,
    #[msg("Entry range is invalid")]
    InvalidEntryRange,
    #[msg("Start delay is out of range")]
    InvalidStartDelay,
    // Create / join
    #[msg("Protocol or arena is paused")]
    Paused,
    #[msg("Window is not one of the arena's windows")]
    InvalidWindow,
    #[msg("Entry is outside the allowed range")]
    EntryOutOfRange,
    #[msg("Join deadline is too soon")]
    DeadlineTooSoon,
    #[msg("Join deadline is too far in the future")]
    DeadlineTooFar,
    #[msg("Creator cannot join their own match")]
    CannotJoinOwnMatch,
    #[msg("Validator (ER region) must be set")]
    InvalidValidator,
    #[msg("Match is not open")]
    MatchNotOpen,
    #[msg("Join deadline has passed")]
    JoinDeadlinePassed,
    #[msg("Signer is not the allowed opponent")]
    OpponentNotAllowed,
    #[msg("Daily freeroll limit reached")]
    FreerollCapReached,
    // Sponsor
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Match already has a different sponsor")]
    SponsorMismatch,
    #[msg("First sponsorship is below the 0.01 SOL minimum")]
    SponsorTooSmall,
    // Trade
    #[msg("Signer is not a participant in this match")]
    NotAParticipant,
    #[msg("Match is not active")]
    MatchNotActive,
    #[msg("Trading window has not started")]
    WindowNotStarted,
    #[msg("Trading window has ended")]
    WindowEnded,
    #[msg("Asset index is out of range")]
    InvalidAsset,
    #[msg("Asset is disabled for new buys")]
    AssetDisabled,
    #[msg("Price feed does not match the arena asset")]
    WrongPriceFeed,
    #[msg("Price feed data is invalid")]
    PriceInvalid,
    #[msg("Price is stale")]
    PriceStale,
    #[msg("Price is past the limit price")]
    LimitPriceExceeded,
    #[msg("Not enough cash")]
    InsufficientCash,
    #[msg("Not enough quantity")]
    InsufficientQty,
    #[msg("Trade output rounds to zero")]
    ZeroOutput,
    // Finalize / settle
    #[msg("Trading window has not ended")]
    WindowNotEnded,
    #[msg("No valid mark price within the mark window")]
    MarkWindowMissed,
    #[msg("Pot is not active")]
    PotNotActive,
    #[msg("Match is still delegated to the ER")]
    MatchStillDelegated,
    #[msg("Match is not finalized")]
    MatchNotFinalized,
    #[msg("Join deadline has not been reached")]
    DeadlineNotReached,
    #[msg("Refund is not available yet")]
    NotStaleYet,
    #[msg("Match is still open or active")]
    MatchStillLive,
    // Math
    #[msg("Math overflow")]
    MathOverflow,
}
