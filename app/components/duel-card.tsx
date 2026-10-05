"use client";

import Link from "next/link";
import { coinByDemoMint, DuelStatus } from "@rug-royale/sdk";
import { Badge, Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { CoinAvatar } from "@/components/coin-avatar";
import { useNow } from "@/lib/use-now";
import { formatCompact, formatCountdown, formatSol, formatWindow, truncateAddress } from "@/lib/format";
import type { DuelWithAddress } from "@/lib/queries";

const STATUS_LABEL: Record<DuelStatus, { label: string; tone: "primary" | "accent" | "win" | "muted" }> = {
  [DuelStatus.Open]: { label: "Open", tone: "primary" },
  [DuelStatus.Active]: { label: "Live", tone: "accent" },
  [DuelStatus.Settled]: { label: "Settled", tone: "win" },
  [DuelStatus.Cancelled]: { label: "Cancelled", tone: "muted" },
};

export function DuelCard({ duel, action }: { duel: DuelWithAddress; action: string }) {
  const now = useNow();
  const coin = coinByDemoMint(duel.coin.toBase58());
  const status = STATUS_LABEL[duel.status];
  const joinLeft = Number(duel.joinDeadline) - now;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <CoinAvatar coin={coin} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black uppercase">{coin?.symbol ?? "Unknown"}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            by <span className="font-mono">{truncateAddress(duel.creator)}</span>
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Stat label="Entry" value={duel.entryLamports === 0n ? "Unranked" : `${formatSol(duel.entryLamports)} SOL`} />
        <Stat label="Bankroll" value={formatCompact(duel.bankroll)} />
        <Stat label="Window" value={formatWindow(duel.windowSecs)} />
        <Stat
          label="Prize boost"
          value={duel.sponsoredLamports === 0n ? "None" : `+${formatSol(duel.sponsoredLamports)} SOL`}
        />
        {duel.status === DuelStatus.Open && (
          <Stat label="Join closes in" value={joinLeft > 0 ? formatCountdown(joinLeft) : "Closed"} />
        )}
        {duel.allowedOpponent && <Stat label="Invite only" value={truncateAddress(duel.allowedOpponent)} />}
      </dl>

      <Link href={`/duel/${duel.address.toBase58()}`} className={buttonClasses("primary")}>
        {action}
      </Link>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
