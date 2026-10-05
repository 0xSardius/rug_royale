# Brand: Rug Royale

_Status: active (functional pass, 2026-10-05). Polish pass planned Thu Oct 8._

## Direction
Neo-brutalist. Loud, flat, honest: thick black borders, hard offset shadows, no gradients, no blur, square corners. It should feel like a fight poster, not a fintech dashboard. Built custom on tokens rather than shadcn, because the look depends on borders and shadows that would mean overriding most of shadcn's defaults.

## Palette (tokens in `app/app/globals.css`)
| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#fff8e7` cream | `#121212` | Page |
| `foreground` / `border` | `#0a0a0a` | `#fff8e7` | Text, 3px borders, shadows |
| `card` | `#ffffff` | `#1d1d1d` | Surfaces |
| `muted` / `muted-foreground` | `#f1e9d2` / `#4a4a4a` | `#2a2a2a` / `#c9c2ae` | Empty states, helper text |
| `primary` | `#ffd400` yellow | same | Main actions, selected state |
| `accent` | `#ff4fa3` pink | same | Secondary call to action, live duels |
| `win` | `#22d37a` green | same | You Win!, settled |
| `rug` | `#ff3b2f` red | same | You Lose!, errors, logo |
| `devnet` | `#ff9f1c` orange | same | Network badge, notices |
| `ring` | `#2f6bff` | `#7aa2ff` | Focus ring (4px) |

Text on every colored fill is `#0a0a0a` in both themes (the `*-foreground` tokens), which passes AA.

## Shape and depth
- Borders: `border-[3px] border-border` on surfaces and controls; `border-2` on badges.
- Shadows: `shadow-brutal-sm` (2px), `shadow-brutal` (4px), `shadow-brutal-lg` (6px). All hard and offset, with no blur.
- Radius: none.
- Buttons lift 2px on hover and sink into their shadow on press (transform and box-shadow only, 100 ms, off under reduced motion).

## Type
- Sans: Space Grotesk. Headlines use `font-black uppercase tracking-tight`.
- Mono: JetBrains Mono with `tabular-nums` for every amount, address, and timer.

## Voice
Short, punchy, a little cocky: "Same coin. Same pool. One survivor." Plain about money: say exactly what gets escrowed and who gets paid.
