use anchor_lang::prelude::*;

/// PRD §6.2 — owner: Sidharth. STUB: only the signer is declared.
/// Full account list, checks (in PRD order) and effects are specified in PRD §6.2.
#[derive(Accounts)]
pub struct CreateDuel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
}

pub fn handle_create_duel(
    _ctx: Context<CreateDuel>,
    _nonce: u64,
    _tier: u8,
    _window_secs: u32,
    _entry_lamports: u64,
    _allowed_opponent: Pubkey,
    _join_deadline: i64,
) -> Result<()> {
    Ok(())
}
