# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Rug Royale is a 1v1 trading duel on Solana and the team's Turbin3 capstone. Two players escrow a devnet-SOL entry, get identical demo-token bankrolls, and trade one demo coin in a shared constant-product pool for a fixed window. `settle` values both positions on-chain and pays the pot minus rake to the higher final value.

## Start every session here

1. Read `docs/progress/STATUS.md` (gates, owners, open questions) and the newest file in `docs/progress/checkpoints/`.
2. The plan is `docs/progress/BUILD_PLAN.md`; what Turbin3 grades is in `docs/turbin3_requirements.md` (devnet deploy, a full test suite passing **on devnet**, architecture in the README).
3. The spec is `docs/prd.md`. It **wins** over `docs/architecture.pdf`, and the LOI (`docs/loi.pdf`) is background only. The LOI's rival coins, `emergency_refund`, and 9 handlers are all superseded.
4. If a task needs a decision the PRD does not make, stop and ask. Do not invent fields, accounts, or handlers.

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
pnpm math:vectors                  # regenerate Rust math test vectors from packages/sdk/src/math.ts
pnpm snapshot                      # StonkFun top 10 -> coins.json (refuses once demo mints exist)
pnpm setup-mints                   # create/verify devnet demo mints into coins.json (idempotent)
pnpm --filter @rug-royale/app dev  # frontend at localhost:3000 (app/.env.local: NEXT_PUBLIC_RPC_URL)
pnpm --filter @rug-royale/app build && pnpm --filter @rug-royale/app lint
```

Toolchain: Anchor CLI and crates pinned to **1.1.2** (`=1.1.2` in Cargo.toml; switch with `avm use 1.1.2`), Rust 1.89.0 via `rust-toolchain.toml`, pnpm workspaces. The TS client package is `@anchor-lang/core`, not `@coral-xyz/anchor`.

## Architecture

- `programs/rug_royale/src/`
  - `lib.rs`: 8 thin handler wrappers. Each handler's logic lives in `instructions/<name>.rs` as `handle_<name>`.
  - `state/`: `Config`, `Duel`, `Pool`, `Escrow`.
  - `math/`: pure AMM, valuation, and payout functions. Handlers call these and never inline math.
  - `errors.rs`, `events.rs`, `constants.rs` (seeds and limits).
- `packages/sdk` (`@rug-royale/sdk`): everything off-chain code needs (PDAs, account maps, decoders that return plain types, lobby filters, event parsing, error messages, demo-mint ixs) plus `math.ts`, the PRD §7 math that the Rust must match exactly. Scripts, tests, and the frontend import from it. `idl.ts` exposes `IDL` (camelCase, for the coder) and `IDL_JSON` (raw, for `new Program`).
- **Math parity (I12):** `math.ts` is the reference. `pnpm math:vectors` writes `programs/rug_royale/tests/vectors/math.json`, and the Rust math unit tests must reproduce every case. Changing either side means regenerating vectors in the same PR.
- `tests/`: two suites sharing `tests/fixtures.ts`. LiteSVM suites (`tests/*.test.ts`, one per handler plus `invariants` and `scenarios`) are exhaustive. The devnet suite (`tests/devnet/`, planned) runs against the deployed program in real time and is the one Turbin3 grades.
  - Tests talk to a `Sender` (`LiteSvmSender` or `RpcSender`) through a `Ctx` from `liteCtx()` / `rpcCtx()`. Scenario helpers (`setupProtocol`, `createDuel`, `joinDuel`, `swap`, `settle`, ...) return a `TxResult`; assert with `expectOk` / `expectError(res, "WindowEnded")`.
  - Instructions are encoded from `idl/` with `.accountsStrict(...)` using the SDK account maps (`packages/sdk/src/accounts.ts`). Anchor's client-side PDA resolution is not used, because it needs an RPC fetch for seeds that read `Duel` fields.
  - Time: `ctx.sender.warpTo(ts)` on LiteSVM; `waitUntil(ts)` on RPC. Never sleep in LiteSVM tests.
  - `create_duel` needs a 400k compute-unit limit (the fixture adds it).
- `scripts/`: off-chain TS, run with `tsx`; `scripts/lib/env.ts` loads `.env` (see `.env.example`), RPC, keypairs, and `coins.json`. `coins.json` (repo root) maps each devnet demo mint to its real StonkFun coin; its order is `Config.allowed_mints` order.
- `app/`: Next.js 16 frontend (see `app/CLAUDE.md` and `brand.md`). Next 16 differs from older versions (async `params`, Turbopack default); check `app/node_modules/next/dist/docs/` before using an unfamiliar API.

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

## Frozen IDL

`idl/rug_royale.json` and `idl/rug_royale.ts` are the committed, frozen interface that the SDK, scripts, and frontend build against. After any change to accounts, args, or events, run `pnpm idl` (build + copy) and commit `idl/` in the same PR, and give the team a heads-up.
