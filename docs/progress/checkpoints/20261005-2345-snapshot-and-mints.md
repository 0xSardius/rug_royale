# Checkpoint: snapshot-and-mints

- **When:** 2026-10-05T23:45:54.253Z
- **Who:** 0xSardius
- **Branch / HEAD:** `main` / 06dc653 STATUS/PRD: snapshot endpoint verified, STONK excluded, devnet mints created
- **Previous checkpoint:** 20261005-2322-idl-freeze-fixtures-devnet.md

## Summary

- Merged the account structs and fixtures to `main` (`e1f8323`, `9961df4`); added `InvalidSeedRatio` (6031).
- `snapshot.ts`: StonkFun top 10 by market cap into `coins.json`, excluding STONK.
- `setup-mints.ts`: 11 Token-2022 demo mints on devnet with authority = MintAuthority PDA; idempotent, verified on-chain.
- `createDemoMintIxs` moved into the SDK, shared by fixtures and the script.

## Decisions

- Merge first, review as follow-up; defaults with deadlines; Tue-noon fallback rule (BUILD_PLAN working agreements).
- STONK is excluded from duel coins (quote mint stands in for it). PRD §10 amended.

## Next

- Justin: SDK decoders; Next.js shell (wallet, lobby, create page reading `coins.json`); devnet suite harness.
- Tue noon: devnet windows final; fallback check on create/join/swap/math PRs.
- After windows are final: `init-config.ts` on devnet.

## Commits since previous checkpoint

- 06dc653 STATUS/PRD: snapshot endpoint verified, STONK excluded, devnet mints created (0xSardius)
- caf8d78 setup-mints.ts: create and verify the 11 devnet demo mints (G11) (0xSardius)
- 01cb95f snapshot.ts: StonkFun top 10 by market cap into coins.json (REQ13) (0xSardius)
- 6fe761e SDK: createDemoMintIxs shared by fixtures and setup-mints (0xSardius)
- 01eb81a Plan: defaults-with-deadlines and Tue-noon fallback rule; STATUS reflects merges (0xSardius)
- d82af6a Add InvalidSeedRatio error (code 6031) for init_config's pool_seed_ratio check (0xSardius)
- 9961df4 Merge test-fixtures: SDK account maps and shared LiteSVM/devnet fixtures (0xSardius)
- e1f8323 Merge idl-freeze-account-structs: full account structs for all 8 handlers, frozen IDL (0xSardius)
- 9feb86f Test fixtures shared by the LiteSVM and devnet suites (0xSardius)
- a461ace SDK: explicit account maps for all 8 instructions (0xSardius)
- cf49e0d init_config stub writes Config fields and bumps (0xSardius)
- 376e222 Full account structs for all 8 handlers; freeze IDL (0xSardius)

## Working tree

```
clean
```

## Verification

- anchor build: PASS

```

Error: A function call in method _ZN149_$LT$rug_royale..instructions..close_duel..CloseDuel$u20$as$u20$anchor_lang..Accounts$LT$rug_royale..instructions..close_duel..CloseDuelBumps$GT$$GT$12try_accounts17hbdb5f8f739a285d8E overwrites values in the frame. Please, decrease stack usage or remove parameters from the call. The function call may cause undefined behavior during execution.

Error: A function call in method _ZN149_$LT$rug_royale..instructions..close_duel..CloseDuel$u20$as$u20$anchor_lang..Accounts$LT$rug_royale..instructions..close_duel..CloseDuelBumps$GT$$GT$12try_accounts17hbdb5f8f739a285d8E overwrites values in the frame. Please, decrease stack usage or remove parameters from the call. The function call may cause undefined behavior during execution.

    Finished `release` profile [optimized] target(s) in 0.28s
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.21s
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
  fixtures
    ✔ creates Token-2022 mints owned by the MintAuthority PDA and inits Config (104ms)
      create_duel CU (stub handler, accounts only): 130957
    ✔ create_duel initializes duel, escrow, pool, and all four token accounts (68ms)
    ✔ can warp the LiteSVM clock


  3 passing (188ms)
```
