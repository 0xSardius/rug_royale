pub mod arena;
pub mod match_state;
pub mod player_stats;
pub mod pot;
pub mod protocol;

pub use arena::*;
pub use match_state::*;
pub use player_stats::*;
pub use pot::*;
pub use protocol::*;

use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    Buy,
    Sell,
}
