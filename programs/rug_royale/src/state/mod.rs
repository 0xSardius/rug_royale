pub mod config;
pub mod duel;
pub mod escrow;
pub mod pool;

pub use config::*;
pub use duel::*;
pub use escrow::*;
pub use pool::*;

use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    Buy,
    Sell,
}
