# Checkpoint: handlers-and-devnet-upgrade

- **When:** 2026-10-08T00:23:40.128Z
- **Who:** 0xSardius
- **Branch / HEAD:** `main` / 71b119e STATUS: devnet upgraded; init-config waits for sim.ts tuning
- **Previous checkpoint:** 20261007-0030-ci-readme-scripts.md

## Summary

- Merged Yamin's #1 (math, 855/855 vectors) and #2 (swap, 17 tests) after review; the `bnToBigInt` fix reproduces.
- Justin (fallback, Sidharth out sick): `create_duel`, `join_duel`, `init_config` checks, `close_duel` guards. Fixed the `CloseDuel` stack overflow found by Yamin.
- Pre-deploy reviews: join griefing (idempotent vault creation), self-invite rejected; 3 `close_duel` findings recorded for when its effects are written.
- Devnet program upgraded and byte-verified. 78 TS + 18 Rust tests passing.

## Decisions

- `init-config --send` waits for `sim.ts` (ratio, fee). Windows `[30, 120, 300, 900]` final.
- Handlers create ATAs by CPI after checks where a typed error must beat `init` (join_duel).
- `create_duel` rejects `allowed_opponent == creator` (PRD §6.2 amended).

## Next

- Yamin: `settle` + `sim.ts` → then `init-config --send` (Justin).
- Before any redeploy with settle/cancel: `close_duel` effects with the 3 review fixes (handler TODO).
- Justin: devnet suite harness; trading UI; `cancel_duel` / `sponsor_prize` if Sidharth stays out.

## Commits since previous checkpoint

- 71b119e STATUS: devnet upgraded; init-config waits for sim.ts tuning (0xSardius)
- dc45483 PRD §6.2/STATUS: review fixes, init_config done (0xSardius)
- 5ab0f47 init_config: PRD §6.1 checks (0xSardius)
- 049d11f create_duel: reject allowed_opponent == creator (OpponentNotAllowed) (0xSardius)
- a744aed join_duel: create opponent vaults idempotently (anti-griefing) (0xSardius)
- b679cd0 close_duel: record review findings; must land before settle/cancel deploy (0xSardius)
- e881e09 Tests: close_duel refuses Open and Active duels; escrow untouched (0xSardius)
- 9752bc0 close_duel: PRD §6.8 guard checks before devnet deploy (0xSardius)
- 1afd564 STATUS: join_duel done (Justin, fallback); init-vs-check ordering note (0xSardius)
- 3d84ecd Tests: join_duel with real create + join (0xSardius)
- 45890db Fixture: injectActiveDuel writes a future join_deadline before joining (0xSardius)
- f4986a7 join_duel: PRD §6.4 handler (0xSardius)
- f662e55 STATUS: create_duel done (Justin, fallback), join_duel next (0xSardius)
- d4276d1 Prettier: fixtures.test.ts (0xSardius)
- df44144 Tests: create_duel happy path, every typed error, check order (0xSardius)
- 518619c create_duel: PRD §6.2 handler (0xSardius)
- 071f163 STATUS: #1/#2 merged, close_duel stack fix noted for Sidharth (0xSardius)
- 1abd179 Test: close_duel rejects a decoy token account, accepts canonical ATAs (0xSardius)
- 673f409 close_duel: fix try_accounts stack overflow (4,736 > 4,096 bytes) (0xSardius)
- d2f07c1 Merge pull request #1 from 0xSardius/math (Sardius)
- 39c6eab Merge pull request #2 from 0xSardius/swap (Sardius)
- 5cce40c swap: PRD §6.5 handler, config account, LiteSVM tests (Raad05)
- 82e528e SDK: convert BN to bigint via hex (bnToBigInt) (Raad05)
- ed0d3bb math/valuation, math/payout: PRD §7 settle math (Raad05)
- 8636082 math/amm: PRD §7 buy/sell with fee, checked u128 math (Raad05)

## Working tree

```
clean
```

## Verification

- anchor build: PASS

```
Finished `release` profile [optimized] target(s) in 0.31s
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.19s
     Running unittests src/lib.rs (/home/sardius/solana-dev/projects/turbin3/capstone/rug_royale/target/debug/deps/rug_royale-645f2dd02331154a)
```

- cargo test: PASS

```

test result: ok. 18 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

   Doc-tests rug_royale

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

- ts tests: PASS

```
      ✔ WrongPool: another duel's pool fails on seeds (71ms)
      ✔ I10: a player cannot move the other player's vaults (58ms)
    invariants
      ✔ I9: the window is [start_ts, end_ts) (68ms)
      ✔ I3, I4, I5, I12 over 200 random swaps (1081ms)


  78 passing (4s)
```
