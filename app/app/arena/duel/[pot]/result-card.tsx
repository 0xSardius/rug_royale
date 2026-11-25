"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import { Card } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatSol, formatWindow, truncateAddress } from "@/lib/format";
import { formatMicroUsd, formatUsdPrice } from "@/lib/v2/format";

export interface ResultData {
  creator: PublicKey;
  opponent: PublicKey;
  result: number;
  /** Micro-USD, [creator, opponent]. */
  finalValues: [bigint, bigint];
  /** Lamports paid to the winner (0 in an unsponsored free duel). */
  prize: bigint;
  /** Micro-USD; null when the arena is unknown (closed duel). */
  bankroll: bigint | null;
  trades?: [number, number];
  /** Held assets' final marks. */
  marks?: { symbol: string; price: number }[];
  settleSignature?: string;
  /** For the rematch link; omitted when the duel's accounts are gone. */
  rematch?: { arenaId: number; windowSecs: number; entryLamports: bigint };
}

const explorer = (kind: "tx" | "address", id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

export function ResultCard({ data }: { data: ResultData }) {
  const { publicKey } = useWallet();
  const [copied, setCopied] = useState(false);
  const mySeat = !publicKey ? null : publicKey.equals(data.creator) ? 0 : publicKey.equals(data.opponent) ? 1 : null;
  const tie = data.result === v2.MatchResult.Tie;
  const winnerSeat = data.result === v2.MatchResult.Creator ? 0 : data.result === v2.MatchResult.Opponent ? 1 : null;
  const players = [data.creator, data.opponent];
  const name = (i: number) => (mySeat === i ? "You" : truncateAddress(players[i]));
  const pct = (v: bigint) => (data.bankroll ? v2.pnlBps(v, data.bankroll) / 100 : null);

  const headline = tie
    ? "It's a tie"
    : mySeat === null
      ? `${name(winnerSeat!)} won`
      : mySeat === winnerSeat
        ? "You won"
        : "You got rugged";
  const won = mySeat !== null && mySeat === winnerSeat;
  const other = mySeat === null ? null : players[1 - mySeat];

  function shareText() {
    const p = [0, 1].map((i) => pct(data.finalValues[i]));
    const fmt = (x: number | null) => (x == null ? "" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`);
    if (tie) return `Dead heat in a Rug Royale duel. Same bankroll, live prices, nobody blinked.`;
    const w = winnerSeat!;
    return won
      ? `I just won a Rug Royale trading duel: ${fmt(p[w])} vs ${fmt(p[1 - w])}. Same bankroll, live Solana prices, winner takes the pot.`
      : `${fmt(p[w])} vs ${fmt(p[1 - w])} in a Rug Royale trading duel. Same bankroll, live Solana prices, winner takes the pot.`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions, insecure context); the URL bar still works.
    }
  }

  function postToX() {
    const u = new URL("https://x.com/intent/post");
    u.searchParams.set("text", shareText());
    u.searchParams.set("url", window.location.href);
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  }

  const rematchHref =
    data.rematch && other
      ? `/arena/create?${new URLSearchParams({
          arena: String(data.rematch.arenaId),
          window: String(data.rematch.windowSecs),
          entry: formatSol(data.rematch.entryLamports),
          opponent: other.toBase58(),
        })}`
      : other
        ? `/arena/create?${new URLSearchParams({ opponent: other.toBase58() })}`
        : null;

  return (
    <Card className={cn("flex flex-col gap-5", won ? "bg-win text-win-foreground" : tie ? "bg-muted" : "bg-card")}>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase">
          Final result{data.rematch && <> · {formatWindow(data.rematch.windowSecs)} duel</>}
        </span>
        <h2 className="text-4xl font-black uppercase leading-none md:text-5xl">{headline}</h2>
        {!tie && (
          <p className="text-sm font-bold">
            {data.prize > 0n
              ? `${name(winnerSeat!)} ${mySeat === winnerSeat ? "take" : "takes"} ${formatSol(data.prize)} SOL, paid out on Solana.`
              : "Free duel: bragging rights only."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => {
          const p = pct(data.finalValues[i]);
          return (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-1 border-[3px] border-border bg-card p-3 text-card-foreground",
                winnerSeat === i && "shadow-brutal",
              )}
            >
              <span className="text-xs font-bold uppercase">
                {name(i)}
                {winnerSeat === i && " · winner"}
              </span>
              <span className="font-mono text-xl font-black tabular-nums md:text-2xl">
                {formatMicroUsd(data.finalValues[i])}
              </span>
              <span className={cn("font-mono text-sm font-bold tabular-nums", p != null && (p >= 0 ? "text-win" : "text-rug"))}>
                {p != null && `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`}
                {data.trades && <span className="ml-2 font-normal text-foreground">{data.trades[i]} trades</span>}
              </span>
            </div>
          );
        })}
      </div>

      {data.marks && data.marks.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-bold uppercase">Marked at</span>
          <p className="font-mono">
            {data.marks.map((m) => `${m.symbol} ${formatUsdPrice(m.price)}`).join(" · ")}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {rematchHref && (
          <Link href={rematchHref} className={buttonClasses("accent")}>
            Rematch
          </Link>
        )}
        <Button variant="secondary" onClick={postToX}>
          Post on X
        </Button>
        <Button variant="secondary" onClick={copyLink} aria-live="polite">
          {copied ? "Link copied" : "Copy link"}
        </Button>
        <Link href="/arena" className={buttonClasses("ghost")}>
          Lobby
        </Link>
      </div>

      {data.settleSignature && (
        <a
          href={explorer("tx", data.settleSignature)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold underline"
        >
          Payout transaction on Solana Explorer
        </a>
      )}
    </Card>
  );
}
