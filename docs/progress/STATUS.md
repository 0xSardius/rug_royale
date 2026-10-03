# Rug Royale: Status

The live picture of where the build stands. Update it whenever a task finishes, a gate passes, or a decision is made. History lives in `checkpoints/`; this file is only the present.

**Last updated:** 2026-10-03 · **Latest checkpoint:** `checkpoints/20261003-2213-repo-scaffold.md`
**Deadline:** submit Sat 2026-10-10 (Turbin3 deadline 2026-10-11) · **Feature freeze:** Fri 2026-10-09 noon

## Daily gates (PRD §12)

- [x] Sat Oct 3: decisions locked (G1, G3, G9, split), repo scaffold, `CLAUDE.md`
- [ ] Sun Oct 4: all 8 handlers stubbed with full account structs; **IDL frozen**
- [ ] Mon Oct 5: first devnet deploy (partial)
- [ ] Tue Oct 6: full LiteSVM suite green
- [ ] Wed Oct 7: end-to-end duel on devnet by script
- [ ] Thu Oct 8: end-to-end duel in the browser; safety video take
- [ ] Fri Oct 9: bug bash (win, tie, freeroll, cancel, late settle); freeze at noon; final video
- [ ] Sat Oct 10: README, video linked, submitted

## Work by owner

Status values: `todo` · `doing` · `review` · `done`.

### Sidharth: lifecycle and escrow
| Item | PRD | Status |
| --- | --- | --- |
| `init_config` + tests | 6.1 | todo |
| `create_duel` + tests (record CU) | 6.2 | todo |
| `join_duel` + tests | 6.4 | todo |
| `sponsor_prize` + tests | 6.3 | todo |
| `cancel_duel` + tests | 6.7 | todo |
| `close_duel` (burn + close) + tests | 6.8 | todo |
| Invariants I8–I11, I13 | 9 | todo |

### Yamin: math and trading
| Item | PRD | Status |
| --- | --- | --- |
| `math/` amm, valuation, payout + Rust unit tests | 7 | todo |
| `swap` + tests; I3–I5 | 6.5, 9 | todo |
| `settle` + payout tests; I1, I2, I6, I7; scenarios 1–5 | 6.6, 9 | todo |
| `sim.ts`, tune `pool_seed_ratio` / fee | 10 | todo |

### Justin: SDK, scripts, frontend, demo
| Item | PRD | Status |
| --- | --- | --- |
| Repo scaffold, `CLAUDE.md`, checkpoint system | 4, 14 | done |
| SDK: PDAs, lobby offsets | 4, 5 | done |
| SDK: decoders, `math.ts` mirror (I12) | 7, 9 | todo |
| `snapshot.ts`, `setup-mints.ts` | 10 | todo |
| `init-config.ts`, `crank.ts` | 10 | todo |
| Frontend: shell, wallet, lobby, create | 11 | todo |
| Frontend: duel page states 1–5, result popup | 11 | todo |
| README, demo video | 13 | todo |

## Open questions

- **Program keypair.** `target/deploy/rug_royale-keypair.json` is gitignored. Program ID `5USpVpECZNcq4ZjRUyATb9ykcSRzZ29vHDwNMYFwNJWE` comes from Justin's local key; share that keypair out of band before the first devnet deploy, or everyone else's `anchor build` will produce a different ID.
- **`pool_seed_ratio >= 1` error.** PRD §6.1 requires the check but §8 names no error for it. Pick an existing variant or amend the PRD before adding a 32nd.
- **StonkFun API endpoint.** Verify the path at stonkfun.xyz/developers (PRD §10).
- **Video rubric.** Does Turbin3 set a length limit or required sections? Check before Thursday (PRD §13).

## Decision log

Newest first. Anything that changes the PRD gets a line here **and** an edit to `docs/prd.md`.

- 2026-10-03: Pinned Anchor **1.1.2** (installed locally; 1.2.0 exists). Crates pinned with `=1.1.2` so CLI and crate versions match.
- 2026-10-03: TS tests use `litesvm@0.8.0` (last web3.js v1 line) with the `@anchor-lang/core` IDL client, run by mocha with the `tsx` loader. `litesvm@1.x` moved to `@solana/kit` and does not pair with the Anchor TS client.
- 2026-10-03: Team confirmed G1 (program-owned Escrow), G3 (Token-2022 with no extensions), G9 (fixed Duel layout), and the owner split.
