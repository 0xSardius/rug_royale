"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { v2 } from "@rug-royale/sdk";
import { Badge, Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { formatCountdown, formatSol, formatWindow, truncateAddress } from "@/lib/format";
import { formatMicroUsd, formatUsdPrice } from "@/lib/v2/format";
import { arenaName, coinForFeed } from "@/lib/v2/program";
import {
  type ArenaWithAddress,
  type PotWithAddress,
  useArenas,
  useMyPots,
  useOpenPots,
  usePriceFeeds,
} from "@/lib/v2/queries";
import { nearestRegion, type RegionPings, useRegionPings } from "@/lib/v2/use-region-pings";

type Tab = "open" | "mine";

const RPC_ERROR = "The devnet RPC didn't answer. It rate-limits often.";

export default function ArenaLobbyPage() {
  const [tab, setTab] = useState<Tab>("open");
  const { publicKey } = useWallet();
  const pings = useRegionPings();
  const arenas = useArenas();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Badge tone="accent">v2 preview</Badge>
          <h1 className="mt-3 text-4xl font-black uppercase leading-none tracking-tight md:text-6xl">
            Live prices.
            <br />
            <span className="bg-rug px-1 text-rug-foreground">One winner.</span>
          </h1>
          <p className="mt-4 text-base">
            Two traders get the same virtual bankroll and trade real Solana coins at live oracle prices. When the
            clock runs out, the program marks both portfolios and pays the bigger one.
          </p>
        </div>
        <RegionStrip pings={pings.data} pending={pings.isPending} />
      </section>

      <section aria-labelledby="arenas-heading" className="flex flex-col gap-4">
        <h2 id="arenas-heading" className="text-2xl font-black uppercase">
          Arenas
        </h2>
        {arenas.isPending ? (
          <CardGridSkeleton count={1} />
        ) : arenas.isError ? (
          <ErrorState message={RPC_ERROR} onRetry={() => arenas.refetch()} />
        ) : arenas.data.length === 0 ? (
          <EmptyState title="No arenas yet" body="An admin hasn't created an arena on this cluster." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {arenas.data.map((a) => (
              <ArenaTile key={a.arenaId} arena={a} pings={pings.data} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Duels" className="flex flex-col gap-4">
        <div role="tablist" aria-label="Duels" className="flex gap-2">
          <TabButton active={tab === "open"} onClick={() => setTab("open")}>
            Open duels
          </TabButton>
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
            My duels
          </TabButton>
        </div>
        {tab === "open" ? (
          <OpenPots arenas={arenas.data} pings={pings.data} />
        ) : publicKey ? (
          <MyPots arenas={arenas.data} pings={pings.data} />
        ) : (
          <EmptyState title="Connect a wallet" body="Connect a wallet to see the duels you've created or joined." />
        )}
      </section>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "h-10 border-[3px] border-border px-4 text-sm font-bold uppercase",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
        active ? "bg-foreground text-background" : "bg-card",
      )}
    >
      {children}
    </button>
  );
}

/** The viewer's ping to each ER region; the nearest one is where a new duel would run (D6). */
function RegionStrip({ pings, pending }: { pings: RegionPings | undefined; pending: boolean }) {
  const nearest = nearestRegion(pings);
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-xs font-bold uppercase text-muted-foreground">Your ping to each region</p>
      <ul className="flex gap-2">
        {(["us", "eu", "as"] as const).map((r) => (
          <li key={r}>
            <Badge tone={r === nearest ? "win" : "muted"}>
              {v2.REGION_LABEL[r]} <span className="font-mono tabular-nums">{pingLabel(pings?.[r], pending)}</span>
            </Badge>
          </li>
        ))}
      </ul>
      {nearest && (
        <p className="text-xs text-muted-foreground">Duels you create run in {v2.REGION_LABEL[nearest]}.</p>
      )}
    </Card>
  );
}

const pingLabel = (ms: number | null | undefined, pending = false) =>
  ms == null ? (pending ? "…" : "n/a") : `${ms} ms`;

function ArenaTile({ arena, pings }: { arena: ArenaWithAddress; pings: RegionPings | undefined }) {
  const now = useNow();
  const region = nearestRegion(pings) ?? "us";
  const feeds = usePriceFeeds(
    arena.assets.map((a) => a.feed),
    pings ? region : null,
  );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-black uppercase">{arenaName(arena.arenaId)}</h3>
        {arena.paused && <Badge tone="rug">Paused</Badge>}
      </div>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
        <Stat label="Bankroll" value={formatMicroUsd(arena.bankroll)} />
        <Stat label="Entry" value={`${formatSol(arena.minEntryLamports)}–${formatSol(arena.maxEntryLamports)} SOL`} />
        <Stat label="Windows" value={arena.windows.map(formatWindow).join(" / ")} />
      </dl>
      <ul aria-label={`${arenaName(arena.arenaId)} prices`} className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
        {arena.assets.map((asset, i) => {
          const coin = coinForFeed(asset.feed);
          const feed = feeds.data?.[i] ?? null;
          const fresh = feed ? v2.isFresh(feed.publishTime, BigInt(now), arena.maxPriceAgeS) : false;
          const price = feed ? v2.displayPrice(feed.price, asset.exponent) : null;
          return (
            <li key={asset.feed.toBase58()} className="flex items-baseline justify-between gap-2 border-b-2 border-muted py-1.5">
              <span className={cn("text-sm font-bold", !asset.enabled && "line-through text-muted-foreground")}>
                {coin?.symbol ?? `#${i}`}
              </span>
              <span
                className={cn("font-mono text-sm tabular-nums", feed && !fresh && "text-muted-foreground")}
                title={feed && !fresh ? "Price is stale; trading this coin is paused until it updates" : undefined}
              >
                {feeds.isPending ? "…" : formatUsdPrice(price)}
                {feed && !fresh && <span className="sr-only"> (stale)</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Live oracle prices from the {v2.REGION_LABEL[region]} region. Fee {arena.tradeFeeBps / 100}% per trade,{" "}
        {arena.rakeBps / 100}% rake on the pot.
      </p>
    </Card>
  );
}

function OpenPots({ arenas, pings }: { arenas: ArenaWithAddress[] | undefined; pings: RegionPings | undefined }) {
  const q = useOpenPots();
  if (q.isPending) return <CardGridSkeleton />;
  if (q.isError) return <ErrorState message={RPC_ERROR} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) {
    return (
      <EmptyState
        title="No open duels"
        body="Nobody is waiting for an opponent right now. Creating duels from the app is the next build step."
      />
    );
  }
  return <PotGrid pots={q.data} arenas={arenas} pings={pings} />;
}

function MyPots({ arenas, pings }: { arenas: ArenaWithAddress[] | undefined; pings: RegionPings | undefined }) {
  const { publicKey } = useWallet();
  const q = useMyPots(publicKey);
  if (q.isPending) return <CardGridSkeleton />;
  if (q.isError) return <ErrorState message={RPC_ERROR} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) {
    return <EmptyState title="No duels yet" body="Duels you create or join show up here, including finished ones." />;
  }
  return <PotGrid pots={q.data} arenas={arenas} pings={pings} />;
}

function PotGrid({
  pots,
  arenas,
  pings,
}: {
  pots: PotWithAddress[];
  arenas: ArenaWithAddress[] | undefined;
  pings: RegionPings | undefined;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {pots.map((p) => (
        <PotCard key={p.address.toBase58()} pot={p} arena={arenas?.find((a) => a.arenaId === p.arenaId)} pings={pings} />
      ))}
    </div>
  );
}

const POT_STATUS: Record<v2.PotStatus, { label: string; tone: "primary" | "accent" | "win" | "muted" }> = {
  [v2.PotStatus.Open]: { label: "Open", tone: "primary" },
  [v2.PotStatus.Active]: { label: "Live", tone: "accent" },
  [v2.PotStatus.Settled]: { label: "Settled", tone: "win" },
  [v2.PotStatus.Cancelled]: { label: "Cancelled", tone: "muted" },
  [v2.PotStatus.Refunded]: { label: "Refunded", tone: "muted" },
};

function PotCard({
  pot,
  arena,
  pings,
}: {
  pot: PotWithAddress;
  arena: ArenaWithAddress | undefined;
  pings: RegionPings | undefined;
}) {
  const now = useNow();
  const status = POT_STATUS[pot.status];
  const joinLeft = Number(pot.joinDeadline) - now;
  const ping = pot.region ? pings?.[pot.region] : null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-black uppercase">{arenaName(pot.arenaId)}</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="-mt-2 truncate text-sm text-muted-foreground">
        by <span className="font-mono">{truncateAddress(pot.creator)}</span>
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Stat label="Entry" value={pot.entryLamports === 0n ? "Free" : `${formatSol(pot.entryLamports)} SOL`} />
        <Stat label="Window" value={formatWindow(pot.windowSecs)} />
        <Stat
          label="Region"
          value={pot.region ? `${v2.REGION_LABEL[pot.region]} · ${pingLabel(ping)}` : "Unknown"}
        />
        <Stat label="Bankroll" value={arena ? formatMicroUsd(arena.bankroll) : "…"} />
        {pot.sponsoredLamports > 0n && <Stat label="Prize boost" value={`+${formatSol(pot.sponsoredLamports)} SOL`} />}
        {pot.status === v2.PotStatus.Open && (
          <Stat label="Join closes in" value={joinLeft > 0 ? formatCountdown(joinLeft) : "Closed"} />
        )}
        {pot.allowedOpponent && <Stat label="Invite only" value={truncateAddress(pot.allowedOpponent)} />}
      </dl>
      <Link href={`/arena/duel/${pot.address.toBase58()}`} className={buttonClasses("primary")}>
        {pot.status === v2.PotStatus.Open ? "View and join" : "Open duel"}
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

