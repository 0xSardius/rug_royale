use anchor_lang::prelude::*;

/// PRD §6.4 — owner: Sidharth. STUB: only the signer is declared.
/// Full account list, checks (in PRD order) and effects are specified in PRD §6.4.
#[derive(Accounts)]
pub struct JoinDuel<'info> {
    #[account(mut)]
    pub opponent: Signer<'info>,
}

pub fn handle_join_duel(_ctx: Context<JoinDuel>) -> Result<()> {
    Ok(())
}
