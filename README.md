# Rug Royale

**1v1 trading duels on Solana. Same coin, same pool, one survivor.**

Two players each escrow an entry, receive identical demo-token bankrolls, and trade the same coin in one shared constant-product pool for a fixed window. When the window closes, the program values both positions on-chain and pays the pot, minus rake, to the higher final value. Coins come from a snapshot of the StonkFun top 10.

Turbin3 capstone by Justin ([@0xSardius](https://github.com/0xSardius)) and Yamin Raad ([@Raad05](https://github.com/Raad05)), with Sidharth contributing to the design phase.

| | |
| --- | --- |
| **Devnet program ID** | [`5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE`](https://explorer.solana.com/address/5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE?cluster=devnet) |
| **Framework** | Anchor 1.1.2, Token-2022 via `token_interface` |
| **Frontend** | Next.js 16 (`app/`), _Vercel link: TBD_ |
| **Specs** | [PRD](docs/prd.md) (source of truth), [architecture PDF](docs/architecture.pdf), [LOI](docs/loi.pdf) |

## Devnet tests

> _Screenshot of the passing devnet test suite goes here (Turbin3 requirement). Added once the suite is green._

## How a duel works

A duel holds three separate assets. Only the entry is the player's own money.

| Asset | On devnet | Created by | What it decides |
| --- | --- | --- | --- |
| **Entry** | Devnet SOL, held in the duel's `Escrow` | The players | Who gets paid: the winner receives the pot minus rake |
| **Bankroll** | Demo quote token (devSTONK), equal for both players | `MintAuthority` PDA at `join_duel` | Who won: each player's final value is measured in it |
| **Coin** | Demo mint standing in for one StonkFun top-10 coin | `MintAuthority` PDA seeds the pool at `create_duel` | What both players trade |

1. **Create.** The creator picks a coin, bankroll tier, window, and entry, and escrows the entry. The program creates the duel, its escrow, its pool (seeded at a 1:1 price), and the creator's vaults.
2. **Join.** An opponent escrows the same entry. Both players get the same bankroll, and the trading window starts 60 seconds later.
3. **Trade.** Each player buys and sells the coin against the shared pool. Every trade moves the price the other player sees.
4. **Settle.** After the window, anyone can call `settle` (in practice a crank bot or either player). Each position is valued as quote balance plus a simulated sell of the coin balance against the final reserves. The higher value wins the pot minus rake. A tie returns both entries.
5. **Close.** Anyone can close a finished duel. Leftover tokens are burned, token accounts are closed, and rent goes back to whoever paid it. The `Duel` account stays as the permanent record.

## Architecture

### System context

```mermaid
flowchart TB
  subgraph Client["Client layer (off-chain)"]
    direction LR
    snap["snapshot.ts<br/>StonkFun top 10 to coins.json<br/>(REQ13)"]
    app["Next.js duel room<br/>lobby, create, duel page, result popup<br/>(REQ11, REQ12)"]
    crank["crank.ts<br/>settles / cancels / closes<br/>(REQ14)"]
  end

  subgraph Actors["Wallet signers"]
    direction LR
    admin["Config admin"]
    creator["Creator"]
    opponent["Opponent"]
    sponsor["Sponsor"]
    settler["Settler (any wallet)"]
  end

  subgraph Program["Rug Royale program (Anchor, devnet): 8 handlers"]
    direction LR
    init["init_config"]
    create["create_duel"]
    join["join_duel"]
    swap["swap"]
    sponsorIx["sponsor_prize"]
    settle["settle"]
    cancel["cancel_duel"]
    close["close_duel"]
  end

  subgraph CPI["Solana programs via CPI"]
    direction LR
    sys["System Program"]
    tok["Token-2022<br/>mint_to, transfer_checked, burn, close_account"]
    ata["Associated Token Program"]
  end

  rpc[("Devnet RPC<br/>reads Duel, Pool, vaults")]

  snap -- "mint list" --> admin
  app -- "builds tx, user signs" --> creator
  app --> opponent
  crank -- "signs as Settler" --> settler
  app <-.-> rpc

  admin --> init
  creator --> create
  creator --> swap
  opponent --> join
  opponent --> swap
  sponsor --> sponsorIx
  settler --> settle
  settler --> cancel
  settler --> close

  Program == "CPI" ==> CPI
```

Price comes **only** from the duel pool's reserves (REQ10). No oracle, keeper, or off-chain price signer can move it. The real StonkFun price is shown in the client for context and never enters settlement.

### Account model

```mermaid
classDiagram
  direction LR
  class Config {
    PDA ["config"]
    admin, treasury, quote_mint: Pubkey
    allowed_mints: [Pubkey; 10]
    tiers: [u64; 3]
    windows: [u32; 4]
    pool_seed_ratio, settler_tip_lamports, max_entry_lamports: u64
    rake_bps, swap_fee_bps: u16
    bump, mint_authority_bump: u8
  }
  class MintAuthority {
    PDA ["mint_authority"]
    no data: signs mint_to
  }
  class Duel {
    PDA ["duel", creator, nonce]
    status: Open | Active | Settled | Cancelled
    result: u8 = 0 pending, 1 creator, 2 opponent, 3 tie
    tier: u8, closed: bool, window_secs: u32
    entry_lamports, sponsored_lamports, bankroll: u64
    final_a, final_b: u64
    join_deadline, start_ts, end_ts: i64
    creator, opponent, allowed_opponent, sponsor: Pubkey
    coin, quote_mint: Pubkey
  }
  class Escrow {
    PDA ["escrow", duel]
    owner: this program
    lamports above rent = entries + sponsored
  }
  class Pool {
    PDA ["pool", duel]
    duel, coin: Pubkey
    quote_reserve, token_reserve: u64
  }
  class VaultAuthority {
    PDA ["vault", duel, player]
    no data: signs vault transfers
  }
  class PlayerVaults {
    quote vault: ATA of vault authority
    coin vault: ATA of vault authority
  }
  class PoolAccounts {
    quote reserve account: ATA of pool
    coin reserve account: ATA of pool
  }

  Config "1" --> "*" Duel : validates tier, window, coin
  Duel "1" --> "1" Escrow : entries (REQ04, REQ06)
  Duel "1" --> "1" Pool : one pool per duel (REQ05, REQ10)
  Duel "1" --> "2" VaultAuthority : creator, opponent
  VaultAuthority "1" --> "1" PlayerVaults : signs transfers
  Pool "1" --> "1" PoolAccounts : reserves
  MintAuthority ..> PlayerVaults : bankroll mint_to (REQ04)
  MintAuthority ..> PoolAccounts : pool seed mint_to (REQ02)
```

Design notes:
- **`Escrow` is program-owned** (PRD G1), not a System account as the architecture PDF's diagram 6.2 shows. Payouts debit its lamports directly, and `close_duel` closes it back to the creator.
- **`Duel` has a fixed layout** with no `Option` fields (G9). Unset pubkeys are `Pubkey::default()`. That keeps byte offsets stable for the lobby's `getProgramAccounts` filters: `status` at byte 8, `creator` at 89, `opponent` at 121.
- **No human holds a mint authority.** The 11 demo mints were created with their mint authority set to the `MintAuthority` PDA (G11).

### Duel lifecycle

```mermaid
stateDiagram-v2
  [*] --> Open : create_duel (REQ02)<br/>coin in top 10, window in Config,<br/>deadline in [now+60, now+86400]
  Open --> Open : sponsor_prize (REQ03)
  Open --> Active : join_duel (REQ04)<br/>now < join_deadline, signer != creator
  Open --> Cancelled : cancel_duel (REQ07)<br/>now >= join_deadline, any signer
  Active --> Active : swap (REQ05)<br/>start_ts <= now < end_ts, k never decreases
  Active --> Settled : settle (REQ06, REQ14)<br/>now >= end_ts, no upper limit
  Settled --> Closed : close_duel (REQ09)
  Cancelled --> Closed : close_duel (REQ09)
  Closed --> [*] : Duel account stays as the record
```

`join_duel` requires `now < join_deadline` and `cancel_duel` requires `now >= join_deadline`, so exactly one is valid at any moment. `settle` never expires and nothing else can move a duel out of `Active`, so a late settle always produces the same result.

### Fund and token flows

```mermaid
flowchart LR
  cw["Creator wallet"] -- "entry (REQ02)" --> esc[("Escrow PDA")]
  ow["Opponent wallet"] -- "entry (REQ04)" --> esc
  sw["Sponsor wallet"] -- "sponsored (REQ03)" --> esc

  esc -- "pot - rake - tip (REQ06)" --> win["Winner wallet"]
  esc -- "rake (0 if no entry)" --> tre["Treasury"]
  esc -- "settler tip" --> set["Settler wallet"]
  esc -- "tie: entries + split of sponsored" --> cw
  esc -- "tie: entries + split of sponsored" --> ow
  esc -- "cancel: sponsored back (REQ07)" --> sw
  esc -- "cancel: entry back (REQ07)" --> cw

  ma{{"MintAuthority PDA"}} -- "bankroll (REQ04)" --> cq["Creator quote vault"]
  ma -- "bankroll (REQ04)" --> oq["Opponent quote vault"]
  ma -- "pool seed (REQ02)" --> pool[("Duel pool<br/>one coin")]
  cq <-- "transfer_checked (REQ05)" --> pool
  oq <-- "transfer_checked (REQ05)" --> pool
  pool <-- "transfer_checked (REQ05)" --> cc["Creator coin vault"]
  pool <-- "transfer_checked (REQ05)" --> oc["Opponent coin vault"]
```

On a tie, entries go back in full, the settler tip comes only from the sponsored amount, and the rest of the sponsored amount is split between the two players, with an odd lamport going to the creator. The sponsor is refunded only when a duel is cancelled (PRD G15).

### Core use cases

<details>
<summary><b>UC-1 <code>join_duel</code></b>: Open to Active</summary>

```mermaid
sequenceDiagram
  actor O as Opponent
  participant C as Duel room (client)
  participant P as Rug Royale program
  participant D as Duel PDA
  participant E as Escrow PDA
  participant M as MintAuthority PDA
  participant T as Token-2022 / System
  O->>C: Join from invite link or lobby
  C->>P: join_duel (signed by opponent)
  P->>D: status == Open, now < join_deadline
  P->>P: signer != creator, allowed_opponent matches
  alt any check fails
    P-->>C: DuelNotOpen / JoinDeadlinePassed / CannotJoinOwnDuel / OpponentNotAllowed
  else all checks pass
    P->>T: entry_lamports opponent to Escrow
    P->>T: create opponent quote + coin vaults
    P->>M: invoke_signed ["mint_authority"]
    M->>T: mint_to bankroll into both quote vaults
    P->>D: opponent, start_ts = now + 60, end_ts, status = Active
    P-->>C: DuelJoined
  end
```
</details>

<details>
<summary><b>UC-2 <code>swap</code></b>: one trade in the shared pool</summary>

```mermaid
sequenceDiagram
  actor U as Duelist
  participant C as Duel room (client)
  participant P as Rug Royale program
  participant D as Duel PDA
  participant L as Pool PDA + reserves
  participant V as Player vaults
  participant T as Token-2022
  U->>C: Buy or Sell, amount, slippage
  C->>P: swap(side, amount_in, min_out)
  P->>D: status == Active, start_ts <= now < end_ts
  P->>P: signer is creator or opponent, vault seeds bind signer
  P->>L: out = constant product net of fee
  alt out < min_out or amount_in > balance
    P-->>C: SlippageExceeded / InsufficientBankroll
  else valid
    P->>T: transfer_checked vault to pool (vault PDA signs)
    P->>T: transfer_checked pool to vault (pool PDA signs)
    P->>L: update reserves, assert k never decreases
    P-->>C: SwapExecuted (with new reserves for the chart)
  end
```
</details>

<details>
<summary><b>UC-3 <code>settle</code></b>: Active to Settled, pays out</summary>

```mermaid
sequenceDiagram
  actor S as Settler (crank or any wallet)
  participant P as Rug Royale program
  participant D as Duel PDA
  participant L as Pool reserves
  participant E as Escrow PDA
  participant R as Winner / players / treasury
  participant C as Duel room (client)
  S->>P: settle (no upper time limit)
  P->>D: status == Active, now >= end_ts
  P->>L: read final reserves (frozen since end_ts)
  P->>P: final = quote + simulated sell of coin, each player alone
  alt final_a != final_b
    P->>R: pot - rake - tip to winner, rake to treasury, tip to settler
  else tie
    P->>R: entries back, tip from sponsored only, rest split
  end
  P->>D: final_a, final_b, result, status = Settled
  P-->>C: DuelSettled
  C->>D: reads status on load and by subscription
  C-->>C: You Win! / You Lose! popup
```
</details>

### Payout math

All program math rounds down with u128 intermediates. `packages/sdk/src/math.ts` mirrors it exactly, and both sides are checked against shared test vectors.

```
Swap (fee stays in pool)   in_net = amount_in * (10_000 - fee_bps) / 10_000
  Buy:  out = token_reserve * in_net / (quote_reserve + in_net)
  Sell: out = quote_reserve * in_net / (token_reserve + in_net)

Valuation at settle         final = quote_vault + sell_out(coin_vault, end reserves)

Payout                      pot = 2 * entry + sponsored
  Winner: rake = entry == 0 ? 0 : pot * rake_bps / 10_000
          tip  = min(settler_tip, pot - rake);  prize = pot - rake - tip
  Tie:    entries back; tip = min(settler_tip, sponsored); rest split, odd lamport to creator
```

## Repository layout

```
programs/rug_royale/   Anchor program: 8 handlers, state, math, errors, events
  tests/vectors/       math test vectors shared by the Rust and TS math
packages/sdk/          @rug-royale/sdk: PDAs, account maps, decoders, filters, math, coins
tests/                 LiteSVM suites + shared fixtures (tests/devnet/: devnet suite)
scripts/               snapshot, setup-mints, init-config, crank, checkpoint
app/                   Next.js frontend
idl/                   frozen IDL and TS types
coins.json             StonkFun top 10 and their devnet demo mints
docs/                  PRD, architecture, LOI, Turbin3 brief, build plan, progress
```

## Running it

Prerequisites: Rust (pinned by `rust-toolchain.toml`), Solana CLI, Anchor 1.1.2 (`avm use 1.1.2`), Node 24, and pnpm 10.

```bash
pnpm install
anchor build            # program, IDL, TS types
pnpm test               # anchor build + LiteSVM suites
pnpm test:devnet        # full duels against the deployed devnet program (~3 min; set RPC_URL to avoid public-RPC rate limits)
pnpm test:rust          # Rust unit tests (math, layout)
pnpm --filter @rug-royale/app dev   # frontend at localhost:3000
```

Devnet setup, in order (each script reads `.env`; see `.env.example`):

```bash
pnpm snapshot           # StonkFun top 10 -> coins.json
pnpm setup-mints        # create the 11 demo mints (authority = MintAuthority PDA)
pnpm init-config        # dry run: prints Config and simulates
pnpm init-config --send # initialize Config (permanent), then diff it on-chain
pnpm crank              # settle / cancel / close duels every 5 s (--once for one pass)
```

## Known limits (accepted for the MVP)

| Limit | Roadmap fix |
| --- | --- |
| **Opening race:** in a constant-product pool the first buyer gets a better price, so if both players buy and hold, the first buyer wins | Opening batch auction where both opening buys fill at one price |
| **Closed two-player market:** PnL comes only from the opponent's trades | Real Raydium CPMM pools on mainnet |
| **Sponsor self-dealing:** a creator can invite their own second wallet and collect a sponsored prize | Sponsor approves the opponent; collusion signals |
| **No refund once Active:** a `settle` bug needs a program upgrade | Two-party-signed refund on mainnet |
| **Fixed coin list:** no `update_config` | Admin `update_config` behind a multisig |
| **Lobby uses `getProgramAccounts`**, which doesn't scale | Indexer (Helius webhooks) |

## Compute units

> _Measured `create_duel` and `join_duel` CU numbers go here once the handlers are complete (PRD §9 scenario 7). The account initializations alone use about 140k CU, so clients send a 400k compute-unit limit._
