# Rug Royale: Build Plan

Re-baselined Mon 2026-10-05 against the Turbin3 brief (`docs/turbin3_requirements.md`). It replaces the day-by-day table in PRD §12 and keeps its owners. Track progress in `STATUS.md`. This file changes only when the plan does.

## What gets graded

Turbin3 grades these. Everything else supports them.

1. Program deployed to devnet, with the **program ID in the README**.
2. **A complete test suite passing on devnet**, with a **screenshot in the README**.
3. **Architecture documented in the README**, not just linked.
4. Demo day presentation (week of Oct 12): under 5 min, at most 5 slides, **must show the devnet tests passing** (a recording is allowed).
5. An individual reflection from each member on their own contribution.

The frontend is "not mandatory." We still build it because a live duel with the popup is the strongest demo, but it ranks **below** the devnet suite and the README.

## Where we are

- **Done (Sat Oct 3):** decisions locked; repo scaffold. The program builds with final state structs, errors, events, and handler args; SDK PDAs and layout; LiteSVM harness; progress tracking.
- **Slipped:** the Sunday gate (IDL frozen). Nothing beyond the scaffold is on GitHub. Any local work should be pushed as a draft PR today.
- **Remaining:** Mon to Fri noon is 4.5 build days.

## Two test suites

| | LiteSVM (`tests/*.test.ts`) | Devnet (`tests/devnet/*.test.ts`) |
| --- | --- | --- |
| Purpose | Exhaustive correctness | The graded "passing on devnet" suite |
| Runs against | Local LiteSVM with the clock warped | The deployed program on devnet, in real time |
| Covers | Every typed error, invariants I1–I13, random swap sequences, scenarios 1–7 | Happy path for all 8 handlers; tie, freeroll, cancel; errors that need no waiting (`CannotJoinOwnDuel`, `InvalidTier`, `MintNotAllowed`, `WindowNotStarted`, `NotAParticipant`, `SlippageExceeded`, `WindowNotEnded`, `DuelNotOpen`) |
| Runtime | Seconds | About 2 min, with duels running in parallel and a 30 s window |

Both suites share `tests/fixtures.ts` and the SDK instruction builders. The fixtures take a small sender interface (LiteSVM or RPC `Connection`), so a scenario is written once. Clock warping exists only on the LiteSVM side; devnet tests wait on real time.

**Devnet windows (proposed, needs team OK before `init-config.ts` runs):** `windows = [30, 120, 300, 900]` instead of PRD §5's `[120, 300, 600, 900]`. The 30 s window keeps the devnet suite at about 2 minutes, and the demo still uses 120 s. `Config` is permanent (G12), so decide by **Tue Oct 6**.

**Devnet SOL:** every test duel pays rent, and the `Duel` rent is locked forever. Keep 3–4 funded test wallets in `.env` paths and top them up daily; airdrops are rate-limited.

## Critical path

```
account structs (all 8) ──► IDL freeze ──► SDK ix builders ──► fixtures (LiteSVM + RPC)
        │                                                        │
        ├─► create_duel ─► join_duel ─► swap ─► settle ─► close_duel
        │                                ▲        ▲              │
math/ (amm, valuation, payout) ──────────┴────────┴──► sdk math.ts (I12)
                                                                 ▼
setup-mints ─► init-config (windows decided) ─► DEVNET SUITE GREEN ─► README screenshot
                                                    │
                                     crank ─► browser duel ─► demo recording
```

The spine is `create → join → swap → settle` plus the devnet suite. Anything not on it can slip a day; anything on it cannot.

## Two moves to make today

1. **Freeze the IDL tonight (Mon).** Full `#[derive(Accounts)]` structs for all 8 handlers, transcribed from PRD §6, with handler bodies still `Ok(())`. **Proposal:** Justin drafts all 8 with Claude in one PR this morning; Sidharth and Yamin each review their own handlers by evening. *Needs their OK.* If they'd rather write their own, the deadline is still tonight.
2. **Shared test fixtures (Justin).** `tests/fixtures.ts`:
   - Sender interface: `send(ixs, signers)`, `lamports(pk)`, `tokenBalance(ata)`, `now()`, with LiteSVM and RPC implementations
   - `createMints`: a Token-2022 quote mint and 10 coin mints, mint authority = `MintAuthority` PDA
   - `initConfig(overrides?)`: PRD §5 defaults
   - `openDuel`, `activeDuel`, `endedDuel`: each calls the real handlers once they exist
   - `expectError(res, "WindowEnded")`; LiteSVM-only `warpTo(unixTs)`

## Day by day

Gate = what must be true by end of day. If a gate misses, apply the cut order the next morning; don't push the gate back.

### Mon Oct 5: IDL frozen
| Owner | Work | PRD |
| --- | --- | --- |
| Justin | Account-struct PR (all 8, pending OK). Fixtures with the LiteSVM sender. Devnet deploy of the stub program to lock the address. `snapshot.ts`, `setup-mints.ts`. | 6, 9, 10 |
| Sidharth | Review account structs for his 6 handlers. Start `init_config` body + tests (decide the `pool_seed_ratio` error). | 6.1 |
| Yamin | `math/amm.rs`, `valuation.rs`, `payout.rs` + Rust unit tests, including the 101.80 / 100.00 example with fees off. Review `swap`/`settle` structs. | 7 |

**Gate:** account structs merged; `target/idl/rug_royale.json` committed as the frozen IDL; program on devnet at `5USp…NJWE`; math unit tests green.

### Tue Oct 6: a duel can open, fill, and trade (LiteSVM)
| Owner | Work | PRD |
| --- | --- | --- |
| Justin | SDK decoders + `ix.ts` builders. RPC sender for the fixtures. `math.ts` mirror + I12. Next.js shell: wallet adapter, lobby, create page. | 4, 7, 11 |
| Sidharth | `init_config`, `create_duel` (record CU), `join_duel` with every typed-error test. I8. | 6.1, 6.2, 6.4 |
| Yamin | `swap` + error tests; I3, I4, I5, I9, I10. | 6.5, 9 |

**Gate:** create → join → swap passes in LiteSVM; fixtures can target devnet; **devnet windows decided**.

### Wed Oct 7: full LiteSVM suite green + devnet happy path
| Owner | Work | PRD |
| --- | --- | --- |
| Justin | `init-config.ts` on devnet. **Devnet suite: the create → join → swap → settle → close happy path.** `crank.ts`. Duel page states 1–2 + join flow. | 10, 11 |
| Sidharth | `sponsor_prize`, `cancel_duel`, `close_duel` (burn + close) + tests. I1, I13. Devnet redeploy. | 6.3, 6.7, 6.8 |
| Yamin | `settle` + payout tests; I2, I6, I7, I11; scenarios 1–5. | 6.6, 9 |

**Gate:** `pnpm test` fully green; the devnet suite's happy path passes against the deployed program.

### Thu Oct 8: devnet suite complete + browser duel
| Owner | Work | PRD |
| --- | --- | --- |
| Justin | Live trading panel, PnL bars, Settle button, result card, popup. **Screenshot of the devnet suite for the README.** Safety recording of the devnet run + a browser duel. | 11, 13 |
| Sidharth | Port the cancel, freeroll, and no-wait error cases to the devnet suite. Scenario 6, scenario 7 (CU numbers). Review Yamin's PRs. | 9 |
| Yamin | Port the tie and payout-exactness checks to the devnet suite. `sim.ts` → final `pool_seed_ratio` / fee. Review Sidharth's PRs. | 9, 10 |

**Gate:** the full devnet suite is green, with a screenshot committed; a two-browser duel works and the crank settles within 10 s of `end_ts`.

### Fri Oct 9: bug bash, freeze at noon, docs and deck
All three, morning: five devnet duels (win, tie, freeroll, cancel, late settle with the crank stopped). Fix only what breaks them. **Feature freeze at 12:00.**

Afternoon:
| Owner | Work |
| --- | --- |
| Justin | README: program ID, devnet test screenshot, **architecture in Mermaid** (system context, account model, lifecycle, fund flows ported from the PDF), test and deploy instructions, known limits, CU numbers. |
| Sidharth + Yamin | **5-slide deck:** problem, solution, architecture, devnet tests, roadmap. Rewrite the PRD §13 demo script for under 5 min. |

### Sat Oct 10: submit
Final recordings (devnet test run, browser duel) as presentation backup. Submit the repo link. Each member drafts an individual reflection (`git log --author=<you>` plus the checkpoints give a record).

### Demo week (Oct 12+)
One full rehearsal under 5 minutes with screen share ready. Each member submits their individual reflection.

## Cut order

If behind, drop in this order:
1. Stretch items
2. Chart backfill (keep live points)
3. "My duels" tab
4. `sponsor_prize` in the UI (keep the handler + tests)
5. `close_duel` crank step
6. Pool price chart (keep PnL bars)
7. The browser duel in the demo (fall back to the test recording + slides)

**Never cut:** the 8 handlers and the LiteSVM suite, the devnet deploy, **the devnet suite and its screenshot**, **the README with architecture**, the deck, and the recordings.

## Working agreements

- One PR per handler or feature, tests included, reviewed by the other program owner. Merge to `main` the same day.
- **After the IDL freeze,** any account or arg change needs a heads-up in the team chat and an IDL re-commit in the same PR.
- Commit under your own name and email; the individual reflections lean on `git log`.
- Update your rows in `STATUS.md` in the PR that does the work. Run `pnpm checkpoint <slug> --verify` when a gate passes.
- Blocked for more than an hour? Say so in chat and take the next item on your list.
- Justin is the only devnet deployer (the program keypair isn't shared). Nobody runs `anchor keys sync`.
