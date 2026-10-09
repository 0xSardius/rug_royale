"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DuelResult, payout, pnlBps, type Config, type Duel } from "@rug-royale/sdk";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatSol, formatToken } from "@/lib/format";
import { cn } from "@/lib/utils";

type Outcome = "win" | "lose" | "tie";

/** The player's outcome, or null for spectators. */
export function outcomeFor(duel: Duel, wallet: string | null): Outcome | null {
  if (!wallet) return null;
  const isCreator = duel.creator.toBase58() === wallet;
  const isOpponent = duel.opponent?.toBase58() === wallet;
  if (!isCreator && !isOpponent) return null;
  if (duel.result === DuelResult.Tie) return "tie";
  return (duel.result === DuelResult.Creator) === isCreator ? "win" : "lose";
}

export function ResultCard({ duel, config }: { duel: Duel; config: Config | null }) {
  const p = config
    ? payout({
        entryLamports: duel.entryLamports,
        sponsoredLamports: duel.sponsoredLamports,
        settlerTipLamports: config.settlerTipLamports,
        rakeBps: config.rakeBps,
        result: duel.result as 1 | 2 | 3,
      })
    : null;
  const pct = (v: bigint) => (pnlBps(v, duel.bankroll) / 100).toFixed(2);
  const winner =
    duel.result === DuelResult.Tie ? "Tie: nobody got rugged" : duel.result === DuelResult.Creator ? "Creator wins" : "Opponent wins";

  return (
    <Card className="flex flex-col gap-4 bg-win text-win-foreground">
      <Badge tone="muted" className="self-start">
        Settled
      </Badge>
      <h2 className="text-2xl font-black uppercase">{winner}</h2>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt>Creator final</dt>
        <dd className="text-right font-mono tabular-nums">
          {formatToken(duel.finalA)} ({pct(duel.finalA)}%)
        </dd>
        <dt>Opponent final</dt>
        <dd className="text-right font-mono tabular-nums">
          {formatToken(duel.finalB)} ({pct(duel.finalB)}%)
        </dd>
        {p && duel.result !== DuelResult.Tie && (
          <>
            <dt className="font-bold">Prize</dt>
            <dd className="text-right font-mono font-bold tabular-nums">{formatSol(p.prize)} SOL</dd>
            <dt>Rake</dt>
            <dd className="text-right font-mono tabular-nums">{formatSol(p.rake)} SOL</dd>
            <dt>Settler tip</dt>
            <dd className="text-right font-mono tabular-nums">{formatSol(p.tip)} SOL</dd>
          </>
        )}
        {p && duel.result === DuelResult.Tie && (
          <>
            <dt className="font-bold">Refunded</dt>
            <dd className="text-right font-mono font-bold tabular-nums">{formatSol(duel.entryLamports)} SOL each</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

const seenKey = (duel: string, wallet: string) => `rug-royale:seen:${duel}:${wallet}`;

/**
 * Full-screen You Win! / You Lose! moment (LOI). Shown once per duel per wallet (localStorage),
 * driven by Duel.status so a player who was offline still sees it (RT-8, P5). Animations are
 * under 3 s and off under prefers-reduced-motion. Escape, the button, or the backdrop dismiss it.
 */
export function ResultPopup({ duel, wallet, prizeLamports }: { duel: Duel & { address: { toBase58(): string } }; wallet: string | null; prizeLamports: bigint }) {
  const outcome = outcomeFor(duel, wallet);
  const key = wallet ? seenKey(duel.address.toBase58(), wallet) : null;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Read during render: there is no wallet on the server, so no popup and no hydration mismatch.
  const seenBefore = useMemo(() => {
    if (!key || typeof window === "undefined") return true;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false; // storage blocked: show it anyway
    }
  }, [key]);
  const open = !!outcome && !!key && !seenBefore && dismissedKey !== key;

  const dismiss = useCallback(() => {
    setDismissedKey(key);
    try {
      if (key) localStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  }, [key]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open || !outcome) return null;
  const win = outcome === "win";
  const tie = outcome === "tie";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4",
        win ? "bg-win/95" : tie ? "bg-primary/95" : "bg-rug/95",
      )}
      onClick={dismiss}
    >
      {win && <Confetti />}
      <div
        className={cn(
          "relative flex max-w-md flex-col items-center gap-4 border-[3px] border-border bg-card p-8 text-center text-card-foreground shadow-brutal-lg",
          "motion-safe:animate-[rr-pop_400ms_ease-out]",
          outcome === "lose" && "motion-safe:animate-[rr-rug_900ms_ease-in-out]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="result-title" className="text-5xl font-black uppercase tracking-tight">
          {win ? "You win!" : tie ? "It's a tie" : "You lose!"}
        </h2>
        <p className="text-lg">
          {win
            ? prizeLamports > 0n
              ? `+${formatSol(prizeLamports)} SOL is in your wallet.`
              : "Bragging rights secured."
            : tie
              ? "Nobody traded, so your entry came back."
              : "You got rugged. The pool remembers."}
        </p>
        <Button ref={closeRef} variant={win ? "primary" : "secondary"} size="lg" onClick={dismiss}>
          {win ? "Collect glory" : "Run it back"}
        </Button>
      </div>
    </div>
  );
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => i);
const CONFETTI_TONES = ["bg-primary", "bg-accent", "bg-card", "bg-rug"];

function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
      {CONFETTI.map((i) => (
        <span
          key={i}
          className={cn("absolute top-[-5%] h-3 w-2 border border-border", CONFETTI_TONES[i % CONFETTI_TONES.length])}
          style={{
            left: `${(i * 37) % 100}%`,
            animation: `rr-confetti ${1.6 + (i % 5) * 0.25}s ${(i % 7) * 0.08}s ease-in forwards`,
            transform: `rotate(${(i * 53) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}
