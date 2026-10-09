"use client";

import { finalValue, pnlBps, type Pool } from "@rug-royale/sdk";
import { Card } from "@/components/ui/card";
import { formatToken } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VaultBalances } from "@/lib/use-duel-live";

/**
 * "Value if sold now" for both players, using the exact valuation settle uses (PRD §7), so
 * the bars at the buzzer match the result. Bars scale to ±10% PnL (the sim's typical gap
 * between players is ~4.6%).
 */
export function PnlBars({
  pool,
  feeBps,
  bankroll,
  rows,
}: {
  pool: Pool;
  feeBps: number;
  bankroll: bigint;
  rows: { label: string; balances: VaultBalances; highlight?: boolean }[];
}) {
  const values = rows.map((r) => finalValue(r.balances.quote, r.balances.coin, pool, feeBps));
  const leader = values.length === 2 && values[0] !== values[1] ? (values[0] > values[1] ? 0 : 1) : -1;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-black uppercase">Value if sold now</h2>
      {rows.map((r, i) => {
        const bps = pnlBps(values[i], bankroll);
        const pct = bps / 100;
        const width = Math.min(Math.abs(pct) / 10, 1) * 50;
        const up = bps >= 0;
        return (
          <div key={r.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-bold uppercase">
                {r.label}
                {leader === i && <span className="ml-2 border-2 border-border bg-primary px-1 text-xs text-primary-foreground">Leading</span>}
              </span>
              <span className="font-mono tabular-nums">
                {formatToken(values[i])}{" "}
                <span className={cn("font-bold", up ? "text-foreground" : "text-rug")}>
                  {up ? "▲ +" : "▼ "}
                  {pct.toFixed(2)}%
                </span>
              </span>
            </div>
            <div
              className={cn("relative h-6 border-[3px] border-border bg-muted", r.highlight && "shadow-brutal-sm")}
              role="img"
              aria-label={`${r.label}: ${pct.toFixed(2)}% vs starting bankroll`}
            >
              <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-border" aria-hidden />
              <div
                className={cn(
                  "absolute inset-y-0 transition-[width] duration-300 motion-reduce:transition-none",
                  up ? "left-1/2 bg-win" : "right-1/2 bg-rug",
                )}
                style={{ width: `${width}%` }}
                aria-hidden
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Quote balance plus a fee-inclusive sell of the coin balance at the current pool price, the same formula settle uses.
      </p>
    </Card>
  );
}
