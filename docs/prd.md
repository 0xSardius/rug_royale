# Rug Royale — MVP PRD for Claude Code

Oct 3, 2026 · @Justin

## 1. Overview

Ship a working Rug Royale MVP on devnet by Saturday 2026-10-10, one day before the 2026-10-11 Turbin3 capstone deadline. The MVP is one Anchor program with 8 instruction handlers, a LiteSVM test suite, four off-chain scripts, and a Next.js duel room.

Rug Royale is a 1v1 trading duel. Two players escrow a devnet-SOL entry, receive identical demo-token bankrolls, and trade the same demo coin in one shared constant-product pool for a fixed window. At the buzzer, `settle` values both positions on-chain and pays the pot minus rake to the higher final value.

**Source of truth.** This PRD implements *Rug Royale: Architecture Diagram & Requirements* (2026-09-29). Where this PRD and the architecture doc disagree, this PRD wins, because Section 2 closes gaps the architecture left open. The LOI (2026-09-12) is background only; its rival-coin format, `emergency_refund`, and 9-handler set are superseded.

**Team.** Justin (0xSardius): product, frontend, scripts, PRD owner. Sidharth and Yamin: Anchor program (proposed split in Section 12).

**Goals, in priority order**

1. A full duel runs end to end on devnet: create, join, both players swap, settle, payout lands in the winner's wallet.
2. Every handler has passing happy-path and failure-path tests, including the invariants in Section 9.
3. A player can do all of goal 1 from the browser, and sees You Win! / You Lose! when the duel settles.
4. The crank bot settles ended duels within seconds, with no human action.

## 2. Gaps found and decisions

The architecture is sound, but 15 details would block or confuse a build. Each has a default decision below so Claude Code can proceed; the three marked **Confirm** change the account model, and the team confirmed all three on 2026-10-03.

| # | Gap in the architecture doc | Decision for the build |
| --- | --- | --- |
| G1 | `Escrow` is a System-owned PDA. Paying out needs `invoke_signed` system transfers, and a 0-data system account can never sit between 0 and the rent-exempt minimum (about 0.00089 SOL). | **Confirmed 2026-10-03.** Make `Escrow` a program-owned Anchor account (`Escrow { bump }`). Payouts debit its lamports directly; `close_duel` closes it to the creator. Diagrams change only the owner label. |
| G2 | `close_duel` cannot close token accounts holding tokens, and vaults and pool always hold tokens at the end. | `close_duel` burns every remaining balance first (vault PDA or pool PDA signs the burn), then calls `close_account`. |
| G3 | Token-2022 transfer-fee mints: withheld fees block `close_account`, and swap math must use the amount actually received. | **Confirmed 2026-10-03.** MVP demo mints are Token-2022 with no extensions. Code still uses `token_interface`. A 3% transfer-fee coin is stretch S2. |
| G4 | `Config` has no swap fee field. | Add `swap_fee_bps: u16` (default 30, max 1000). The fee stays in the pool. |
| G5 | `pool_seed_ratio` is undefined. | Pool seed = `bankroll × pool_seed_ratio` raw units of quote and the same raw units of coin, so the opening price is 1.0. Default 10. Tune with the sim script (Section 10). |
| G6 | Where `entry_lamports` comes from is unstated. | `create_duel` input. Add `max_entry_lamports: u64` to `Config` (default 1 SOL) as a devnet safety cap. |
| G7 | `pnl = final / bankroll` loses precision in integer math. | Both bankrolls are equal, so `settle` compares `final_a` and `final_b` as u64. The client computes PnL% for display. |
| G8 | Rounding is unstated for rake and the tie split. | Rake rounds down. On a tie, an odd lamport from the sponsored split goes to the creator. |
| G9 | `Option<Pubkey>` fields shift Borsh byte offsets, which breaks lobby `memcmp` filters. | **Confirmed 2026-10-03.** Use `Pubkey::default()` as "unset" for `opponent`, `allowed_opponent`, `sponsor`. Replace `winner: Option` with `result: u8` (0 pending, 1 creator, 2 opponent, 3 tie). `status` sits at byte offset 8. |
| G10 | Coin names, symbols, and images for the demo mints have no home. | Off-chain `coins.json` maps each demo mint to its real StonkFun coin (name, symbol, image, real mint). Token-2022 metadata extension is stretch. |
| G11 | Who holds mint authority over the demo mints at setup. | The setup script creates the quote mint and 10 coin mints with mint authority set straight to the `MintAuthority` PDA address. No keypair ever holds it. |
| G12 | No `update_config`, so a wrong mint list is permanent. | Keep 8 handlers. The setup script creates mints before `init_config` and verifies the list. Recovery on devnet is a program redeploy with a new program ID. |
| G13 | The client needs swap quotes and live PnL. | One shared TypeScript math module mirrors the Rust math exactly; a test asserts they match on 1,000 random cases. |
| G14 | Window, tier, rake, and tip values are unset. | Defaults in Section 5. Windows include 120 s so the demo is short. |
| G15 | On a tie, UC-3 splits the sponsored amount "equally" without saying between whom, and the fund-flow diagram shows a "tie share" arrow to the sponsor. | Split between the two players (the sponsor funded a prize for the duelists). The sponsor gets funds back only on cancel, so settle never needs the sponsor account. Fix the arrow label in diagram 6.4. |

**Questions only the team can answer** (defaults applied until answered): which Anchor version to pin (default: latest stable on 2026-10-04, recorded in `Anchor.toml`) and whether Sidharth and Yamin take the split in Section 12. Confirmed: a demo video is a required deliverable (Section 13).

## 3. Scope

The MVP is the three graded use cases (`join_duel`, `swap`, `settle`) plus the five handlers that make them reachable and clean. Everything else waits.

**Must ship (P0)**

- Program: all 8 handlers — `init_config`, `create_duel`, `sponsor_prize`, `join_duel`, `swap`, `settle`, `cancel_duel`, `close_duel`.
- LiteSVM test suite covering every handler, every typed error, and the invariants in Section 9.
- Scripts: `setup-mints`, `snapshot`, `init-config`, `crank`.
- Frontend: lobby, create, duel room with live pool price and PnL bars, Settle button, result popup.
- Devnet deployment with a verified end-to-end duel, and a recorded demo video of it.

**Stretch (only after P0 is green on devnet)**

- S1: Rematch button on the result card (creates a new duel with the same settings).
- S2: 3% Token-2022 transfer-fee coin, with fee-aware swap math and `harvest_withheld_tokens_to_mint` in `close_duel`.
- S3: Shareable result card image (OG image route).
- S4: Token-2022 metadata extension on the demo mints.
- S5: Surfpool mainnet-fork demo.

**Out of scope**

- `emergency_refund` (removed, P1), `update_config`, ranked mode, matchmaking, the Ladder.
- Real StonkFun coins, Raydium or Jupiter CPIs, oracles, keepers.
- Spectator markets, points, leaderboards, streamer links, SolEnrich signals.
- Opening batch auction (roadmap fix for the opening race, P2).

## 4. Tech stack and repo

One monorepo, pnpm workspaces, so the IDL, the TypeScript client, and the shared math are imported by scripts and frontend from one place.

| Layer | Choice | Note |
| --- | --- | --- |
| Program | Rust + Anchor (pin version on Day 1), `anchor_spl::token_interface` | Token-2022 mints; `init_if_needed` not used |
| Tests | LiteSVM (TypeScript, `litesvm` npm) + Anchor IDL client | Clock warping for windows and deadlines |
| Shared lib | `packages/sdk`: PDA helpers, account decoders, swap and valuation math | Same math as Rust, cross-tested |
| Scripts | TypeScript, run with `tsx` | Keypairs from env paths, never committed |
| Frontend | Next.js (App Router) on Vercel, Solana wallet adapter, Tailwind | Reads via devnet RPC; `accountSubscribe` for live state |
| RPC | Public devnet RPC for dev; Helius devnet key for the demo | Rate limits on public RPC hurt `getProgramAccounts` |

```
rug-royale/
  programs/rug_royale/src/
    lib.rs              # 8 handlers, thin wrappers
    state/              # config.rs, duel.rs, pool.rs, escrow.rs
    instructions/       # one file per handler
    math/               # amm.rs, valuation.rs, payout.rs (pure, unit-tested)
    errors.rs  events.rs  constants.rs
  packages/sdk/         # pdas.ts, decode.ts, math.ts, ix.ts
  tests/                # LiteSVM suites, one per handler + invariants.ts
  scripts/              # setup-mints.ts, snapshot.ts, init-config.ts, crank.ts, sim.ts
  app/                  # Next.js frontend
  coins.json            # demo mint -> real StonkFun coin metadata
  CLAUDE.md             # working rules (Section 14)
```

## 5. Accounts and state

Two global PDAs, plus five PDAs and six token accounts per duel. The `Duel` account is never closed; it is the permanent record and the oracle.

| Account | Seeds | Owner | Created by | Rent paid by |
| --- | --- | --- | --- | --- |
| `Config` | `["config"]` | program | `init_config` | admin |
| `MintAuthority` | `["mint_authority"]` | none (signer PDA, no data) | never initialized | — |
| `Duel` | `["duel", creator, nonce.to_le_bytes()]` | program | `create_duel` | creator (locked forever) |
| `Escrow` | `["escrow", duel]` | program (G1) | `create_duel` | creator |
| `VaultAuthority` | `["vault", duel, player]` | none (signer PDA, no data) | never initialized | — |
| `Pool` | `["pool", duel]` | program | `create_duel` | creator |
| Creator quote + coin vaults | ATA(creator vault authority, mint) | Token-2022 | `create_duel` | creator |
| Opponent quote + coin vaults | ATA(opponent vault authority, mint) | Token-2022 | `join_duel` | opponent |
| Pool quote + coin accounts | ATA(pool, mint) | Token-2022 | `create_duel` | creator |

ATA owners are PDAs, so every client call that derives them passes `allowOwnerOffCurve = true`.

```rust
#[account] #[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub quote_mint: Pubkey,
    pub allowed_mints: [Pubkey; 10],   // demo mints standing in for the StonkFun top 10
    pub tiers: [u64; 3],               // bankroll per tier, raw quote units
    pub windows: [u32; 4],             // allowed window_secs
    pub pool_seed_ratio: u64,          // pool seed = bankroll * ratio (G5)
    pub settler_tip_lamports: u64,
    pub max_entry_lamports: u64,       // G6
    pub rake_bps: u16,                 // <= 1000
    pub swap_fee_bps: u16,             // G4, <= 1000
    pub bump: u8,
    pub mint_authority_bump: u8,
}

#[account] #[derive(InitSpace)]
pub struct Duel {                      // fixed layout, no Option (G9)
    pub status: DuelStatus,            // byte 8: Open=0 Active=1 Settled=2 Cancelled=3
    pub result: u8,                    // 0 pending, 1 creator, 2 opponent, 3 tie
    pub tier: u8,
    pub closed: bool,
    pub bump: u8,
    pub window_secs: u32,
    pub nonce: u64,
    pub entry_lamports: u64,
    pub sponsored_lamports: u64,
    pub bankroll: u64,
    pub final_a: u64,                  // creator final value, raw quote units
    pub final_b: u64,                  // opponent final value
    pub join_deadline: i64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub creator: Pubkey,
    pub opponent: Pubkey,              // Pubkey::default() until joined
    pub allowed_opponent: Pubkey,      // default = anyone
    pub sponsor: Pubkey,               // default = none
    pub coin: Pubkey,
    pub quote_mint: Pubkey,
}

#[account] #[derive(InitSpace)]
pub struct Pool { pub duel: Pubkey, pub coin: Pubkey, pub quote_reserve: u64, pub token_reserve: u64, pub bump: u8 }

#[account] #[derive(InitSpace)]
pub struct Escrow { pub bump: u8 }    // lamports above rent = entries + sponsored
```

`packages/sdk` exports the byte offsets of `status`, `creator`, and `opponent` for lobby `memcmp` filters, generated from the struct order above.

**Config defaults for devnet**

| Field | Default | Why |
| --- | --- | --- |
| Mint decimals (all demo mints) | 6 | Matches StonkFun coins |
| `tiers` | 1,000 / 10,000 / 100,000 tokens | Size is cosmetic; ratios drive the game |
| `windows` | 120, 300, 600, 900 s (**proposed 2026-10-05:** 30, 120, 300, 900 s; pending team OK) | 120 s keeps the live demo short; a 30 s window keeps the devnet test suite near 2 minutes (Section 9) |
| `pool_seed_ratio` | 10 | A full-bankroll buy moves price about 21% |
| `swap_fee_bps` | 30 | Raydium-like |
| `rake_bps` | 250 | 2.5% of a funded pot |
| `settler_tip_lamports` | 1,000,000 (0.001 SOL) | Covers crank fees |
| `max_entry_lamports` | 1,000,000,000 (1 SOL) | Devnet safety cap |
| Start delay | 60 s constant | From the architecture |
| `join_deadline` range | now + 60 to now + 86,400 s | From the architecture |

## 6. Instruction specs

Each handler does one state transition. Checks run in the order listed so tests can assert the first failing error. All lamport and token math is checked; no `unwrap()`.

### 6.1 `init_config` (REQ01)

- **Signer:** admin (payer). **Args:** every `Config` field except bumps.
- **Checks:** `rake_bps <= 1000` (`RakeTooHigh`); `swap_fee_bps <= 1000` (`FeeTooHigh`); windows non-zero and ascending (`InvalidWindowSet`); tiers non-zero (`InvalidTierSet`); 10 distinct allowed mints, none equal to `quote_mint` (`InvalidMintList`); `pool_seed_ratio >= 1` (`InvalidSeedRatio`).
- **Effect:** `Config` initialized. No event.

### 6.2 `create_duel` (REQ02)

- **Signer:** creator (payer). **Args:** `nonce: u64, tier: u8, window_secs: u32, entry_lamports: u64, allowed_opponent: Pubkey, join_deadline: i64`.
- **Accounts:** config, duel (init), escrow (init), creator vault authority, creator quote + coin vaults (init ATA), pool (init), pool quote + coin accounts (init ATA), quote mint (mut), coin mint (mut), mint authority, token program (interface), associated token program, system program.
- **Checks:** `tier < 3` (`InvalidTier`); `window_secs` in `config.windows` (`InvalidWindow`); coin in `allowed_mints` (`MintNotAllowed`); deadline in range (`DeadlineTooSoon` / `DeadlineTooFar`); `entry_lamports <= max_entry_lamports` (`EntryTooHigh`).
- **Effect:** `Duel { status: Open, bankroll: tiers[tier], … }`; `entry_lamports` creator → escrow (system transfer, creator signs); `MintAuthority` mints `bankroll × pool_seed_ratio` into each pool account; pool reserves set to those amounts.
- **Event:** `DuelCreated { duel, creator, coin, tier, window_secs, entry_lamports, join_deadline }`.
- **Note:** 5 inits and 2 mints in one transaction. Measure compute in tests; the client adds a 400k CU compute-budget instruction if needed.

### 6.3 `sponsor_prize` (REQ03)

- **Signer:** sponsor. **Args:** `amount: u64`.
- **Checks:** `status == Open` (`DuelNotOpen`); `amount > 0` (`ZeroAmount`); `duel.sponsor` is default or equals signer (`SponsorMismatch`).
- **Effect:** `amount` sponsor → escrow; `sponsored_lamports += amount`; `sponsor = signer`.
- **Event:** `PrizeSponsored { duel, sponsor, amount, total }`.

### 6.4 `join_duel` (REQ04, UC-1)

- **Signer:** opponent (payer). **Args:** none.
- **Accounts:** config, duel (mut), escrow (mut), creator vault authority + creator quote vault (mut), opponent vault authority, opponent quote + coin vaults (init ATA), quote mint (mut), coin mint, mint authority, programs.
- **Checks:** `status == Open` (`DuelNotOpen`); `now < join_deadline` (`JoinDeadlinePassed`); `signer != creator` (`CannotJoinOwnDuel`); `allowed_opponent` is default or equals signer (`OpponentNotAllowed`).
- **Effect:** `entry_lamports` opponent → escrow; `MintAuthority` mints `bankroll` into both quote vaults; `opponent = signer`, `start_ts = now + 60`, `end_ts = start_ts + window_secs`, `status = Active`.
- **Event:** `DuelJoined { duel, opponent, start_ts, end_ts }`.

### 6.5 `swap` (REQ05, REQ10, UC-2)

- **Signer:** player. **Args:** `side: Side { Buy, Sell }, amount_in: u64, min_out: u64`.
- **Accounts:** config (read, for `swap_fee_bps`; added 2026-10-07), duel, pool (mut, seeds `["pool", duel]`), vault authority (seeds `["vault", duel, signer]`), player quote + coin vaults (mut, authority = vault authority), pool quote + coin accounts (mut), quote mint, coin mint, token program.
- **Checks:** `status == Active` (`DuelNotActive`); `now >= start_ts` (`WindowNotStarted`); `now < end_ts` (`WindowEnded`); signer is creator or opponent (`NotAParticipant`); pool matches duel (`WrongPool`, enforced by seeds); `amount_in > 0` (`ZeroAmount`); `amount_in <=` source vault balance (`InsufficientBankroll`); `out >= min_out` (`SlippageExceeded`).
- **Effect:** Buy: `transfer_checked` quote vault → pool quote (vault PDA signs), then pool coin → player coin vault (pool PDA signs). Sell is the mirror. Reserves updated; assert `k_after >= k_before`.
- **Event:** `SwapExecuted { duel, player, side, amount_in, amount_out, quote_reserve, token_reserve }`. Reserves in the event let the client chart price without extra reads.

### 6.6 `settle` (REQ06, REQ14, UC-3)

- **Signer:** settler, any wallet (mut, receives tip). **Args:** none.
- **Accounts:** config, duel (mut), pool, 4 player vaults (read), escrow (mut), treasury (mut, `address = config.treasury`), creator (mut, `address = duel.creator`), opponent (mut, `address = duel.opponent`), settler (mut, signer). No sponsor account (G15).
- **Checks:** `status == Active` (`DuelNotActive`); `now >= end_ts` (`WindowNotEnded`). No upper time limit.
- **Effect:** compute `final_a`, `final_b` and payouts per Section 7; debit escrow lamports directly; write `final_a`, `final_b`, `result`, `status = Settled`.
- **Event:** `DuelSettled { duel, result, final_a, final_b, prize, rake, tip }`.
- **Unset pubkeys:** `Pubkey::default()` is the System Program ID, so never pass an unset pubkey as a writable account.

### 6.7 `cancel_duel` (REQ07)

- **Signer:** any wallet. **Args:** none.
- **Checks:** `status == Open` (`DuelNotOpen`); `now >= join_deadline` (`DeadlineNotReached`).
- **Effect:** entry → creator; sponsored → sponsor (Anchor optional account, present when `sponsored_lamports > 0`, `address = duel.sponsor`); `status = Cancelled`.
- **Event:** `DuelCancelled { duel, refunded_entry, refunded_sponsored }`.

### 6.8 `close_duel` (REQ09)

- **Signer:** any wallet. **Args:** none.
- **Accounts:** duel (mut), escrow (`close = creator`), pool (`close = creator`), creator (mut), opponent (optional, absent for a Cancelled duel), both vault authorities, all existing token accounts (4 or 6), quote and coin mints (mut, for burns), token program.
- **Checks:** status is Settled or Cancelled (`DuelStillLive`); `!closed` (`AlreadyClosed`); escrow holds only rent (`EscrowNotEmpty`, defensive).
- **Effect:** burn every token balance (owning PDA signs), `close_account` each token account with rent to its payer (creator or opponent), close escrow and pool, set `closed = true`. `Duel` stays.
- **Event:** `DuelClosed { duel }`.

## 7. Math

All math lives in pure functions in `math/` (Rust) and `packages/sdk/math.ts` (TypeScript), uses u128 intermediates, and rounds down. These are the only formulas the program uses.

**Swap (constant product, fee stays in the pool)**

```
Buy  (quote in):  in_net = amount_in * (10_000 - swap_fee_bps) / 10_000
                  out    = token_reserve * in_net / (quote_reserve + in_net)
                  quote_reserve += amount_in ; token_reserve -= out
Sell (coin in):   in_net = amount_in * (10_000 - swap_fee_bps) / 10_000
                  out    = quote_reserve * in_net / (token_reserve + in_net)
                  token_reserve += amount_in ; quote_reserve -= out
Require: out > 0 (ZeroOutput), out >= min_out, k_after >= k_before
```

**Valuation at settle (pure, no pool mutation, order-independent)**

```
final_x = quote_vault_x + sell_out(coin_vault_x, quote_reserve_end, token_reserve_end)
```

`sell_out` is the Sell formula above, fee included, so the on-screen "value if I sold now" equals what `settle` computes. Each player is valued alone against the same end reserves. `result` = 1 if `final_a > final_b`, 2 if less, 3 if equal.

**Payout**

```
E = entry_lamports ; S = sponsored_lamports ; T = settler_tip_lamports
pot  = 2E + S
rake = (E == 0) ? 0 : pot * rake_bps / 10_000

Winner:  tip   = min(T, pot - rake)
         prize = pot - rake - tip          -> winner
         rake -> treasury ; tip -> settler

Tie:     E -> creator ; E -> opponent      (no rake)
         tip  = min(T, S)                  -> settler
         rest = S - tip
         creator gets rest/2 + rest%2 ; opponent gets rest/2
```

The sum of all payouts equals `pot` exactly, and escrow holds only its rent afterwards. Both are asserted in tests.

**Sanity check (Yamin's example, fees off, seed 100/100, both buy 10 quote).** A receives 9.091 coin, B receives 7.576 coin; at settle A's final is 101.80 and B's is 100.00, so A wins. The Rust and TS unit tests reproduce these numbers with `swap_fee_bps = 0`.

## 8. Errors and events

One `RugRoyaleError` enum with these 32 variants, in this order so error codes stay stable for the client. `InvalidSeedRatio` was added 2026-10-05 and is appended after `MathOverflow` (code 6031) rather than grouped, so no existing code shifts.

| Group | Errors |
| --- | --- |
| Config | `RakeTooHigh`, `FeeTooHigh`, `InvalidWindowSet`, `InvalidTierSet`, `InvalidMintList` |
| Create | `InvalidTier`, `InvalidWindow`, `MintNotAllowed`, `DeadlineTooSoon`, `DeadlineTooFar`, `EntryTooHigh` |
| Lifecycle | `DuelNotOpen`, `DuelNotActive`, `JoinDeadlinePassed`, `DeadlineNotReached`, `CannotJoinOwnDuel`, `OpponentNotAllowed`, `SponsorMismatch` |
| Window | `WindowNotStarted`, `WindowEnded`, `WindowNotEnded` |
| Swap | `NotAParticipant`, `WrongPool`, `InsufficientBankroll`, `SlippageExceeded`, `ZeroAmount`, `ZeroOutput` |
| Cleanup | `DuelStillLive`, `AlreadyClosed`, `EscrowNotEmpty` |
| Math | `MathOverflow` |
| Config (appended) | `InvalidSeedRatio` |

Events are notifications only; the client reads state from accounts (RT-7, RT-8): `DuelCreated`, `PrizeSponsored`, `DuelJoined`, `SwapExecuted`, `DuelSettled`, `DuelCancelled`, `DuelClosed`. Fields are listed per handler in Section 6.

## 9. Test plan

Done means every test below passes in LiteSVM with `anchor build` output, plus Rust unit tests for `math/`. One test file per handler, plus `invariants.ts` and `scenarios.ts`.

**Two suites (added 2026-10-05).** Turbin3 requires "a complete set of tests passing on devnet" with a screenshot in the README (`docs/turbin3_requirements.md`). Everything in this section runs in LiteSVM. A second suite in `tests/devnet/` runs against the deployed program in real time and covers the happy path for all 8 handlers; the tie, freeroll, and cancel paths; and every typed error that needs no clock warp. Both suites share `tests/fixtures.ts`. See `docs/progress/BUILD_PLAN.md`.

**Per handler.** One happy path and one test per typed error the handler can raise, asserting the exact error code. Every test that touches time warps the LiteSVM clock rather than sleeping.

**Invariants (the tests graders and the team should trust)**

| ID | Invariant | How to test |
| --- | --- | --- |
| I1 | Escrow lamports = rent + entries paid + sponsored, while Open or Active | Assert after every create, sponsor, join |
| I2 | Sum of payouts = pot; escrow holds exactly rent after settle or cancel | Winner, tie, freeroll, sponsored cases |
| I3 | `Pool` reserves equal the pool token account balances after every swap | Random swap sequences, 200 steps |
| I4 | k never decreases | Same sequences |
| I5 | Tokens are conserved: vaults + pool = total minted for the duel | Same sequences |
| I6 | Valuation is order-independent | Compute A then B and B then A in the math lib; equal |
| I7 | Late settle gives the same result | Settle at `end_ts` vs a clone warped +30 days |
| I8 | Exactly one of join and cancel is valid at any time | Try both at `join_deadline - 1` and at `join_deadline` |
| I9 | Swap window is `[start_ts, end_ts)` | Swap at `start_ts - 1` fails, `start_ts` passes, `end_ts - 1` passes, `end_ts` fails |
| I10 | A player can only move their own vault | Player A signs with B's vault accounts; fails on seeds |
| I11 | Payout accounts cannot be redirected | Wrong treasury, creator, or opponent in `settle`; each fails |
| I12 | TS math equals on-chain results | 1,000 random swaps; client quote = on-chain `amount_out` |
| I13 | `close_duel` leaves only `Duel`, with `closed = true` | All other duel accounts gone, rent back to payers, second close fails |

**Scenarios**

1. Winner path with entry 0.1 SOL each: creator buys and sells at a profit after opponent buys; winner, treasury, settler balances exact.
2. Yamin's example (fees off): first buyer wins with final values 101.80 vs 100.00 (scaled to raw units).
3. True tie: nobody trades; entries returned, sponsored split with odd lamport to creator, tip from sponsored only.
4. Freeroll: entry 0, sponsored 0.5 SOL; rake 0; winner receives 0.5 SOL minus tip.
5. Unranked: entry 0, no sponsor; settle pays nothing and succeeds.
6. Cancelled duel: sponsor and creator refunded; `close_duel` burns pool seed and creator vaults.
7. Compute: `create_duel` and `join_duel` each stay under 400,000 CU; record actual numbers in the README.

## 10. Off-chain scripts

Five TypeScript scripts in `scripts/`, run in the order below on a fresh deploy. All read RPC URL and keypair paths from `.env`; none commit keys.

1. **`snapshot.ts` (REQ13).** Calls the StonkFun public API (free, no key, 300 req/min) for the top 10 coins by the platform's ranking and writes `coins.json`: name, symbol, image URL, real mint, market cap, and `snapshotAt`. Endpoint (verified 2026-10-05): `GET https://www.stonkfun.xyz/api/public/v1/tokens?sort=marketCap`. STONK itself is excluded, since the quote mint stands in for it, so the snapshot takes the next 10. Fallback if the API is down: a hand-written `coins.json`.
2. **`setup-mints.ts`.** Creates one Token-2022 quote mint (display name "devSTONK") and 10 coin mints, all 6 decimals, mint authority set to the `MintAuthority` PDA address. Writes each `demoMint` into `coins.json` and prints a check that every mint's authority equals the PDA.
3. **`init-config.ts` (REQ01).** Sends `init_config` with the Section 5 defaults, the quote mint, and the 10 demo mints in `coins.json` order. Reads `Config` back and diffs it against the input.
4. **`crank.ts` (REQ14).** Polls every 5 s with `getProgramAccounts` + `memcmp` on `status`. Active and `now >= end_ts` → `settle`. Open and `now >= join_deadline` → `cancel_duel`. Settled or Cancelled, not closed, and ended more than 10 minutes ago → `close_duel`. Treats `DuelNotActive`, `DuelNotOpen`, and `AlreadyClosed` as "someone beat me" and moves on. Logs one line per action. Run it on a laptop or a small always-on host during the demo.
5. **`sim.ts`.** Uses the shared math to simulate 10,000 duels with simple strategies (hold, scalp, front-run, fade). Reports first-buyer win rate and the spread of final values for `pool_seed_ratio` in {5, 10, 20} and fee in {0, 30, 100} bps. Budget one hour; its output picks the final defaults.

Fund the crank and test wallets from the devnet faucet. Devnet airdrops are rate-limited, so fund a few wallets on Day 1 and keep them topped up.

## 11. Frontend

Three routes and one shared result popup. The duel page is the product; spend most frontend time there.

| Route | Shows | Actions |
| --- | --- | --- |
| `/` Lobby (REQ11) | Open duels: coin image and symbol, tier, window, entry ("Unranked" when 0), sponsored amount, join countdown. A "My duels" tab for duels where the wallet is a player. | Join, Create |
| `/create` (REQ02) | Coin picker from `coins.json` with real coin context (display only), tier, window, entry in SOL (0 allowed), optional opponent address, join deadline | Create; then redirect to the duel page with a copyable invite link |
| `/duel/[address]` (REQ12) | Changes by state (below) | Join, Swap, Settle, Cancel |

**Duel page by state**

1. **Open:** waiting card, invite link, Join for non-creators, Cancel once the deadline passes.
2. **Active, before `start_ts`:** 60-second countdown with the rules (closed market, first buyer advantage, window enforced on-chain).
3. **Active, live:** pool price chart, two PnL bars ("value if sold now" from the shared valuation math), Buy/Sell panel with quote preview and 1% default slippage, window timer.
4. **Ended, not settled:** a Settle button for any connected wallet (RT-1). The crank usually gets there first.
5. **Settled:** result card with both final values, PnL%, prize, rake, and transaction links. The You Win! / You Lose! popup fires for the two players; spectators see who won.

**Data rules**

- Subscribe (`accountSubscribe`) to `Duel`, `Pool`, and the 4 vaults; fall back to 2-second polling if the socket drops.
- Read `Duel.status` on page load as well as by subscription, so an offline player still sees the result (P5). The popup shows once per duel per wallet; record "seen" in `localStorage`.
- Chart data: one point per `Pool` change while the page is open, backfilled on load by parsing `SwapExecuted` events from the pool's recent signatures (reserves are in the event).
- The real StonkFun coin price (StonkFun API, Dexscreener fallback) sits in a side panel labelled "Real market, display only" (RT-6). It never feeds PnL.
- Swap transactions include a compute-unit price instruction, because the opening race favors priority fees (P2).
- Map every program error code to a plain sentence ("The window has ended", "Price moved more than your slippage").

**Feel.** The popup is the moment the LOI promises: full-screen, confetti and the prize amount on a win, a dramatic red rug-pull animation on a loss. Keep it under 3 seconds and dismissible.

## 12. Timeline and ownership

> **Superseded 2026-10-05:** the day-by-day table below is replaced by `docs/progress/BUILD_PLAN.md`, which absorbs the Sunday slip and the Turbin3 brief. The owner split still holds.

Seven build days, feature freeze at noon Friday 2026-10-09, submit Saturday 2026-10-10. The critical path is the program; the IDL freezes Sunday night so frontend and scripts never wait on it.

**Split (confirmed 2026-10-03):** Sidharth owns lifecycle and escrow (`init_config`, `create_duel`, `join_duel`, `sponsor_prize`, `cancel_duel`, `close_duel`). Yamin owns the math and trading (`math/`, `swap`, `settle`, the sim), since he built the opening-race example. Justin owns `packages/sdk`, scripts, frontend, crank, README, and the demo. Each program owner reviews the other's PRs.

| Day | Sidharth | Yamin | Justin | Gate by end of day |
| --- | --- | --- | --- | --- |
| Sat Oct 3 | Done: G1, G3, G9 and split confirmed | Same | Repo scaffold, this PRD, `CLAUDE.md` | Decisions locked |
| Sun Oct 4 | State structs, `init_config`, `create_duel` + tests | `math/` in Rust + unit tests; TS mirror | SDK PDAs and decoders; `snapshot.ts`, `setup-mints.ts` | All 8 handlers stubbed; IDL frozen |
| Mon Oct 5 | `join_duel`, `sponsor_prize`, `cancel_duel` + tests | `swap` + tests; I3–I5 | Frontend shell, wallet, lobby, create page | First devnet deploy (partial) |
| Tue Oct 6 | `close_duel` (burn + close) + tests | `settle` + payout tests; I6, I7; scenarios 1–5 | Duel page states 1–2, join flow | Full LiteSVM suite green |
| Wed Oct 7 | Devnet deploy, `init-config.ts` | `sim.ts`, tune defaults | Live trading panel, chart, PnL bars; `crank.ts` | End-to-end duel on devnet by script |
| Thu Oct 8 | I8–I13, CU numbers, review Yamin's code | Bug fixes, review Sidharth's code | Settle button, result card, popup; safety video take | End-to-end duel in the browser |
| Fri Oct 9 | Bug bash: 5 full duels (win, tie, freeroll, cancel, late settle) | Same | Demo rehearsal and recording | Freeze at noon; stretch only if green |
| Sat Oct 10 | Buffer | Buffer | README, final video upload, submission | Submitted |

**Cut order if behind.** Drop in this order: stretch items, the chart backfill (keep live points only), the My duels tab, `sponsor_prize` in the UI (keep the handler and tests), the `close_duel` crank step. Never cut: `join_duel`, `swap`, `settle`, their tests, and the result popup.

## 13. Acceptance criteria and demo

The MVP is done when every box below is ticked on devnet, not localnet.

- [ ] `anchor build` clean, no warnings in program code; program deployed to devnet, ID in README.
- [ ] Rust math tests, the math-vector check, typecheck, and the frontend build pass in CI on every PR (light CI, `.github/workflows/ci.yml`). The full LiteSVM suite passes locally (`pnpm test`), with the summary pasted in each program PR.
- [ ] Devnet suite (`tests/devnet/`) passes against the deployed program; a screenshot of the run is in the README.
- [ ] `Config` on devnet matches Section 5 defaults (or the sim-tuned values) and the 10 demo mints.
- [ ] Two browsers, two wallets: create, join, both swap, crank settles within 10 s of `end_ts`, winner's SOL balance rises by the prize.
- [ ] Loser sees You Lose!, winner sees You Win!, including after a page reload.
- [ ] A tie duel (nobody trades) and a cancelled duel both complete with exact refunds.
- [ ] Settle button works when the crank is stopped.
- [ ] README covers: what it is, the three assets (entry, bankroll, coin), the devnet program ID, the devnet test screenshot, **the architecture in the README itself** (Mermaid ports of diagrams 6.1–6.4, not just a link to the PDF), how to run both test suites, deploy steps, known limits (Section 15), CU numbers, and an implementation note that Escrow is program-owned (diagram 6.2 labels it System Program).
- [ ] Recordings made of the devnet test run and a browser duel, as demo-day backup.
- [ ] Deck of at most 5 slides; presentation rehearsed under 5 minutes (demo day, week of Oct 12).
- [ ] Each member submits an individual reflection on their contribution.

**Demo day format (Turbin3, added 2026-10-05).** Under 5 minutes, at most 5 slides, and it **must show the devnet tests passing** (a recording is allowed). A frontend is optional. The script below needs a rewrite: open with the problem and solution, show the devnet test run, then the browser duel if time allows. Owners: Sidharth and Yamin, Fri Oct 9.

**Demo script (about 4 minutes, 120 s window; to be revised)**

1. Lobby: show the top-10 coin picker and the real-coin context panel; explain entry vs bankroll vs coin in one sentence.
2. Player A creates a 0.05 SOL, 120 s duel on one coin; Player B joins from the invite link.
3. Countdown, then both trade. Narrate the shared pool: each player's buy moves the other's PnL bar.
4. Buzzer. The crank settles; the popup fires on both screens.
5. Open the `settle` transaction in the explorer: escrow debit, prize, rake, tip.
6. Close on the roadmap: opening auction, real Raydium pools, the Ladder.

**Recording the video**

- **Format:** 3 to 5 minutes, 1080p screen capture (OBS) of both browser windows side by side, with voiceover. Upload unlisted to YouTube or Loom.
- **Safety take:** record a rough take Thursday night as soon as the browser end-to-end duel works, so a usable video exists even if Friday goes wrong.
- **Final take:** Friday afternoon after the noon freeze, following the script above. Re-record Saturday morning only if the Friday take has a bug on screen.
- **Prep:** fund both demo wallets, pick a coin with a clear logo, start the crank before recording, and use the 120 s window so the duel fits.
- **Answered 2026-10-05:** under 5 minutes, at most 5 slides, devnet tests shown passing (see `docs/turbin3_requirements.md`).

## 14. Working rules for Claude Code

Copy this section into `CLAUDE.md` at the repo root. It keeps every session aligned with this PRD.

```markdown
# Rug Royale — rules for Claude Code

## Source of truth
- PRD.md (exported from this doc) wins over the architecture PDF and the LOI.
- If a task needs a decision the PRD does not make, stop and ask. Do not invent fields, accounts, or handlers.

## Program rules
- 8 handlers only. One state transition per handler. Checks in the order the PRD lists.
- Use anchor_spl::token_interface and transfer_checked everywhere. No legacy token-only calls.
- Checked math with u128 intermediates; round down; no unwrap() or expect() in program code.
- Every PDA signer uses explicit seeds and the stored bump.
- Escrow is program-owned (G1): pay out by debiting its lamports directly. Never call system_program::transfer FROM escrow; that only works from System-owned accounts. Deposits INTO escrow use system_program::transfer as normal.
- Demo mints are Token-2022 with no extensions (G3). Do not add transfer-fee logic.
- Payout accounts are constrained with address = ... ; never trust a passed-in recipient.
- Duel has a fixed layout (no Option). Keep field order exactly as the PRD so lobby offsets hold.
- Math lives in programs/rug_royale/src/math as pure functions; handlers only call it.

## Workflow
- Small PRs, one handler or one feature each. Tests in the same PR as the code.
- Write the failing test first for every typed error.
- Run anchor build and the full test suite before saying a task is done; paste the summary.
- Any change to Rust math must change packages/sdk/math.ts in the same PR, and I12 must pass.
- Never commit keypairs, .env, or RPC keys.

## Do not
- Add emergency_refund, update_config, oracles, keepers, or external DEX CPIs.
- Change Config or Duel fields without updating the PRD first.
```

**Prompting tip for the team.** Give Claude Code one PRD subsection per task, for example "Implement 6.5 `swap` and the I3–I5 tests per PRD Sections 6.5, 7, and 9." Ask it to list the accounts struct and checks back to you before it writes code; that catches misreads cheaply.

## 15. Known limits and roadmap

These are accepted for the MVP and should be stated on the duel screen or in the README, not fixed.

| Limit | Source | Roadmap fix |
| --- | --- | --- |
| Opening race: the first buyer wins a buy-and-hold duel | P2 | Opening batch auction |
| Closed two-player market; PnL comes from the opponent's trades | D2 | Real Raydium CPMM pools on mainnet |
| Creator can collect a sponsor's prize with a second wallet | P3 | Sponsor approves the opponent; SolEnrich collusion signals |
| No refund path once Active; a `settle` bug needs a program upgrade | P1 | Two-party-signed refund on mainnet |
| No `update_config`; the mint list is fixed | D3, G12 | Admin `update_config` behind a multisig |
| Creator cannot cancel before the join deadline | — | Creator-only early cancel while Open |
| `getProgramAccounts` lobby does not scale | REQ11 | Indexer (Helius webhooks) |
