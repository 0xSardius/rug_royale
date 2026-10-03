use anchor_lang::prelude::*;

/// PRD §6.3 — owner: Sidharth. STUB: only the signer is declared.
/// Full account list, checks (in PRD order) and effects are specified in PRD §6.3.
#[derive(Accounts)]
pub struct SponsorPrize<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
}

pub fn handle_sponsor_prize(_ctx: Context<SponsorPrize>, _amount: u64) -> Result<()> {
    Ok(())
}
