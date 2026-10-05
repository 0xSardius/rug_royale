# Checkpoint: idl-freeze-fixtures-devnet

- **When:** 2026-10-05T23:22:28.896Z
- **Who:** 0xSardius
- **Branch / HEAD:** `main` / be4b61c STATUS: IDL branch and fixtures in review, stub deployed to devnet
- **Previous checkpoint:** 20261005-2308-plan-rebaseline.md

## Summary

- Branch `idl-freeze-account-structs` has full `#[derive(Accounts)]` for all 8 handlers (PRD §6), the frozen `idl/` committed, and `init_config` writing Config fields (checks still TODO). Not merged; awaiting owner review.
- Branch `test-fixtures` (stacked) has SDK account maps for all 8 instructions and `tests/fixtures.ts`, with LiteSVM and RPC senders shared by both suites. Its 3 harness tests pass, including `create_duel` creating all 7 accounts.
- Stub program deployed to devnet; the address is locked. The on-chain IDL upload failed (not blocking).

## Decisions

- Proceed without waiting on the team; program changes go on review branches.
- Typed errors stay in handlers (PRD check order); account structs hold structural checks only.
- `create_duel` clients send a 400k compute-unit limit (about 143k used on inits).

## Next

- Sidharth and Yamin: review `idl-freeze-account-structs`; answer devnet windows and the `pool_seed_ratio` error.
- Justin: `snapshot.ts`, `setup-mints.ts` (§10); SDK decoders; devnet suite harness on top of `RpcSender`.
- Yamin: `math/` + Rust unit tests (§7).

## Commits since previous checkpoint (main only; branch commits: 376e222, cf49e0d, a461ace, 9feb86f)

- be4b61c STATUS: IDL branch and fixtures in review, stub deployed to devnet (0xSardius)
- a408b2e STATUS: confirm Oct 11 deadline, Oct 10 internal target (0xSardius)

## Working tree

```
clean
```

## Verification

_Not run. Use `pnpm checkpoint <slug> --verify` to record build and test results._
