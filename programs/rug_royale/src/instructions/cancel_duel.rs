use anchor_lang::prelude::*;

/// PRD §6.7 — owner: Sidharth. STUB: only the signer is declared.
/// Full account list, checks (in PRD order) and effects are specified in PRD §6.7.
#[derive(Accounts)]
pub struct CancelDuel<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
}

pub fn handle_cancel_duel(_ctx: Context<CancelDuel>) -> Result<()> {
    Ok(())
}
