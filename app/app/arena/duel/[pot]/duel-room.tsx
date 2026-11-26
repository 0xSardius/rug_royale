"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { type Keypair, PublicKey } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/states";
import { WalletButton } from "@/components/wallet-button";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { formatCountdown, formatSol, formatWindow, truncateAddress } from "@/lib/format";
import { sendIxs, unexpectedError } from "@/lib/send";
import { formatMicroUsd, formatUsdPrice } from "@/lib/v2/format";
import { arenaName, coinForFeed, programV2 } from "@/lib/v2/program";
import {
  type ArenaWithAddress,
  type PotWithAddress,
  erConnectionFor,
  useArenas,
  useMatchState,
  usePot,
  usePriceFeeds,
  useProtocol,
  useMatchHome,
  useSettledRecord,
} from "@/lib/v2/queries";
import { ResultCard, type ResultData } from "./result-card";
import { getSessionKey, newSessionKey, storeSessionKey } from "@/lib/v2/session-keys";
import { sendErIxs, timedSendErIxs, type ErSigner } from "@/lib/v2/er-send";

const SLIPPAGE_BPS = 50;
const BUY_PRESETS_USD = [100, 500, 1_000, 2_500];
const SELL_PRESETS_PCT = [25, 50, 100];
const MICRO = 1_000_000n;

function parseAddress(s: string) {
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
}

const pnlPct = (value: bigint, bankroll: bigint) => (bankroll > 0n ? v2.pnlBps(value, bankroll) / 100 : 0);
const formatPct = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;

export function DuelRoom({ address }: { address: string }) {
  const potAddress = useMemo(() => parseAddress(address), [address]);
  const pot = usePot(potAddress);
  const arenas = useArenas();
  const settledStatus = pot.data?.status === v2.PotStatus.Settled;
  const history = useSettledRecord(potAddress, pot.data === null || settledStatus);

  if (!potAddress) {
    return <EmptyState title="Not a duel" body="That link doesn't point to a valid duel address." action={<BackLink />} />;
  }
  if (pot.isError) return <ErrorState message="The devnet RPC didn't answer. It rate-limits often." onRetry={() => pot.refetch()} />;
  if (pot.isPending || arenas.isPending) return <RoomSkeleton />;
  if (!pot.data) {
    if (history.isPending) return <RoomSkeleton />;
    if (history.data) {
      const h = history.data;
      return (
        <ResultCard
          data={{
            creator: h.creator,
            opponent: h.opponent,
            result: h.event.result,
            finalValues: h.event.finalValues,
            prize: h.event.prize,
            bankroll: null,
            settleSignature: h.signature,
          }}
        />
      );
    }
    return (
      <EmptyState
        title="Duel not found"
        body="This duel doesn't exist on devnet, or it was closed after it finished."
        action={<BackLink />}
      />
    );
  }
  const arena = arenas.data?.find((a) => a.arenaId === pot.data!.arenaId);
  if (!arena) return <ErrorState message="Couldn't load this duel's arena." onRetry={() => arenas.refetch()} />;
  return <Room pot={pot.data} arena={arena} settleSignature={history.data?.signature} />;
}

function BackLink() {
  return (
    <Link href="/arena" className={buttonClasses("secondary")}>
      Back to the lobby
    </Link>
  );
}

function RoomSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading duel">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

type Phase = "open" | "starting" | "live" | "ended" | "settling" | "settled" | "cancelled" | "refunded";

function phaseOf(pot: PotWithAddress, match: v2.Match | null, now: number): Phase {
  switch (pot.status) {
    case v2.PotStatus.Open:
      return "open";
    case v2.PotStatus.Settled:
      return "settled";
    case v2.PotStatus.Cancelled:
      return "cancelled";
    case v2.PotStatus.Refunded:
      return "refunded";
  }
  if (!match) return "starting";
  if (match.status === v2.MatchStatus.Finalized) return "settling";
  if (now < Number(match.startTs)) return "starting";
  if (now < Number(match.endTs)) return "live";
  return "ended";
}

function Room({
  pot,
  arena,
  settleSignature,
}: {
  pot: PotWithAddress;
  arena: ArenaWithAddress;
  settleSignature?: string;
}) {
  const wallet = useWallet();
  const now = useNow(250);
  const matchQ = useMatchState(pot);
  const match = matchQ.data?.match ?? null;
  const assetCount = match?.assetCount ?? arena.assets.length;
  const assets = arena.assets.slice(0, assetCount);
  const feeds = usePriceFeeds(
    assets.map((a) => a.feed),
    pot.region,
    pot.status === v2.PotStatus.Active ? 1_000 : 5_000,
  );
  const phase = phaseOf(pot, match, now);

  const session = getSessionKey(pot.matchAccount);
  const sessionValid =
    !!session && !!match && match.seats.some((s) => s.sessionKey && s.sessionKey.equals(session.publicKey));
  useAutoFinalize(pot, arena, phase === "ended" && sessionValid ? session : null, match ? Number(match.endTs) : 0);

  const me = wallet.publicKey;
  const mySeat = !me ? null : me.equals(pot.creator) ? 0 : pot.opponent && me.equals(pot.opponent) ? 1 : null;

  const prices = assets.map((_, i) => feeds.data?.[i]?.price ?? null);
  const exponents = assets.map((a) => a.exponent);
  const values = match
    ? match.status === v2.MatchStatus.Finalized
      ? match.finalValues
      : match.seats.map((s) => {
          try {
            return v2.markToMarket(s, prices, exponents);
          } catch {
            return null;
          }
        })
    : [null, null];

  return (
    <div className="flex flex-col gap-6">
      <RoomHeader pot={pot} arena={arena} match={match} phase={phase} now={now} />
      {phase === "open" && <OpenPanel pot={pot} arena={arena} now={now} mySeat={mySeat} />}
      {phase === "settled" && !match && !matchQ.isPending && (
        <EmptyState title="Settled" body="This duel was paid out and its accounts were closed." action={<BackLink />} />
      )}
      {(phase === "cancelled" || phase === "refunded") && (
        <EmptyState
          title={phase === "cancelled" ? "Duel cancelled" : "Duel refunded"}
          body={
            phase === "cancelled"
              ? "Nobody joined before the deadline. The creator's entry went back to their wallet."
              : "This duel couldn't be finalized, so both entries were refunded on Solana."
          }
          action={<BackLink />}
        />
      )}
      {match && phase !== "open" && phase !== "cancelled" && phase !== "refunded" && (
        <>
          {phase === "settled" ? (
            <ResultCard data={resultData(pot, arena, match, settleSignature)} />
          ) : (
            <RaceBar pot={pot} match={match} values={values} bankroll={arena.bankroll} mySeat={mySeat} phase={phase} />
          )}
          {(phase === "settling" || phase === "ended") && <SettlePanel pot={pot} match={match} phase={phase} now={now} />}
          {(phase === "starting" || phase === "live") && mySeat !== null && (
            <TradePanel
              pot={pot}
              arena={arena}
              match={match}
              seat={mySeat}
              phase={phase}
              prices={prices}
              publishTimes={assets.map((_, i) => feeds.data?.[i]?.publishTime ?? null)}
              now={now}
              onTraded={() => matchQ.refetch()}
            />
          )}
          {(phase === "starting" || phase === "live") && mySeat === null && (
            <Card className="bg-muted text-sm">You&apos;re watching this duel. Positions update live from the rollup.</Card>
          )}
          <Positions arena={arena} match={match} prices={prices} values={values} mySeat={mySeat} />
        </>
      )}
    </div>
  );
}

function RoomHeader({
  pot,
  arena,
  match,
  phase,
  now,
}: {
  pot: PotWithAddress;
  arena: ArenaWithAddress;
  match: v2.Match | null;
  phase: Phase;
  now: number;
}) {
  const clock =
    phase === "starting" && match
      ? { label: "Starts in", value: formatCountdown(Number(match.startTs) - now) }
      : phase === "live" && match
        ? { label: "Ends in", value: formatCountdown(Number(match.endTs) - now) }
        : phase === "open"
          ? { label: "Join by", value: formatCountdown(Number(pot.joinDeadline) - now) }
          : null;
  const label: Record<Phase, string> = {
    open: "Waiting for opponent",
    starting: "Starting",
    live: "Live",
    ended: "Finalizing",
    settling: "Settling",
    settled: "Settled",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };
  return (
    <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={phase === "live" ? "win" : phase === "open" ? "accent" : "muted"}>{label[phase]}</Badge>
          <Badge tone="muted">{arenaName(arena.arenaId)}</Badge>
          {pot.region && <Badge tone="muted">{v2.REGION_LABEL[pot.region]}</Badge>}
        </div>
        <h1 className="text-3xl font-black uppercase leading-none md:text-4xl">
          {pot.entryLamports === 0n ? "Free duel" : `${formatSol(pot.entryLamports)} SOL duel`}
          <span className="ml-2 text-xl md:text-2xl">· {formatWindow(pot.windowSecs)}</span>
        </h1>
        <p className="text-sm">
          {formatMicroUsd(arena.bankroll)} bankroll each · {(arena.tradeFeeBps / 100).toFixed(2)}% trade fee
          {pot.sponsoredLamports > 0n && <> · +{formatSol(pot.sponsoredLamports)} SOL prize boost</>}
        </p>
      </div>
      {clock && (
        <div className="flex flex-col items-start md:items-end" aria-live="off">
          <span className="text-xs font-bold uppercase">{clock.label}</span>
          <span className="font-mono text-4xl font-black tabular-nums md:text-5xl">{clock.value}</span>
        </div>
      )}
    </Card>
  );
}

function OpenPanel({
  pot,
  arena,
  now,
  mySeat,
}: {
  pot: PotWithAddress;
  arena: ArenaWithAddress;
  now: number;
  mySeat: 0 | 1 | null;
}) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const protocol = useProtocol();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const expired = now >= Number(pot.joinDeadline);
  const deposit = pot.entryLamports + pot.feeShareLamports;
  const reserved = pot.allowedOpponent && wallet.publicKey && !pot.allowedOpponent.equals(wallet.publicKey);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["v2"] });

  async function join() {
    if (!wallet.publicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const session = newSessionKey();
      const ixs = await v2.joinAndDelegateIxs(programV2, {
        opponent: wallet.publicKey,
        pot,
        potAddress: pot.address,
        sessionKey: session.publicKey,
      });
      const res = await sendIxs(connection, wallet, ixs, v2.programErrorFromLogs);
      if (res.ok) {
        storeSessionKey(pot.matchAccount, session);
        await refresh();
      } else if (!res.cancelled) setMessage(res.message);
    } catch (e) {
      setMessage(unexpectedError(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!wallet.publicKey || !protocol.data) return;
    setBusy(true);
    setMessage(null);
    try {
      const ix = await v2.cancelMatchIx(programV2, {
        caller: wallet.publicKey,
        pot,
        potAddress: pot.address,
        treasury: protocol.data.treasury,
      });
      const res = await sendIxs(connection, wallet, [ix], v2.programErrorFromLogs);
      if (res.ok) await refresh();
      else if (!res.cancelled) setMessage(res.message);
    } catch (e) {
      setMessage(unexpectedError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      {mySeat === 0 ? (
        <>
          <h2 className="text-xl font-black uppercase">Waiting for an opponent</h2>
          <p className="text-sm">
            Share this page&apos;s link. Trading starts {arena.startDelaySecs} s after someone joins, so keep this tab
            open.
            {!getSessionKey(pot.matchAccount) &&
              " This browser doesn't have your trading key for this duel (it was created in another browser, or site data was cleared). Trades will ask your wallet to sign, and some wallets block them."}
          </p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-black uppercase">Join this duel</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="You deposit" value={`${formatSol(deposit)} SOL`} />
            <Stat label="Creator" value={truncateAddress(pot.creator)} />
            <Stat label="Window" value={formatWindow(pot.windowSecs)} />
            <Stat label="Region" value={pot.region ? v2.REGION_LABEL[pot.region] : "Unknown"} />
          </dl>
          <p className="text-sm">
            One wallet approval joins the duel and moves it to the {pot.region ? v2.REGION_LABEL[pot.region] : ""}{" "}
            rollup. After that, trades are signed by a key in this tab, with no popups and no fees.
          </p>
        </>
      )}
      {!wallet.publicKey ? (
        <WalletButton />
      ) : expired ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">Nobody joined in time.</p>
          <Button variant="secondary" onClick={cancel} loading={busy} disabled={!protocol.data}>
            Cancel and refund the creator
          </Button>
        </div>
      ) : mySeat === null ? (
        reserved ? (
          <p className="text-sm font-bold">This duel is reserved for {truncateAddress(pot.allowedOpponent!)}.</p>
        ) : (
          <Button variant="accent" size="lg" onClick={join} loading={busy}>
            Join for {formatSol(deposit)} SOL
          </Button>
        )
      ) : null}
      {message && (
        <p role="alert" className="text-sm font-bold text-rug">
          {message}
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function RaceBar({
  pot,
  match,
  values,
  bankroll,
  mySeat,
  phase,
}: {
  pot: PotWithAddress;
  match: v2.Match;
  values: (bigint | null)[];
  bankroll: bigint;
  mySeat: 0 | 1 | null;
  phase: Phase;
}) {
  const [v0, v1] = values;
  // Lead in bps of the bankroll; a 10% lead fills the bar to one side.
  const leadBps = v0 != null && v1 != null ? v2.pnlBps(bankroll + v0 - v1, bankroll) : 0;
  const left = Math.max(2, Math.min(98, 50 + leadBps / 20));
  const names = [
    mySeat === 0 ? "You" : truncateAddress(pot.creator),
    mySeat === 1 ? "You" : pot.opponent ? truncateAddress(pot.opponent) : "Opponent",
  ];
  const final = match.status === v2.MatchStatus.Finalized;
  return (
    <Card className="flex flex-col gap-3" aria-label="Portfolio race">
      <div className="flex items-end justify-between gap-4">
        {[0, 1].map((i) => (
          <div key={i} className={cn("flex flex-col", i === 1 && "items-end text-right")}>
            <span className="text-xs font-bold uppercase">
              {names[i]} · {match.seats[i].trades} trades
            </span>
            <span className="font-mono text-2xl font-black tabular-nums">
              {values[i] != null ? formatMicroUsd(values[i]!) : "…"}
            </span>
            <span
              className={cn(
                "font-mono text-sm font-bold tabular-nums",
                values[i] != null && values[i]! >= bankroll ? "text-win" : "text-rug",
              )}
            >
              {values[i] != null ? formatPct(pnlPct(values[i]!, bankroll)) : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="relative flex h-8 border-[3px] border-border" role="img" aria-label={`Lead bar: ${names[0]} left, ${names[1]} right`}>
        <div className="h-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${left}%` }} />
        <div className="h-full flex-1 bg-accent" />
        <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-border" aria-hidden />
      </div>
      <p className="text-xs">
        {final
          ? "Final values, marked at the end price."
          : phase === "live" || phase === "starting"
            ? "Live values at the current oracle price. The result uses the first fresh price at the end of the window."
            : "Window over. Waiting for the final mark."}
      </p>
    </Card>
  );
}

function TradePanel({
  pot,
  arena,
  match,
  seat,
  phase,
  prices,
  publishTimes,
  now,
  onTraded,
}: {
  pot: PotWithAddress;
  arena: ArenaWithAddress;
  match: v2.Match;
  seat: 0 | 1;
  phase: Phase;
  prices: (bigint | null)[];
  publishTimes: (bigint | null)[];
  now: number;
  onTraded: () => void;
}) {
  const wallet = useWallet();
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const s = match.seats[seat];
  const session = getSessionKey(pot.matchAccount);
  const sessionValid = !!session && !!s.sessionKey && session.publicKey.equals(s.sessionKey);
  const signer: ErSigner = sessionValid ? { kind: "session", keypair: session! } : { kind: "wallet", wallet };
  const live = phase === "live";

  async function trade(i: number, side: "buy" | "sell", amount: bigint) {
    const price = prices[i];
    if (!pot.region || price == null || amount <= 0n) return;
    const symbol = coinForFeed(arena.assets[i].feed)?.symbol ?? `#${i}`;
    setPending((p) => ({ ...p, [i]: true }));
    setStatus(null);
    try {
      const preview = v2.previewTrade(side, amount, price, arena.assets[i].exponent, match.tradeFeeBps, SLIPPAGE_BPS);
      if (preview.amountOut === 0n) {
        setStatus({ ok: false, text: "That trade is too small." });
        return;
      }
      const ix = await v2.tradeIx(programV2, {
        signer: sessionValid ? session!.publicKey : wallet.publicKey!,
        matchAccount: pot.matchAccount,
        arena,
        assetIndex: i,
        side,
        amount,
        limitPrice: preview.limitPrice,
      });
      const { res, ms } = await timedSendErIxs(erConnectionFor(pot.region), signer, [ix]);
      if (res.ok) {
        setStatus({
          ok: true,
          text:
            side === "buy"
              ? `Bought ${symbol} for ${formatMicroUsd(amount)} (${ms} ms)`
              : `Sold ${symbol} for ${formatMicroUsd(preview.amountOut)} (${ms} ms)`,
        });
        onTraded();
      } else if (!res.cancelled) setStatus({ ok: false, text: res.message });
    } catch (e) {
      setStatus({ ok: false, text: unexpectedError(e) });
    } finally {
      setPending((p) => ({ ...p, [i]: false }));
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-black uppercase">Trade</h2>
        <span className="font-mono text-sm">
          Cash <strong>{formatMicroUsd(s.cash)}</strong>
        </span>
      </div>
      {!sessionValid && (
        <p className="border-[3px] border-border bg-muted p-2 text-sm">
          This browser doesn&apos;t have your trading key for this duel (it was set up in another browser, or site data
          was cleared). Trades will ask your wallet to sign instead. Some wallets, including Phantom, refuse because
          they check the trade against Solana instead of the rollup; if yours does, trading from this seat isn&apos;t
          possible here. Next time, play the duel in the browser you created or joined it from.
        </p>
      )}
      {phase === "starting" && <p className="text-sm font-bold">Trading opens when the countdown hits zero.</p>}
      <ul className="flex flex-col divide-y-[3px] divide-border border-[3px] border-border">
        {arena.assets.slice(0, match.assetCount).map((asset, i) => {
          const coin = coinForFeed(asset.feed);
          const price = prices[i];
          const pt = publishTimes[i];
          const fresh = pt != null && v2.isFresh(pt, BigInt(now), match.maxPriceAgeS);
          const qty = s.qty[i];
          const held = qty > 0n;
          const heldValue = held && price != null ? (qty * price) / 10n ** BigInt(asset.exponent) : 0n;
          const busy = !!pending[i];
          const canBuy = live && fresh && asset.enabled && price != null && !busy;
          const canSell = live && fresh && held && price != null && !busy;
          return (
            <li key={asset.feed.toBase58()} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="font-black uppercase">
                  {coin?.symbol ?? `Asset ${i}`}{" "}
                  <span className={cn("font-mono text-sm font-bold", !fresh && "opacity-50")}>
                    {price != null ? formatUsdPrice(v2.displayPrice(price, asset.exponent)) : "n/a"}
                  </span>
                  {!fresh && price != null && <span className="ml-2 text-xs">stale</span>}
                </span>
                <span className="font-mono text-xs">
                  {held ? `${(Number(qty) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 })} held · ${formatMicroUsd(heldValue)}` : "Not held"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {BUY_PRESETS_USD.map((usd) => {
                  const amount = BigInt(usd) * MICRO;
                  return (
                    <Button
                      key={usd}
                      variant="primary"
                      className="min-h-9 px-2 text-xs"
                      disabled={!canBuy || amount > s.cash}
                      onClick={() => trade(i, "buy", amount)}
                      aria-label={`Buy ${usd} dollars of ${coin?.symbol ?? "this coin"}`}
                    >
                      +${usd >= 1000 ? `${usd / 1000}k` : usd}
                    </Button>
                  );
                })}
                {SELL_PRESETS_PCT.map((pct) => (
                  <Button
                    key={pct}
                    variant="danger"
                    className="min-h-9 px-2 text-xs"
                    disabled={!canSell}
                    onClick={() => trade(i, "sell", pct === 100 ? qty : (qty * BigInt(pct)) / 100n)}
                    aria-label={`Sell ${pct} percent of ${coin?.symbol ?? "this coin"}`}
                  >
                    -{pct}%
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs">
        Buys and sells fill at the live oracle price, {(match.tradeFeeBps / 100).toFixed(2)}% fee, {SLIPPAGE_BPS / 100}%
        max slippage.
      </p>
      <p aria-live="polite" className={cn("min-h-5 text-sm font-bold", status && !status.ok && "text-rug")}>
        {status?.text ?? ""}
      </p>
    </Card>
  );
}

function Positions({
  arena,
  match,
  prices,
  values,
  mySeat,
}: {
  arena: ArenaWithAddress;
  match: v2.Match;
  prices: (bigint | null)[];
  values: (bigint | null)[];
  mySeat: 0 | 1 | null;
}) {
  const final = match.status === v2.MatchStatus.Finalized;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {match.seats.map((seat, si) => {
        const marks = final ? match.markPrices : prices;
        const rows = arena.assets.slice(0, match.assetCount).flatMap((asset, i) => {
          const q = seat.qty[i];
          if (q === 0n) return [];
          const p = marks[i];
          const value = p != null && p > 0n ? (q * p) / 10n ** BigInt(asset.exponent) : null;
          return [{ symbol: coinForFeed(asset.feed)?.symbol ?? `#${i}`, q, value }];
        });
        return (
          <Card key={si} className="flex flex-col gap-2">
            <h3 className="text-sm font-black uppercase">
              {mySeat === si ? "Your portfolio" : si === 0 ? "Creator" : "Opponent"}
              {values[si] != null && <span className="ml-2 font-mono">{formatMicroUsd(values[si]!)}</span>}
            </h3>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1">Cash</td>
                  <td className="py-1 text-right font-mono">{formatMicroUsd(seat.cash)}</td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className="py-1">
                      {r.symbol}{" "}
                      <span className="font-mono text-xs">
                        {(Number(r.q) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                      </span>
                    </td>
                    <td className="py-1 text-right font-mono">{r.value != null ? formatMicroUsd(r.value) : "…"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}

function SettlePanel({
  pot,
  match,
  phase,
  now,
}: {
  pot: PotWithAddress;
  match: v2.Match;
  phase: Phase;
  now: number;
}) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const protocol = useProtocol();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const finalized = phase === "settling";
  const home = useMatchHome(pot, finalized);
  const sinceEnd = now - Number(match.endTs);

  const me = wallet.publicKey;
  const tie = match.result === v2.MatchResult.Tie;
  const winner = match.result === v2.MatchResult.Creator ? pot.creator : match.result === v2.MatchResult.Opponent ? pot.opponent : null;
  const isPlayer = !!me && (me.equals(pot.creator) || (!!pot.opponent && me.equals(pot.opponent)));
  const iWon = !!me && !!winner && me.equals(winner);
  const pay = finalized
    ? v2.payout({
        entry: pot.entryLamports,
        sponsored: pot.sponsoredLamports,
        matchFee: pot.matchFeeLamports,
        feeShare: pot.feeShareLamports,
        settlerTip: pot.settlerTipLamports,
        rakeBps: pot.rakeBps,
        result: match.result as v2.MatchResultCode,
      })
    : null;
  // The winner claims (or either player on a tie). Anyone else gets the button only if
  // nobody has settled after 20 s, as a fallback; whoever settles earns the settler tip.
  const canClaim = finalized && !!me && (iWon || (tie && isPlayer));
  const canFallback = finalized && !!me && !canClaim && sinceEnd > 20;

  async function settle() {
    if (!me || !protocol.data) return;
    setBusy(true);
    setMessage(null);
    try {
      const ix = await v2.settleIx(programV2, { settler: me, pot, treasury: protocol.data.treasury });
      const res = await sendIxs(connection, wallet, [ix], v2.programErrorFromLogs);
      if (res.ok || (!res.cancelled && /already/i.test(res.message))) await queryClient.invalidateQueries({ queryKey: ["v2"] });
      else if (!res.cancelled) setMessage(res.message);
    } catch (e) {
      setMessage(unexpectedError(e));
    } finally {
      setBusy(false);
    }
  }

  // What this wallet receives if it settles: its payout share plus the settler tip.
  const mine =
    pay && me ? (me.equals(pot.creator) ? pay.toCreator : pot.opponent && me.equals(pot.opponent) ? pay.toOpponent : 0n) + pay.toSettler : 0n;
  const claimLabel = mine > 0n && (iWon || tie) ? `Claim ${formatSol(mine)} SOL` : "Record the result";

  return (
    <Card className={cn("flex flex-col gap-3", canClaim && iWon && "bg-win text-win-foreground")}>
      <h2 className="text-xl font-black uppercase">
        {!finalized ? "Finalizing" : iWon ? "You won" : tie ? "It's a tie" : "Final values are in"}
      </h2>
      <p className="text-sm">
        {!finalized
          ? "The window is over. Both portfolios are being marked at the end price on the rollup, then the duel moves back to Solana."
          : canClaim
            ? mine > 0n
              ? "Claim to pay the pot out on Solana. One wallet approval; the settler tip covers the network fee."
              : "Free duel: this records the result on Solana and pays the match fee back to the player who joined. One wallet approval."
            : "Waiting for the winner to claim the payout on Solana."}
      </p>
      {(canClaim || canFallback) && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={canClaim ? "accent" : "secondary"}
            size={canClaim ? "lg" : "md"}
            onClick={settle}
            loading={busy || (finalized && !home.data)}
            disabled={!protocol.data || !home.data}
          >
            {canClaim ? claimLabel : "Settle for them"}
          </Button>
          {!home.data && <span className="text-xs">Waiting for the duel to come back from the rollup (a few seconds).</span>}
          {canFallback && home.data && <span className="text-xs">Nobody has claimed yet. Anyone can settle; the settler earns the tip.</span>}
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm font-bold text-rug">
          {message}
        </p>
      )}
    </Card>
  );
}

function resultData(pot: PotWithAddress, arena: ArenaWithAddress, match: v2.Match, settleSignature?: string): ResultData {
  const pay = v2.payout({
    entry: pot.entryLamports,
    sponsored: pot.sponsoredLamports,
    matchFee: pot.matchFeeLamports,
    feeShare: pot.feeShareLamports,
    settlerTip: pot.settlerTipLamports,
    rakeBps: pot.rakeBps,
    result: match.result as v2.MatchResultCode,
  });
  const marks = arena.assets.slice(0, match.assetCount).flatMap((a, i) =>
    match.markPrices[i] > 0n
      ? [{ symbol: coinForFeed(a.feed)?.symbol ?? `#${i}`, price: v2.displayPrice(match.markPrices[i], a.exponent) }]
      : [],
  );
  return {
    creator: pot.creator,
    opponent: pot.opponent!,
    result: match.result,
    finalValues: match.finalValues,
    prize: pay.prize,
    bankroll: arena.bankroll,
    trades: [match.seats[0].trades, match.seats[1].trades],
    marks,
    settleSignature,
    rematch: { arenaId: pot.arenaId, windowSecs: pot.windowSecs, entryLamports: pot.entryLamports },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Backup for the crank: a player's tab finalizes the match itself right after the window
 * ends, signed by its session key (fee-free on the ER; verified on devnet with an unfunded
 * key). finalize_match only accepts marks published within MARK_TOLERANCE_S (5 s) of end_ts,
 * so this has to run automatically, not behind a button. Failures (crank got there first,
 * window not quite over) are retried until the tolerance passes; they cost nothing.
 */
function useAutoFinalize(pot: PotWithAddress, arena: ArenaWithAddress, session: Keypair | null, endTs: number) {
  const sessionId = session?.publicKey.toBase58();
  useEffect(() => {
    if (!session || !pot.region || !endTs) return;
    const er = erConnectionFor(pot.region);
    let stopped = false;
    (async () => {
      // Give the crank (which fires at end_ts + 200 ms) the first shot.
      await sleep(1_200 + Math.random() * 600);
      while (!stopped && Date.now() / 1000 < endTs + 5) {
        try {
          const ix = await v2.finalizeMatchIx(programV2, { payer: session.publicKey, matchAccount: pot.matchAccount, arena });
          const res = await sendErIxs(er, { kind: "session", keypair: session }, [ix], 4_000);
          if (res.ok) return;
          if (!res.cancelled && res.logs?.some((l) => /MatchNotActive/.test(l))) return;
        } catch {
          // Network blip: retry until the mark tolerance passes.
        }
        await sleep(500);
      }
    })();
    return () => {
      stopped = true;
    };
    // sessionId stands in for the session keypair, which is stable per match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, pot.region, pot.matchAccount, endTs, arena]);
}
