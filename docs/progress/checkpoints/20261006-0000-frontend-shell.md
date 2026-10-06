# Checkpoint: frontend-shell

- **When:** 2026-10-06T00:00:12.739Z
- **Who:** 0xSardius
- **Branch / HEAD:** `main` / 0978756 CLAUDE.md/STATUS: frontend commands and progress
- **Previous checkpoint:** 20261005-2350-sdk-complete.md

## Summary

- Frontend shell on Next.js 16: wallet adapter (Wallet Standard), React Query over the SDK, neo-brutalist tokens with light and dark themes (`brand.md`).
- Lobby (open duels + My duels), create page (coin picker from `coins.json`, validated form, payout summary), duel page (details, invite link, join flow).
- Checked in headless Chromium at 375 and 1280 px, light and dark: no console errors. Fixed dark-mode nav contrast, a wrapping button, and a missing tip row in the summary.
- `next build` and lint clean.

## Decisions

- Custom token-based components instead of shadcn for the brutalist look (`brand.md`).
- Create page falls back to PRD §5 defaults with a banner while Config is absent on devnet.

## Next

- Justin: Vercel deploy (needs Justin's Vercel login); devnet suite harness.
- Tue noon: windows final → `init-config.ts`; fallback check on create/join/swap/math.
- Wed–Thu: trading panel, PnL bars, Settle button, result popup (§11 states 3–5).

## Commits since previous checkpoint

- 0978756 CLAUDE.md/STATUS: frontend commands and progress (0xSardius)
- 30fde67 Duel page: details, invite link, join flow (PRD §11 states 1-2) (0xSardius)
- 3df7ceb Create duel page (REQ02) (0xSardius)
- 3ec7c22 Lobby: open duels and My duels (REQ11) (0xSardius)
- 0eae406 Frontend shell: Next.js 16, wallet adapter, neo-brutalist tokens (brand.md) (0xSardius)
- 27561b7 SDK: typed coins.json (Coin, CoinsFile, COINS, coinByDemoMint) (0xSardius)

## Working tree

```
clean
```

## Verification

- anchor build: PASS

```

Error: A function call in method _ZN149_$LT$rug_royale..instructions..close_duel..CloseDuel$u20$as$u20$anchor_lang..Accounts$LT$rug_royale..instructions..close_duel..CloseDuelBumps$GT$$GT$12try_accounts17hbdb5f8f739a285d8E overwrites values in the frame. Please, decrease stack usage or remove parameters from the call. The function call may cause undefined behavior during execution.

Error: A function call in method _ZN149_$LT$rug_royale..instructions..close_duel..CloseDuel$u20$as$u20$anchor_lang..Accounts$LT$rug_royale..instructions..close_duel..CloseDuelBumps$GT$$GT$12try_accounts17hbdb5f8f739a285d8E overwrites values in the frame. Please, decrease stack usage or remove parameters from the call. The function call may cause undefined behavior during execution.

    Finished `release` profile [optimized] target(s) in 0.34s
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.30s
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
    ✔ decodes Config written by init_config (50ms)
    ✔ maps every program error code to a message


  19 passing (255ms)
```
