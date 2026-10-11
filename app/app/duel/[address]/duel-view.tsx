"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  COINS,
  DuelStatus,
  PROGRAM_ID,
  coinByDemoMint,
  joinDuelAccounts,
  payout,
  spotPrice,
  type DuelRef,
} from "@rug-royale/sdk";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { CoinAvatar } from "@/components/coin-avatar";
import { EmptyState, ErrorState } from "@/components/states";
import { PnlBars } from "@/components/duel/pnl-bars";
import { TradePanel } from "@/components/duel/trade-panel";
import { CancelButton, SettleButton } from "@/components/duel/actions";
import { ResultCard, ResultPopup } from "@/components/duel/result";
import { useConfig, type DuelWithAddress } from "@/lib/queries";
import { useDuelLive, type DuelLive } from "@/lib/use-duel-live";
import { useNow } from "@/lib/use-now";
import { program } from "@/lib/program";
import { sendIxs, unexpectedError } from "@/lib/send";
import { explorerUrl } from "@/lib/config";
import { formatCompact, formatCountdown, formatSol, formatWindow, truncateAddress } from "@/lib/format";

function parseAddress(s: string) {
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
}

export function DuelView({ address }: { address: string }) {
  const pk = useMemo(() => parseAddress(address), [address]);
  const q = useDuelLive(pk);

  if (!pk) {
    return <EmptyState title="Not a duel address" body="Check the invite link; the address in it is malformed." action={<BackToLobby />} />;
  }
  if (q.isPending) return <DuelSkeleton />;
  if (q.isError) return <ErrorState message="The devnet RPC didn't answer. It rate-limits often." onRetry={() => q.refetch()} />;
  if (!q.data) {
    return (
      <EmptyState
        title="Duel not found"
        body="No duel exists at this address on devnet. It may not be confirmed yet, or the link is for another cluster."
        action={<BackToLobby />}
      />
    );
  }
  return <DuelDetail live={q.data} />;
}

function DuelDetail({ live }: { live: DuelLive }) {
  const { duel, pool } = live;
  const now = useNow();
  const config = useConfig().data ?? null;
  const coin = coinByDemoMint(duel.coin.toBase58());
  const { publicKey } = useWallet();
  const me = publicKey?.toBase58() ?? null;
  const isCreator = me === duel.creator.toBase58();
  const isOpponent = !!me && me === duel.opponent?.toBase58();
  const justCreated = useSearchParams().get("created") === "1";
  const feeBps = config?.swapFeeBps ?? 30;
  const started = duel.status !== DuelStatus.Open && duel.status !== DuelStatus.Cancelled && now >= Number(duel.startTs);
  const myPayout =
    duel.status === DuelStatus.Settled && config
      ? payout({
          entryLamports: duel.entryLamports,
          sponsoredLamports: duel.sponsoredLamports,
          settlerTipLamports: config.settlerTipLamports,
          rakeBps: config.rakeBps,
          result: duel.result as 1 | 2 | 3,
        }).prize
      : 0n;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <CoinAvatar coin={coin} size="lg" />
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-5xl">{coin?.symbol ?? "Unknown"} duel</h1>
          <p className="text-sm text-muted-foreground">
            {coin?.name} · created by <span className="font-mono">{truncateAddress(duel.creator)}</span>
            {isCreator && " (you)"}
          </p>
        </div>
        {pool && started && (
          <div className="border-[3px] border-border bg-card px-3 py-2 text-right">
            <div className="text-xs font-bold uppercase text-muted-foreground">Pool price</div>
            <div className="font-mono text-xl font-black tabular-nums">
              {spotPrice(pool).toFixed(4)} <span className="text-xs">{COINS.quote.symbol}</span>
            </div>
          </div>
        )}
        <a
          href={explorerUrl("address", duel.address.toBase58())}
          target="_blank"
          rel="noreferrer"
          className={`${buttonClasses("ghost")} ml-auto normal-case`}
        >
          Explorer <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-6">
          {pool && live.opponent && started && (
            <PnlBars
              pool={pool}
              feeBps={feeBps}
              bankroll={duel.bankroll}
              rows={[
                { label: isCreator ? "You (creator)" : "Creator", balances: live.creator, highlight: isCreator },
                { label: isOpponent ? "You (opponent)" : "Opponent", balances: live.opponent, highlight: isOpponent },
              ]}
            />
          )}
          <Card>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Entry" value={duel.entryLamports === 0n ? "Unranked" : `${formatSol(duel.entryLamports)} SOL`} />
              <Stat label="Bankroll" value={`${formatCompact(duel.bankroll)} ${COINS.quote.symbol}`} />
              <Stat label="Window" value={formatWindow(duel.windowSecs)} />
              <Stat label="Prize boost" value={duel.sponsoredLamports === 0n ? "None" : `+${formatSol(duel.sponsoredLamports)} SOL`} />
              <Stat label="Creator" value={truncateAddress(duel.creator)} />
              <Stat
                label="Opponent"
                value={duel.opponent ? truncateAddress(duel.opponent) : duel.allowedOpponent ? `Invite: ${truncateAddress(duel.allowedOpponent)}` : "Waiting"}
              />
            </dl>
          </Card>
        </div>

        {/* First on phones: the countdown and trade panel must be on screen during a 30 s window. */}
        <div className="order-first lg:order-none">
          <StatePanel live={live} now={now} isCreator={isCreator} isOpponent={isOpponent} justCreated={justCreated} config={config} feeBps={feeBps} coinSymbol={coin?.symbol ?? "COIN"} />
        </div>
      </div>

      {duel.status === DuelStatus.Settled && <ResultPopup duel={duel} wallet={me} prizeLamports={myPayout} />}
    </div>
  );
}

function StatePanel({
  live,
  now,
  isCreator,
  isOpponent,
  justCreated,
  config,
  feeBps,
  coinSymbol,
}: {
  live: DuelLive;
  now: number;
  isCreator: boolean;
  isOpponent: boolean;
  justCreated: boolean;
  config: ReturnType<typeof useConfig>["data"] | null;
  feeBps: number;
  coinSymbol: string;
}) {
  const { duel, ref, pool } = live;

  if (duel.status === DuelStatus.Open) {
    const left = Number(duel.joinDeadline) - now;
    return (
      <Card className="flex flex-col gap-4 bg-primary text-primary-foreground">
        <Badge tone="muted" className="self-start">
          {justCreated ? "Duel created" : "Waiting for an opponent"}
        </Badge>
        <p className="text-sm">
          {left > 0 ? (
            <>
              Join closes in <span className="font-mono font-bold tabular-nums">{formatCountdown(left)}</span>.
            </>
          ) : (
            "The join deadline has passed."
          )}
        </p>
        <InviteLink address={duel.address.toBase58()} />
        {!isCreator && left > 0 && <JoinButton duel={duel} />}
        {left <= 0 && (
          <>
            <p className="text-xs">Anyone can cancel it now. The entry goes back to the creator, never to the caller.</p>
            <CancelButton duelRef={ref} sponsor={duel.sponsoredLamports > 0n ? duel.sponsor : null} />
          </>
        )}
      </Card>
    );
  }

  if (duel.status === DuelStatus.Active) {
    const toStart = Number(duel.startTs) - now;
    const toEnd = Number(duel.endTs) - now;
    const myBalances = isCreator ? live.creator : isOpponent ? live.opponent : null;
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 bg-accent text-accent-foreground">
          <Badge tone="muted" className="self-start">
            {toStart > 0 ? "Starting soon" : toEnd > 0 ? "Live" : "Buzzer"}
          </Badge>
          {toStart > 0 ? (
            <>
              <p>
                Trading opens in <span className="font-mono text-3xl font-black tabular-nums">{formatCountdown(toStart)}</span>
              </p>
              <ul className="list-disc pl-5 text-xs">
                <li>Closed market: every trade moves the price your opponent sees.</li>
                <li>The first buyer gets the better price.</li>
                <li>The window is enforced on-chain; late trades fail.</li>
              </ul>
            </>
          ) : toEnd > 0 ? (
            <p>
              <span className="font-mono text-3xl font-black tabular-nums">{formatCountdown(toEnd)}</span> left
            </p>
          ) : (
            <p>The window has closed. Settle to pay out.</p>
          )}
          {!myBalances && toEnd > 0 && <p className="text-xs">You&apos;re spectating.</p>}
        </Card>
        {myBalances && pool && toStart <= 0 && toEnd > 0 && (
          <TradePanel duelRef={ref} pool={pool} feeBps={feeBps} balances={myBalances} coinSymbol={coinSymbol} />
        )}
        {toEnd <= 0 && config && <SettleButton duelRef={ref} treasury={config.treasury} tipLamports={config.settlerTipLamports} />}
      </div>
    );
  }

  if (duel.status === DuelStatus.Settled) return <ResultCard duel={duel} config={config ?? null} />;

  return (
    <Card className="flex flex-col gap-3">
      <Badge tone="muted" className="self-start">
        Cancelled
      </Badge>
      <p className="text-sm">Nobody joined before the deadline. The entry went back to the creator.</p>
    </Card>
  );
}

function InviteLink({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/duel/${address}` : `${window.location.origin}/duel/${address}`;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase">Invite link</span>
      <div className="flex">
        <code className="min-w-0 flex-1 truncate border-[3px] border-r-0 border-border bg-card px-2 py-2 font-mono text-xs text-card-foreground">
          {url}
        </code>
        <Button
          type="button"
          variant="secondary"
          aria-label={copied ? "Copied" : "Copy invite link"}
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}

function JoinButton({ duel }: { duel: DuelWithAddress }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!wallet.publicKey) {
    return (
      <Button variant="secondary" size="lg" onClick={() => setVisible(true)}>
        Connect wallet to join
      </Button>
    );
  }
  if (duel.allowedOpponent && !duel.allowedOpponent.equals(wallet.publicKey)) {
    return <p className="text-sm font-bold">This duel is reserved for {truncateAddress(duel.allowedOpponent)}.</p>;
  }

  const join = async () => {
    setError(null);
    setBusy(true);
    try {
      const ref: DuelRef = {
        programId: PROGRAM_ID,
        duel: duel.address,
        creator: duel.creator,
        quoteMint: duel.quoteMint,
        coinMint: duel.coin,
      };
      const ix = await program.methods.joinDuel().accountsStrict(joinDuelAccounts(ref, wallet.publicKey!)).instruction();
      const res = await sendIxs(connection, wallet, [ix]);
      if (res.ok) await qc.invalidateQueries({ queryKey: ["duel-live", duel.address.toBase58()] });
      else if (!res.cancelled) setError(res.message);
    } catch (err) {
      setError(unexpectedError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="lg" loading={busy} onClick={join}>
        {busy ? "Confirm in wallet" : `Join for ${duel.entryLamports === 0n ? "free" : `${formatSol(duel.entryLamports)} SOL`}`}
      </Button>
      {error && (
        <p role="alert" className="border-[3px] border-border bg-rug p-2 text-sm font-bold text-rug-foreground">
          {error}
        </p>
      )}
    </div>
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

function BackToLobby() {
  return (
    <Link href="/" className={buttonClasses("primary")}>
      Back to lobby
    </Link>
  );
}

function DuelSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading duel">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16" />
        <Skeleton className="h-10 w-64" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
