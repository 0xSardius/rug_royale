# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Rug Royale is a 1v1 trading duel on Solana and the team's Turbin3 capstone. Two players escrow a devnet-SOL entry, get identical demo-token bankrolls, and trade one demo coin in a shared constant-product pool for a fixed window. `settle` values both positions on-chain and pays the pot minus rake to the higher final value.

## Start every session here

1. Read `docs/progress/STATUS.md` (gates, owners, open questions) and the newest file in `docs/progress/checkpoints/`.
2. The spec is `docs/prd.md`. It **wins** over `docs/architecture.pdf`, and the LOI (`docs/loi.pdf`) is background only. The LOI's rival coins, `emergency_refund`, and 9 handlers are all superseded.
3. If a task needs a decision the PRD does not make, stop and ask. Do not invent fields, accounts, or handlers.

## Commands

```bash
anchor build                       # builds the program, the IDL (target/idl) and TS types (target/types)
pnpm test                          # anchor build + all TS (LiteSVM) tests
pnpm test:ts                       # TS tests only; needs an up-to-date anchor build
pnpm test:ts -- --grep "swap"      # single TS test or suite by name
pnpm test:rust                     # Rust unit tests (math/, layout)
cargo test -p rug_royale <name>    # single Rust test
npx tsc --noEmit -p .              # typecheck tests, scripts, and the SDK
pnpm lint                          # prettier check
pnpm checkpoint <slug> [--verify]  # write a progress checkpoint (see below)
```

Toolchain: Anchor CLI and crates pinned to **1.1.2** (`=1.1.2` in Cargo.toml; switch with `avm use 1.1.2`), Rust 1.89.0 via `rust-toolchain.toml`, pnpm workspaces. The TS client package is `@anchor-lang/core`, not `@coral-xyz/anchor`.

## Architecture

- `programs/rug_royale/src/`
  - `lib.rs`: 8 thin handler wrappers. Each handler's logic lives in `instructions/<name>.rs` as `handle_<name>`.
  - `state/`: `Config`, `Duel`, `Pool`, `Escrow`.
  - `math/`: pure AMM, valuation, and payout functions. Handlers call these and never inline math.
  - `errors.rs`, `events.rs`, `constants.rs` (seeds and limits).
- `packages/sdk` (`@rug-royale/sdk`): PDA helpers, Duel byte offsets for lobby `memcmp` filters, and later the decoders plus `math.ts`, which mirrors the Rust math exactly. Scripts and the frontend import from it.
- `tests/`: LiteSVM TS suites, one `*.test.ts` per handler plus `invariants` and `scenarios`. `tests/setup.ts` loads `target/deploy/rug_royale.so` into a fresh LiteSVM. The Anchor `Program` there only *builds* instructions; send them with `svm.sendTransaction`. Warp the clock for time-dependent tests instead of sleeping.
- `scripts/`: off-chain TS, run with `tsx`: snapshot, setup-mints, init-config, crank, sim, checkpoint.
- `app/`: Next.js frontend (not created yet).

Key cross-file facts:
- **Duel byte offsets:** `status`@8, `creator`@89, `opponent`@121. They are defined in `state/duel.rs` (with a Rust test) and duplicated in `packages/sdk/src/layout.ts`. Any change to the Duel layout must update both.
- **Error order is an API.** Client error codes are 6000 + the variant index in `RugRoyaleError`. Append only.
- **Signer-less PDAs:** `MintAuthority` (`["mint_authority"]`) is the mint authority of every demo mint. `VaultAuthority` (`["vault", duel, player]`) owns each player's ATAs. Pool token accounts are ATAs of the `Pool` PDA. Every client-side ATA derivation needs `allowOwnerOffCurve = true`.

## Program rules (PRD §14)

- 8 handlers only, one state transition per handler, checks in the order the PRD lists (tests assert the first failing error).
- Use `anchor_spl::token_interface` and `transfer_checked` everywhere. Demo mints are Token-2022 with no extensions (G3), so do not add transfer-fee logic.
- Checked math with u128 intermediates, rounding down. No `unwrap()` or `expect()` in program code.
- Every PDA signer uses explicit seeds and the stored bump.
- Escrow is program-owned (G1). Pay out by debiting its lamports directly; never `system_program::transfer` *from* escrow. Deposits *into* escrow use `system_program::transfer` as normal.
- Payout accounts are constrained with `address = ...`. Never trust a passed-in recipient. `Pubkey::default()` is the System Program ID, so never pass an unset pubkey as a writable account.
- `Duel` has a fixed layout with no `Option` fields (G9). Keep the field order exactly as written.
- Never add `emergency_refund`, `update_config`, oracles, keepers, or external DEX CPIs. Do not change `Config` or `Duel` fields without updating the PRD first.

## Workflow

- Small PRs, one handler or one feature each, with tests in the same PR. Write the failing test first for every typed error.
- Before calling a task done, run `anchor build` and the full test suite and paste the summary.
- Any change to the Rust math must change `packages/sdk/src/math.ts` in the same PR, and invariant I12 must pass.
- Keypairs, `.env`, and RPC keys are gitignored. The program keypair in `target/deploy/` is shared out of band (see STATUS open questions).

## Progress tracking

The team is three people working in parallel, so progress state lives in the repo:
- `docs/progress/STATUS.md` is the **present**: daily gates, per-owner task tables, open questions, and the decision log. Edit it in the same commit as the work it describes.
- `docs/progress/checkpoints/` is the **history**: one append-only file per meaningful milestone, created by `pnpm checkpoint <slug> [--verify]`. The script fills in git state since the previous checkpoint and, with `--verify`, build and test results. Fill in its Summary, Decisions, and Next sections, then point STATUS's "Latest checkpoint" at it.
- Write a checkpoint when a handler or feature lands, a daily gate passes, a decision changes the plan, or before ending a long session with work in flight.
