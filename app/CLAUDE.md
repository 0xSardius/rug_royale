@AGENTS.md

This is the Rug Royale frontend. Repo-wide rules are in ../CLAUDE.md; visual rules are in ../brand.md.
- Data comes from `@rug-royale/sdk` (decoders, account maps, filters, math, coins). Don't re-derive PDAs or re-implement math here.
- `lib/program.ts` only encodes instructions; `lib/send.ts` signs with the connected wallet and maps program errors to sentences.
- Colors and shadows come from tokens in `app/globals.css` (`bg-primary`, `border-border`, `shadow-brutal`). No hex values in components.
