"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  COINS,
  DEMO_DECIMALS,
  minOutWithSlippage,
  spotPrice,
  swapAccounts,
  swapQuote,
  type DuelRef,
  type Pool,
  type Side,
} from "@rug-royale/sdk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { program } from "@/lib/program";
import { sendIxs, unexpectedError } from "@/lib/send";
import { formatToken } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VaultBalances } from "@/lib/use-duel-live";

const SLIPPAGES = [50, 100, 300]; // bps; 1% default (PRD §11)
// The opening race favors whoever lands first (P2), so swaps pay a small priority fee.
const PRIORITY_MICROLAMPORTS = 20_000;

function parseAmount(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d*(\.\d{0,6})?$/.test(t) || t === "" || t === ".") return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w || "0") * 10n ** BigInt(DEMO_DECIMALS) + BigInt(f.padEnd(DEMO_DECIMALS, "0"));
}

export function TradePanel({
  duelRef,
  pool,
  feeBps,
  balances,
  coinSymbol,
}: {
  duelRef: DuelRef;
  pool: Pool;
  feeBps: number;
  balances: VaultBalances;
  coinSymbol: string;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(100);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const inSymbol = side === "buy" ? COINS.quote.symbol : coinSymbol;
  const outSymbol = side === "buy" ? coinSymbol : COINS.quote.symbol;
  const available = side === "buy" ? balances.quote : balances.coin;
  const raw = parseAmount(amount);
  const quote = useMemo(
    () => (raw && raw > 0n && raw <= available ? swapQuote(side, raw, pool, feeBps) : null),
    [raw, available, side, pool, feeBps],
  );
  const before = spotPrice(pool);
  const impact = quote ? ((spotPrice(quote) - before) / before) * 100 : 0;
  const error =
    amount === "" ? null : raw == null ? "Enter a number with up to 6 decimals." : raw === 0n ? "Enter more than 0." : raw > available ? `You only have ${formatToken(available)} ${inSymbol}.` : quote?.out === 0n ? "Too small: this trade would return nothing." : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!quote || !raw || error) return;
    setBusy(true);
    setMessage(null);
    try {
      const ix = await program.methods
        .swap(side === "buy" ? { buy: {} } : { sell: {} }, new BN(raw.toString()), new BN(minOutWithSlippage(quote.out, slippage).toString()))
        .accountsStrict(swapAccounts(duelRef, wallet.publicKey!))
        .instruction();
      const res = await sendIxs(connection, wallet, [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }),
        ix,
      ]);
      if (res.ok) {
        setAmount("");
        setMessage({ tone: "ok", text: `${side === "buy" ? "Bought" : "Sold"}: ~${formatToken(quote.out)} ${outSymbol} ${side === "buy" ? "in" : "out"}.` });
        await qc.invalidateQueries({ queryKey: ["duel-live", duelRef.duel.toBase58()] });
      } else if (!res.cancelled) setMessage({ tone: "err", text: res.message });
    } catch (err) {
      setMessage({ tone: "err", text: unexpectedError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div role="tablist" aria-label="Trade side" className="grid grid-cols-2">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            onClick={() => {
              setSide(s);
              setAmount("");
              setMessage(null);
            }}
            className={cn(
              "h-11 border-[3px] border-border font-black uppercase focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
              s === "sell" && "-ml-[3px]",
              side === s ? (s === "buy" ? "bg-win text-win-foreground" : "bg-rug text-rug-foreground") : "bg-card",
            )}
          >
            {s} {coinSymbol}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor="amount" className="text-sm font-black uppercase">
              You pay ({inSymbol})
            </label>
            <button
              type="button"
              className="-my-2 -mr-2 min-h-10 px-2 text-xs font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setAmount((Number(available) / 10 ** DEMO_DECIMALS).toFixed(DEMO_DECIMALS).replace(/\.?0+$/, ""))}
            >
              Max {formatToken(available)}
            </button>
          </div>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="amount-help"
            className="h-12 border-[3px] border-border bg-card px-3 font-mono text-xl tabular-nums focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring aria-invalid:border-rug"
          />
          <p id="amount-help" className={cn("text-xs", error ? "font-bold text-rug" : "text-muted-foreground")}>
            {error ?? (quote ? `You get ~${formatToken(quote.out)} ${outSymbol}` : " ")}
          </p>
        </div>

        {quote && !error && (
          <dl className="grid grid-cols-2 gap-1 border-[3px] border-border bg-muted p-2 text-xs">
            <dt>Price impact</dt>
            <dd className={cn("text-right font-mono tabular-nums", Math.abs(impact) > 10 && "font-bold text-rug")}>
              {impact >= 0 ? "+" : ""}
              {impact.toFixed(2)}%
            </dd>
            <dt>Min received ({slippage / 100}% slippage)</dt>
            <dd className="text-right font-mono tabular-nums">{formatToken(minOutWithSlippage(quote.out, slippage))}</dd>
            <dt>Pool fee</dt>
            <dd className="text-right font-mono tabular-nums">{feeBps / 100}%</dd>
          </dl>
        )}

        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Slippage tolerance</legend>
          <span className="text-xs font-bold uppercase" aria-hidden>
            Slippage
          </span>
          {SLIPPAGES.map((bps) => (
            <label
              key={bps}
              className={cn(
                "flex h-10 min-w-12 cursor-pointer items-center justify-center border-2 border-border px-2 font-mono text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                slippage === bps ? "bg-foreground text-background" : "bg-card",
              )}
            >
              <input type="radio" name="slippage" className="sr-only" checked={slippage === bps} onChange={() => setSlippage(bps)} />
              {bps / 100}%
            </label>
          ))}
        </fieldset>

        <Button type="submit" size="lg" variant={side === "buy" ? "primary" : "danger"} loading={busy} disabled={!quote || !!error}>
          {busy ? "Confirm in wallet" : `${side} ${coinSymbol}`}
        </Button>
        {message && (
          <p
            role={message.tone === "err" ? "alert" : "status"}
            className={cn(
              "border-[3px] border-border p-2 text-sm font-bold",
              message.tone === "err" ? "bg-rug text-rug-foreground" : "bg-win text-win-foreground",
            )}
          >
            {message.text}
          </p>
        )}
      </form>
    </Card>
  );
}
