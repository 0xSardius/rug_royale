# Checkpoint: cancel-devnet-trading-ui

- **When:** 2026-10-09T01:37:48.571Z
- **Who:** 0xSardius
- **Branch / HEAD:** `main` / c46e896 STATUS: trading UI states 3-5 done (wallet test pending)
- **Previous checkpoint:** 20261008-0023-handlers-and-devnet-upgrade.md

## Summary

- Reviewed and merged Yamin's #3 (sim → ratio 5), #4 (`settle`), #5 (`close_duel`); re-merged #5, which had landed on the `settle` branch after it merged.
- Config initialized on devnet (ratio 5, fee 30, windows [30, 120, 300, 900]); Config/Duel/Pool layouts frozen.
- `cancel_duel` (Justin) + 10 tests; devnet upgraded (needed a manual 10,240-byte extend); 1.26 SOL reclaimed from failed-deploy buffers.
- Devnet suite: 19 passing (winner, tie, cancelled duel, 12+ typed errors); `pnpm test:devnet 2>/dev/null` gives clean output for the screenshot.
- README CU table; team docs updated (Sidharth withdrew). Trading UI: live data hook, PnL bars, trade panel, Settle/Cancel, result card, popup, dev `/preview`.

## Decisions

- Team is Justin + Yamin. Yamin: `sponsor_prize`, freeroll devnet scenario, deck draft. Justin: rest of the list below.
- Work modularly: one piece at a time, check in before moving on.

## Next

Justin, one at a time:
1. Test the trading UI with a real wallet (Phantom on devnet): create → join (second wallet) → trade → settle → popup. Fix what breaks.
2. Small UI fix: enlarge the trade panel's "Max" hit target (40 px).
3. Vercel deploy (needs Justin's login) + optional Helius key.
4. README screenshot of `pnpm test:devnet 2>/dev/null` after Yamin's `sponsor_prize` lands.
5. Recordings + demo script.
Loose end: devnet duel `CYMKpTW8g7R8k1hdmwEEDvHnmLqLQFg59raK6L16jjZL` (test duel, 0.01 SOL entries) is ended but unsettled; `pnpm crank --once` settles it, then closes it 10 min later.

## Commits since previous checkpoint

- c46e896 STATUS: trading UI states 3-5 done (wallet test pending) (0xSardius)
- 555f717 Dev-only /preview page for wallet-gated components (0xSardius)
- f85ee45 Duel page: live trading states 3-5 (PRD §11) (0xSardius)
- 426ab0d Frontend: result card and You Win!/You Lose! popup (0xSardius)
- adfab3c Frontend: Settle and Cancel buttons (any wallet) (0xSardius)
- 2d1111c Frontend: trade panel (Buy/Sell, live quote, slippage, priority fee) (0xSardius)
- e210eeb Frontend: PnL bars (value if sold now, both players) (0xSardius)
- efe17bc Frontend: useDuelLive (duel, pool, 4 vault balances in one RPC call) (0xSardius)
- 0e88210 README: measured CU for every handler; devnet suite summary (0xSardius)
- 1ed4963 Devnet suite: cancelled duel C (DeadlineNotReached, cancel, close) (0xSardius)
- 7972252 RpcSender.fund: verify balance before retrying a reported failure (0xSardius)
- f121915 Team: Sidharth withdrew; reassign his items to Justin and Yamin (0xSardius)
- 7b9b709 Tests: cancel_duel refunds, guards, I8 from both sides, cancel -> close (0xSardius)
- b16dd2b cancel_duel: PRD §6.7 handler (0xSardius)
- da27690 README/CLAUDE.md/STATUS: devnet suite passing (0xSardius)
- b026552 RpcSender: poll signature status instead of websocket confirms (0xSardius)
- f368990 Devnet suite: full duels against the deployed program (graded) (0xSardius)
- 083f2aa STATUS: Config initialized on devnet; layouts frozen (0xSardius)
- eff36d2 STATUS: mark #3/#4/#5 done (0xSardius)
- f47ce0b STATUS: settle, close_duel, sim done; stacked-PR merge note (0xSardius)
- 6b9ca83 crank: treat a lost close race as beaten (0xSardius)
- 74be06b Tests: close-duel-accounts uses real create -> join -> settle (0xSardius)
- d7ac914 Merge close_duel (#5) into main (0xSardius)
- afd4612 Merge pull request #5 from 0xSardius/close-duel (Sardius)
- 6b559c8 Merge pull request #4 from 0xSardius/settle (Sardius)
- 6d2980b Merge branch 'main' into settle (Sardius)
- dbe51bd Merge pull request #3 from 0xSardius/sim (Sardius)
- 0bed68c close_duel: PRD §6.8 effects (burn + close) and the 3 review fixes (Raad05)
- ca48aa2 settle: PRD §6.6 handler and LiteSVM tests (Raad05)
- e751a3d sim.ts: PRD §10.5 duel sim; set pool_seed_ratio = 5, swap_fee_bps = 30 (Raad05)

## Working tree

```
clean
```

## Verification

- anchor build: PASS

```
Finished `release` profile [optimized] target(s) in 0.30s
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.17s
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
      ✔ WrongPool: another duel's pool fails on seeds (72ms)
      ✔ I10: a player cannot move the other player's vaults (60ms)
    invariants
      ✔ I9: the window is [start_ts, end_ts) (72ms)
      ✔ I3, I4, I5, I12 over 200 random swaps (1256ms)


  108 passing (6s)
```
