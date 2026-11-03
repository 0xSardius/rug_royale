//! Rug Royale v2: 1v1 paper-trading duels on live prices. Source of truth: the v2 PRD
//! (team-internal). Build item 1: accounts, errors, constants and math. Instructions land in
//! later items, one per PR, in PRD §12 order.
use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod math;
pub mod state;

declare_id!("2hcR5rib7mNkcFHnPEfjhH1yJdNsPmK6SVkU3dDjD9Cr");

#[program]
pub mod rug_royale_v2 {}
