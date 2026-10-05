# Rug Royale: Status

The live picture of where the build stands. Update it whenever a task finishes, a gate passes, or a decision is made. History lives in `checkpoints/`; this file is only the present.

**Last updated:** 2026-10-05 · **Plan:** `BUILD_PLAN.md` · **Latest checkpoint:** `checkpoints/20261005-2322-idl-freeze-fixtures-devnet.md`
**Deadline:** Turbin3 due Sun 2026-10-11 (confirmed); our target is Sat 2026-10-10, leaving a day to review · **Feature freeze:** Fri 2026-10-09 noon · **Demo day:** week of Oct 12
**Graded (see `docs/turbin3_requirements.md`):** devnet deploy + ID in README · full test suite passing **on devnet** + screenshot in README · architecture documented in README · <5 min presentation (≤5 slides) showing devnet tests · individual reflections

## Daily gates (re-baselined in `BUILD_PLAN.md`, 2026-10-05)

- [x] Sat Oct 3: decisions locked (G1, G3, G9, split), repo scaffold, `CLAUDE.md`
- [ ] ~~Sun Oct 4: IDL frozen~~ slipped to Mon
- [ ] Mon Oct 5: account structs merged, **IDL frozen**, stub program on devnet, math unit tests green
- [ ] Tue Oct 6: create → join → swap passes in LiteSVM; fixtures can target devnet; devnet windows decided
- [ ] Wed Oct 7: full LiteSVM suite green; devnet suite happy path passes
- [ ] Thu Oct 8: full devnet suite green + screenshot; browser duel; safety recording
- [ ] Fri Oct 9: bug bash; freeze at noon; README with Mermaid architecture; 5-slide deck
- [ ] Sat Oct 10: final recordings; repo submitted
- [ ] Demo week (Oct 12+): rehearsal under 5 min; individual reflections submitted

## Work by owner

Status values: `todo` · `doing` · `review` · `done`.

### Sidharth: lifecycle and escrow
| Item | PRD | Status |
| --- | --- | --- |
| `init_config` + tests (field writes done in the stub; checks + tests todo) | 6.1 | todo |
| `create_duel` + tests (record CU) | 6.2 | todo |
| `join_duel` + tests | 6.4 | todo |
| `sponsor_prize` + tests | 6.3 | todo |
| `cancel_duel` + tests | 6.7 | todo |
| `close_duel` (burn + close) + tests | 6.8 | todo |
| Invariants I1, I8, I13 | 9 | todo |
| Devnet suite: cancel, freeroll, no-wait error cases | 9 | todo |
| Slide deck (with Yamin), demo script | — | todo |

### Yamin: math and trading
| Item | PRD | Status |
| --- | --- | --- |
| `math/` amm, valuation, payout + Rust unit tests | 7 | todo |
| `swap` + tests; I3–I5 | 6.5, 9 | todo |
| `settle` + payout tests; I2, I6, I7, I11; scenarios 1–5 | 6.6, 9 | todo |
| `swap` invariants I9, I10 | 9 | todo |
| Devnet suite: tie + payout-exactness cases | 9 | todo |
| `sim.ts`, tune `pool_seed_ratio` / fee | 10 | todo |
| Slide deck (with Sidharth) | — | todo |

### Justin: SDK, scripts, frontend, demo
| Item | PRD | Status |
| --- | --- | --- |
| Repo scaffold, `CLAUDE.md`, checkpoint system | 4, 14 | done |
| SDK: PDAs, lobby offsets | 4, 5 | done |
| Account structs for all 8 handlers (branch `idl-freeze-account-structs`, awaiting review) | 6 | review |
| Test fixtures: LiteSVM + RPC senders (branch `test-fixtures`, stacked on the IDL branch) | 9 | review |
| Devnet deploy of stub program (address locked; on-chain IDL upload failed, see open questions) | 13 | done |
| SDK: account maps for all 8 ixs | 4 | review |
| SDK: decoders, `math.ts` mirror (I12) | 7, 9 | todo |
| `snapshot.ts`, `setup-mints.ts` | 10 | todo |
| `init-config.ts`, `crank.ts` | 10 | todo |
| Devnet suite: harness + happy path; README screenshot | 9, 13 | todo |
| Frontend: shell, wallet, lobby, create | 11 | todo |
| Frontend: duel page states 1–5, result popup | 11 | todo |
| README: program ID, test screenshot, Mermaid architecture | 13 | todo |
| Recordings: devnet test run, browser duel | 13 | todo |

## Open questions

- **Program keypair.** The plan is for Justin to deploy to devnet once, which locks in `5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE`. Justin is the only deployer, so the keypair isn't shared. Teammates build and test with the ID already in `declare_id!` and **must not run `anchor keys sync`**.
- **`pool_seed_ratio >= 1` error.** PRD §6.1 requires the check but §8 names no error for it. Pick an existing variant or amend the PRD before adding a 32nd.
- **StonkFun API endpoint.** Verify the path at stonkfun.xyz/developers (PRD §10).
- **Devnet windows.** Proposal: `[30, 120, 300, 900]` instead of `[120, 300, 600, 900]`, so the devnet suite runs in about 2 min. `Config` is permanent, so decide by **Tue Oct 6**, before `init-config.ts` runs. Needs Sidharth's and Yamin's OK.
- **Account-struct PR review.** Justin drafted all 8 on `idl-freeze-account-structs` (not merged). Sidharth reviews his 6 handlers and Yamin reviews `swap`/`settle`. Design notes for review: structural checks live in the account structs; every PRD-ordered typed error stays in the handler. Vault-authority bumps come from `ctx.bumps` because `Duel` stores none.
- **On-chain IDL upload.** `anchor deploy` / `anchor idl init` fail with "Failed to initialize IDL" (Anchor 1.x program-metadata path). Not blocking, since clients use the committed `idl/`; it only affects explorer decoding.

## Decision log

Newest first. Anything that changes the PRD gets a line here **and** an edit to `docs/prd.md`.

- 2026-10-05: Proceeding without waiting on the team because of the time difference. All program changes go on review branches, not `main`.
- 2026-10-05: Stub program deployed to devnet; `5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE` is locked. Upgrade authority: Justin's wallet `47mx…rqBg`.
- 2026-10-05: `create_duel` uses about 143k CU on account inits alone; clients send a 400k compute-unit limit (PRD §6.2 note).
- 2026-10-05: Official deadline confirmed as Oct 11. We submit Oct 10 and keep Oct 11 for review.
- 2026-10-05: Turbin3 brief received (`docs/turbin3_requirements.md`). Added a **devnet test suite** alongside LiteSVM; README must hold the architecture (Mermaid) and a devnet-test screenshot; frontend ranks below the devnet suite and README. Plan re-baselined in `BUILD_PLAN.md`; PRD §12/§13 updated.
- 2026-10-05: Justin is the only devnet deployer; the program keypair is not shared.
- 2026-10-03: Pinned Anchor **1.1.2** (installed locally; 1.2.0 exists). Crates pinned with `=1.1.2` so CLI and crate versions match.
- 2026-10-03: TS tests use `litesvm@0.8.0` (last web3.js v1 line) with the `@anchor-lang/core` IDL client, run by mocha with the `tsx` loader. `litesvm@1.x` moved to `@solana/kit` and does not pair with the Anchor TS client.
- 2026-10-03: Team confirmed G1 (program-owned Escrow), G3 (Token-2022 with no extensions), G9 (fixed Duel layout), and the owner split.
