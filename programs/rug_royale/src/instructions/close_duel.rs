use anchor_lang::prelude::*;

/// PRD §6.8 — owner: Sidharth. STUB: only the signer is declared.
/// Full account list, checks (in PRD order) and effects are specified in PRD §6.8.
#[derive(Accounts)]
pub struct CloseDuel<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
}

pub fn handle_close_duel(_ctx: Context<CloseDuel>) -> Result<()> {
    Ok(())
}
