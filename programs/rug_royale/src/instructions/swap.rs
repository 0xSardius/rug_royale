use anchor_lang::prelude::*;

/// PRD §6.5 — owner: Yamin. STUB: only the signer is declared.
/// Full account list, checks (in PRD order) and effects are specified in PRD §6.5.
#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
}

pub fn handle_swap(
    _ctx: Context<Swap>,
    _side: crate::state::Side,
    _amount_in: u64,
    _min_out: u64,
) -> Result<()> {
    Ok(())
}
