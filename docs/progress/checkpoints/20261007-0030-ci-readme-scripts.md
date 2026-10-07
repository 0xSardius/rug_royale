# Checkpoint: ci-readme-scripts

- **When:** 2026-10-07T00:30:52.988Z
- **Who:** 0xSardius
- **Branch / HEAD:** `main` / bc4fc80 README/CLAUDE.md/STATUS: init-config and crank commands, progress
- **Previous checkpoint:** 20261006-0000-frontend-shell.md

## Summary

- Light CI on every PR and push to main: Rust unit tests, typecheck, prettier, math + vectors + crank plan, frontend build and lint. First run green in under a minute per job.
- README has the architecture as 7 Mermaid diagrams (render-checked), the program ID, how a duel works, payout math, run steps, and known limits. Placeholders remain for the devnet test screenshot and CU numbers.
- `init-config.ts`: dry run by default (simulation ok on devnet, 14,802 CU); `--send` initializes and diffs.
- `crank.ts` with a pure, unit-tested planner (`scripts/lib/crank-plan.ts`).

## Decisions

- Light CI only (no Solana toolchain); program PRs paste a local `pnpm test` summary. PRD §13 amended.
- Worked only in files that don't overlap Yamin's incoming PR (math, swap, settle, errors).

## Next

- Review and merge Yamin's PR (rebase onto main; check the swap/settle structs and the vectors).
- Tue noon: windows final → `pnpm init-config --send`.
- Justin: Vercel; devnet suite harness once create/join land; trading UI (§11 states 3–5).

## Commits since previous checkpoint

- bc4fc80 README/CLAUDE.md/STATUS: init-config and crank commands, progress (0xSardius)
- 67818b9 crank.ts: settle, cancel, close finished duels (REQ14) (0xSardius)
- 77441b2 init-config.ts: Config from coins.json + PRD §5 defaults (REQ01) (0xSardius)
- f1cb702 README: architecture in Mermaid, program ID, how a duel works (0xSardius)
- ec4c958 PRD §13/CLAUDE.md: describe what CI covers and what stays local (0xSardius)
- 84fe79b Light CI: Rust unit tests, typecheck, math vectors, frontend build (0xSardius)

## Working tree

```
clean
```

## Verification

- anchor build: PASS

```

Error: A function call in method _ZN149_$LT$rug_royale..instructions..close_duel..CloseDuel$u20$as$u20$anchor_lang..Accounts$LT$rug_royale..instructions..close_duel..CloseDuelBumps$GT$$GT$12try_accounts17hbdb5f8f739a285d8E overwrites values in the frame. Please, decrease stack usage or remove parameters from the call. The function call may cause undefined behavior during execution.

Error: A function call in method _ZN149_$LT$rug_royale..instructions..close_duel..CloseDuel$u20$as$u20$anchor_lang..Accounts$LT$rug_royale..instructions..close_duel..CloseDuelBumps$GT$$GT$12try_accounts17hbdb5f8f739a285d8E overwrites values in the frame. Please, decrease stack usage or remove parameters from the call. The function call may cause undefined behavior during execution.

    Finished `release` profile [optimized] target(s) in 0.35s
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.23s
     Running unittests src/lib.rs (/home/sardius/solana-dev/projects/turbin3/capstone/rug_royale/target/debug/deps/rug_royale-17d80b433386d029)
```

- cargo test: PASS

```

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

   Doc-tests rug_royale

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

- ts tests: PASS

```
  sdk
    ✔ decodes a Duel with plain types and null for unset pubkeys
    ✔ lobby filters select by status, creator, and opponent
    ✔ decodes Config written by init_config (52ms)
    ✔ maps every program error code to a message


  23 passing (250ms)
```
