# Rug Royale: Status

The live picture of where the build stands. Update it whenever a task finishes, a gate passes, or a decision is made. History lives in `checkpoints/`; this file is only the present.

**Last updated:** 2026-10-08 · **Plan:** `BUILD_PLAN.md` · **Latest checkpoint:** `checkpoints/20261008-0023-handlers-and-devnet-upgrade.md`
**Deadline:** Turbin3 due Sun 2026-10-11 (confirmed); our target is Sat 2026-10-10, leaving a day to review · **Feature freeze:** Fri 2026-10-09 noon · **Demo day:** week of Oct 12
**Graded (see `docs/turbin3_requirements.md`):** devnet deploy + ID in README · full test suite passing **on devnet** + screenshot in README · architecture documented in README · <5 min presentation (≤5 slides) showing devnet tests · individual reflections

## Daily gates (re-baselined in `BUILD_PLAN.md`, 2026-10-05)

- [x] Sat Oct 3: decisions locked (G1, G3, G9, split), repo scaffold, `CLAUDE.md`
- [ ] ~~Sun Oct 4: IDL frozen~~ slipped to Mon
- [ ] Mon Oct 5: ~~account structs merged~~ ✓, ~~**IDL frozen**~~ ✓, ~~stub program on devnet~~ ✓, math unit tests green
- [ ] Tue Oct 6: create → join → swap passes in LiteSVM; fixtures can target devnet; devnet windows decided
- [ ] Wed Oct 7: full LiteSVM suite green; devnet suite happy path passes
- [ ] Thu Oct 8: full devnet suite green + screenshot; browser duel; safety recording
- [ ] Fri Oct 9: bug bash; freeze at noon; README with Mermaid architecture; 5-slide deck
- [ ] Sat Oct 10: final recordings; repo submitted
- [ ] Demo week (Oct 12+): rehearsal under 5 min; individual reflections submitted

## Work by owner

Status values: `todo` · `doing` · `review` · `done`.

### Lifecycle and escrow (Sidharth's original list; reassigned after he withdrew)
| Item | PRD | Owner | Status |
| --- | --- | --- | --- |
| `init_config` + tests | 6.1 | Justin | done |
| `create_duel` + tests | 6.2 | Justin | done |
| `join_duel` + tests | 6.4 | Justin | done |
| `cancel_duel` + tests (~8.8k CU) | 6.7 | Justin | done |
| `close_duel` effects + 3 review fixes (#5) | 6.8 | Yamin | done |
| `sponsor_prize` + tests; replace `injectSponsor` in settle/cancel tests | 6.3 | **Yamin** | todo |
| Invariants I1 (create/join tests), I8 (join + cancel tests), I13 (close tests) | 9 | Justin, Yamin | done |
| Devnet suite: no-wait error cases | 9 | Justin | done |
| Devnet suite: cancel scenario (duel C; 19 passing on devnet) | 9 | Justin | done |
| Devnet suite: freeroll scenario (after `sponsor_prize`) | 9 | **Yamin** | todo |

### Yamin: math and trading
| Item | PRD | Status |
| --- | --- | --- |
| `math/` amm, valuation, payout + Rust unit tests. **Must pass `programs/rug_royale/tests/vectors/math.json`** (505 swaps, 100 valuations, 50 results, 200 payouts; load with `include_str!` + `serde_json`) | 7 | done (#1, 855/855 vectors) |
| `swap` + tests; I3–I5 (I9, I10, I12 too). Tests inject an Active duel until create/join land | 6.5, 9 | done (#2) |
| `settle` + payout tests; I2, I7, I11; scenarios 1–5 (36,598 CU). I6 is in the Rust math tests. Sponsored cases inject the deposit until `sponsor_prize` lands | 6.6, 9 | done (#4) |
| `swap` invariants I9, I10 | 9 | done (#2) |
| Devnet suite: tie + payout-exactness cases (in Justin's devnet suite) | 9 | done |
| `sim.ts`, tune `pool_seed_ratio` / fee (`pnpm sim`) → **ratio 5, fee 30** | 10 | done (#3) |
| **5-slide deck draft** (problem, solution, architecture, devnet tests, sim results + roadmap) | — | todo |

### Justin: SDK, scripts, frontend, demo
| Item | PRD | Status |
| --- | --- | --- |
| Repo scaffold, `CLAUDE.md`, checkpoint system | 4, 14 | done |
| SDK: PDAs, lobby offsets | 4, 5 | done |
| Account structs for all 8 handlers (merged to main; owner review as follow-up) | 6 | done |
| Test fixtures: LiteSVM + RPC senders (merged) | 9 | done |
| Devnet deploy of stub program (address locked; on-chain IDL upload failed, see open questions) | 13 | done |
| SDK: account maps for all 8 ixs (merged) | 4 | done |
| SDK: decoders, lobby filters, events, error messages | 4, 11 | done |
| SDK: `math.ts` (PRD §7) + Rust test vectors (`pnpm math:vectors`) | 7, 9 | done |
| `snapshot.ts`, `setup-mints.ts` (11 devnet mints created and verified; `coins.json` committed) | 10 | done |
| `init-config.ts` (Config live on devnet 2026-10-08) and `crank.ts` | 10 | done |
| Devnet suite: 15 tests, 2 parallel duels (winner + tie), typed errors, I2/I3/I12/I13 — passing on devnet | 9, 13 | done |
| README screenshot of the devnet run (needs a dedicated RPC_URL for clean output) | 13 | todo |
| Frontend: shell, wallet, lobby, create (neo-brutalist, `brand.md`) | 11 | done |
| Frontend: duel page states 1–2 + join flow | 11 | done |
| Frontend: trading panel, PnL bars, Settle button, result card, popup (states 3–5) | 11 | todo |
| Vercel deploy | 13 | todo |
| README: program ID, Mermaid architecture (7 diagrams) | 13 | done |
| README: CU numbers (all handlers, measured) | 13 | done |
| README: devnet test screenshot (`pnpm test:devnet 2>/dev/null`) | 13 | todo |
| Light CI (`.github/workflows/ci.yml`) | 13 | done |
| Recordings: devnet test run, browser duel | 13 | todo |
| Demo script (< 5 min, tied to Yamin's deck) | 13 | todo |

## Open questions

- **Program keypair.** The plan is for Justin to deploy to devnet once, which locks in `5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE`. Justin is the only deployer, so the keypair isn't shared. Teammates build and test with the ID already in `declare_id!` and **must not run `anchor keys sync`**.
- **Devnet windows.** Default `[30, 120, 300, 900]` (instead of `[120, 300, 600, 900]`), so the devnet suite runs in about 2 min. **Final Tue Oct 6 noon unless someone objects.** `Config` is permanent once `init-config.ts` runs.
- **Account-struct review (follow-up).** Merged to `main` so nobody builds on the old stubs. Sidharth reviews his 6 handlers and Yamin reviews `swap`/`settle`. Fix anything in your handler PR; the merges are `e1f8323` / `9961df4` if a full revert is ever needed. Design notes: structural checks live in the account structs; every PRD-ordered typed error stays in the handler. Vault-authority bumps come from `ctx.bumps`.
- **On-chain IDL upload.** `anchor deploy` / `anchor idl init` fail with "Failed to initialize IDL" (Anchor 1.x program-metadata path). Not blocking, since clients use the committed `idl/`; it only affects explorer decoding.

## Decision log

Newest first. Anything that changes the PRD gets a line here **and** an edit to `docs/prd.md`.

- 2026-10-08: **`close_duel` effects landed (Yamin, picked up from Sidharth).** Burns every balance and closes each token account (rent: creator for its vaults and the pool accounts, opponent for theirs), escrow and pool close to the creator, `closed = true`. Review findings fixed: (1) effects exist, so nothing is stranded; (2) **`EscrowNotEmpty` dropped** from close (PRD §6.8 amended; dust is swept to the creator); (3) all four opponent accounts are required once someone joined. A second close fails with `AccountNotInitialized` (escrow/pool gone), not `AlreadyClosed`; the crank now counts it as beaten (`6b9ca83`). Merged; settle and close can deploy.

- 2026-10-08: **Treasury must hold at least rent-exempt SOL.** `settle` credits the rake straight into `config.treasury`; if the treasury is an empty account and the rake is below the rent-exempt minimum (~0.00089 SOL, i.e. entry under ~0.018 SOL at 2.5%), the whole `settle` fails with `InsufficientFundsForRent` until someone funds the treasury. `init-config.ts` defaults the treasury to the admin wallet, which is funded; keep it that way (or fund `TREASURY` first). Same applies to a winner whose wallet sits at 0 lamports, which is unlikely since they paid fees to join.

- 2026-10-09: `cancel_duel` live on devnet. Upgrades that grow the program by < 10,240 bytes fail auto-extend ("ExtendProgram requires a minimum of 10240 additional bytes"); run `solana program extend <PROGRAM_ID> 10240 -ud` first. Failed deploys leave buffers holding SOL: `solana program close --buffers -ud` and delete `target/deploy/rug_royale-upgrade-buffer.json`.
- 2026-10-09: **Sidharth withdrew from the program (illness).** Team is Justin + Yamin. His remaining items split: Yamin takes `sponsor_prize`, the freeroll devnet scenario, and the deck draft; Justin takes `cancel_duel`, the cancel devnet scenario, the screenshot, README, trading UI, Vercel, recordings, and the demo script. README credits Sidharth for the design phase. Tell Turbin3 staff the team is now two.
- 2026-10-08: **Devnet live.** Program upgraded with settle + close (bytes verified), then **Config initialized** (tx `3YtpXnjj7jSBdMfjooicnj21BDjRgQ9a12nxSscmps193XNq5jK9VuBShAEJjicyeiUPFJiwaVCD3PQZpwDhrKfv`): ratio 5, fee 30 bps, rake 250 bps, windows [30, 120, 300, 900], treasury = Justin's wallet. All fields verified on-chain. **Config, Duel, and Pool layouts are now frozen on this program ID**; changing them means a new program ID and new mints.
- 2026-10-08: Merged #3 (sim → `pool_seed_ratio = 5`, fee 30 bps), #4 (`settle`), #5 (`close_duel` effects + review fixes). #5 had merged into the `settle` branch after #4 merged it to `main`, so it was re-merged (`d7ac914`). Stack PRs need retargeting to `main` before the base merges.
- 2026-10-07: **Devnet upgraded** (create, join, swap, init_config checks, close guard; slot 508633329, bytes verified against the local build). **`init-config --send` deferred** until Yamin's `sim.ts` picks `pool_seed_ratio` and `swap_fee_bps` (PRD §10.5); Config is permanent. Dry run passes. Accepted risk meanwhile: anyone could initialize Config first (would force a new program ID + new mints).
- 2026-10-07: Pre-deploy review fixes: `join_duel` creates opponent vaults with `create_idempotent` (anyone could pre-create them to block a join); `create_duel` rejects `allowed_opponent == creator` with `OpponentNotAllowed` (PRD §6.2 amended); `init_config` checks written. Known/accepted: anyone who knows `(creator, nonce)` can pre-create a vault or pool ATA and force a retry; the frontend uses random nonces.
- 2026-10-07: **`join_duel` creates the opponent vaults by CPI after its checks** (not `init`), because Anchor runs `init` before any check and a self-join hit "already in use" instead of `CannotJoinOwnDuel`. Same pattern applies to any handler whose typed error must beat an `init`.
- 2026-10-07: **`close_duel` stack fix.** Six `associated_token::` constraints overflowed the 4 KB BPF stack in `CloseDuel::try_accounts` (4,736 bytes; `anchor build` prints it as `Error: ... Stack offset` but still emits a binary). Token accounts now use `token::` constraints, and `verify_ata_addresses` checks the exact ATAs in its own frame as the handler's first call. Check `anchor build` output for `Stack offset` on any struct with many ATAs.
- 2026-10-07: Reviewed and merged #1 (math, 855/855 vectors) and #2 (swap, 17 tests). The `bnToBigInt` fix reproduces: the old conversion fails the random-swap test the same way every run.
- 2026-10-07: **SDK converts BN → bigint via hex (`bnToBigInt`).** On Node 24.10 and 24.13, V8's optimizer sometimes miscompiles bn.js's base-10 `toString()` once hot, returning only the low 7 digits (11036329022 → "6329022"). Seen in the swap random-sequence test; disappears with `--no-maglev` or on Node 22. Never write `BigInt(bn.toString())`.
- 2026-10-07: **`swap` takes `config` (read-only)** to get `swap_fee_bps` (G4); PRD §6.5 omitted it. IDL re-frozen, SDK `swapAccounts` updated; team heads-up goes out with the swap PR.

- 2026-10-05: StonkFun snapshot uses `GET https://www.stonkfun.xyz/api/public/v1/tokens?sort=marketCap` (public, no key, 300 req/min). **STONK is excluded** from the duel coins because the quote mint (devSTONK) stands in for it; the next 10 by market cap are used.
- 2026-10-05: Devnet demo mints created (`coins.json`): quote devSTONK `4fgyjcmj1MUX3HoHExLwdYYoASDQJPHsXSWAbNToJpbA` plus 10 coins, all with mint authority = MintAuthority PDA `8rbDWrez1DWQNjnr1f9bqu7v8k8TXLU6mfFBxWE2b1x3`. Order in `coins.json` = `Config.allowed_mints` order.
- 2026-10-05: Merged the account structs and fixtures to `main` (review as follow-up). Added `InvalidSeedRatio` (code 6031) for the `pool_seed_ratio` check: a default, open to objection until Tue noon.
- 2026-10-05: Fallback rule: any critical-path handler without a PR by Tue Oct 6 noon gets picked up by Justin (BUILD_PLAN working agreements).
- 2026-10-05: Proceeding without waiting on the team because of the time difference. All program changes go on review branches, not `main`.
- 2026-10-05: Stub program deployed to devnet; `5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE` is locked. Upgrade authority: Justin's wallet `47mx…rqBg`.
- 2026-10-05: `create_duel` uses about 143k CU on account inits alone; clients send a 400k compute-unit limit (PRD §6.2 note).
- 2026-10-05: Official deadline confirmed as Oct 11. We submit Oct 10 and keep Oct 11 for review.
- 2026-10-05: Turbin3 brief received (`docs/turbin3_requirements.md`). Added a **devnet test suite** alongside LiteSVM; README must hold the architecture (Mermaid) and a devnet-test screenshot; frontend ranks below the devnet suite and README. Plan re-baselined in `BUILD_PLAN.md`; PRD §12/§13 updated.
- 2026-10-05: Justin is the only devnet deployer; the program keypair is not shared.
- 2026-10-03: Pinned Anchor **1.1.2** (installed locally; 1.2.0 exists). Crates pinned with `=1.1.2` so CLI and crate versions match.
- 2026-10-03: TS tests use `litesvm@0.8.0` (last web3.js v1 line) with the `@anchor-lang/core` IDL client, run by mocha with the `tsx` loader. `litesvm@1.x` moved to `@solana/kit` and does not pair with the Anchor TS client.
- 2026-10-03: Team confirmed G1 (program-owned Escrow), G3 (Token-2022 with no extensions), G9 (fixed Duel layout), and the owner split.
