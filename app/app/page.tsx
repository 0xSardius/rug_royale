"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { buttonClasses } from "@/components/ui/button";
import { DuelCard } from "@/components/duel-card";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { useMyDuels, useOpenDuels } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Tab = "open" | "mine";

export default function LobbyPage() {
  const [tab, setTab] = useState<Tab>("open");
  const { publicKey } = useWallet();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-black uppercase leading-none tracking-tight md:text-6xl">
            Same coin.
            <br />
            Same pool.
            <br />
            <span className="bg-rug px-1 text-rug-foreground">One survivor.</span>
          </h1>
          <p className="mt-4 text-base">
            Two traders escrow an entry, get identical bankrolls, and trade one StonkFun top-10 coin in a shared pool.
            When the buzzer sounds, the program values both bags on-chain and pays the winner.
          </p>
        </div>
        <Link href="/create" className={buttonClasses("accent", "lg")}>
          Create a duel
        </Link>
      </section>

      <div role="tablist" aria-label="Duels" className="flex gap-2">
        <TabButton active={tab === "open"} onClick={() => setTab("open")}>
          Open duels
        </TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          My duels
        </TabButton>
      </div>

      {tab === "open" ? <OpenDuels /> : publicKey ? <MyDuels /> : <ConnectPrompt />}
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

function OpenDuels() {
  const q = useOpenDuels();
  if (q.isPending) return <CardGridSkeleton />;
  if (q.isError) return <ErrorState message="The devnet RPC didn't answer. It rate-limits often." onRetry={() => q.refetch()} />;
  if (q.data.length === 0) {
    return (
      <EmptyState
        title="No open duels"
        body="Nobody is waiting for an opponent right now. Start one and send the invite link to a rival."
        action={
          <Link href="/create" className={buttonClasses("primary")}>
            Create a duel
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {q.data.map((d) => (
        <DuelCard key={d.address.toBase58()} duel={d} action="View and join" />
      ))}
    </div>
  );
}

function MyDuels() {
  const { publicKey } = useWallet();
  const q = useMyDuels(publicKey);
  if (q.isPending) return <CardGridSkeleton />;
  if (q.isError) return <ErrorState message="The devnet RPC didn't answer. It rate-limits often." onRetry={() => q.refetch()} />;
  if (q.data.length === 0) {
    return (
      <EmptyState
        title="No duels yet"
        body="Duels you create or join show up here, including finished ones."
        action={
          <Link href="/create" className={buttonClasses("primary")}>
            Create your first duel
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {q.data.map((d) => (
        <DuelCard key={d.address.toBase58()} duel={d} action="Open duel" />
      ))}
    </div>
  );
}

function ConnectPrompt() {
  return <EmptyState title="Connect a wallet" body="Connect a wallet to see the duels you've created or joined." />;
}
