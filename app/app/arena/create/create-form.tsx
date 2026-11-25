"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { RadioCard } from "@/components/ui/radio-card";
import { ErrorState } from "@/components/states";
import { JOIN_DEADLINES } from "@/lib/defaults";
import { formatSol, formatWindow } from "@/lib/format";
import { sendIxs, unexpectedError } from "@/lib/send";
import { formatMicroUsd } from "@/lib/v2/format";
import { arenaName, programV2 } from "@/lib/v2/program";
import { useArenas, useProtocol } from "@/lib/v2/queries";
import { newSessionKey, storeSessionKey } from "@/lib/v2/session-keys";
import { nearestRegion, useRegionPings } from "@/lib/v2/use-region-pings";

/** "0.05" -> lamports; null if not a valid non-negative SOL amount with <= 9 decimals. */
function parseSol(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d*(\.\d{0,9})?$/.test(t) || t === "" || t === ".") return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w || "0") * 1_000_000_000n + BigInt(f.padEnd(9, "0"));
}

function randomNonce(): bigint {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return b.reduce((acc, x) => (acc << 8n) | BigInt(x), 0n);
}

/** Region used when no ER answered the ping (the duel still works, just with more latency). */
const FALLBACK_REGION: v2.Region = "us";

/** Prefill from the URL (rematch links): /arena/create?arena=1&window=300&entry=0.01&opponent=... */
export interface CreatePrefill {
  arena?: string;
  window?: string;
  entry?: string;
  opponent?: string;
}

export function CreateDuelForm({ initial }: { initial: CreatePrefill }) {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const arenas = useArenas();
  const protocol = useProtocol();
  const pings = useRegionPings();

  const [arenaId, setArenaId] = useState<string>(initial.arena ?? "");
  const [windowChoice, setWindowSecs] = useState<string>(initial.window ?? "");
  const [entry, setEntry] = useState(initial.entry ?? "0.01");
  const [opponent, setOpponent] = useState(initial.opponent ?? "");
  const [deadline, setDeadline] = useState(String(JOIN_DEADLINES[1].secs));
  const [errors, setErrors] = useState<{ entry?: string; opponent?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const entryRef = useRef<HTMLInputElement>(null);
  const opponentRef = useRef<HTMLInputElement>(null);

  // Defaults: the first unpaused arena and its shortest window (D3: 5 min quick match).
  const arena =
    arenas.data?.find((a) => String(a.arenaId) === arenaId) ??
    arenas.data?.find((a) => !a.paused) ??
    arenas.data?.[0];
  const windowSecs =
    arena && arena.windows.includes(Number(windowChoice)) ? windowChoice : String(arena ? Math.min(...arena.windows) : "");
  const selectedArenaId = arena ? String(arena.arenaId) : "";

  const nearest = nearestRegion(pings.data);
  const region = nearest ?? FALLBACK_REGION;

  const entryLamports = parseSol(entry);
  const matchFee = protocol.data?.matchFeeLamports ?? 0n;
  const maxEntry = arena
    ? protocol.data && protocol.data.maxEntryLamports < arena.maxEntryLamports
      ? protocol.data.maxEntryLamports
      : arena.maxEntryLamports
    : 0n;

  const preview = useMemo(() => {
    if (entryLamports == null || !protocol.data || !arena) return null;
    const share = v2.feeShare(entryLamports, matchFee);
    const p = v2.payout({
      entry: entryLamports,
      sponsored: 0n,
      matchFee,
      feeShare: share,
      settlerTip: protocol.data.settlerTipLamports,
      rakeBps: arena.rakeBps,
      result: v2.RESULT_CREATOR,
    });
    return { ...p, deposit: entryLamports + share, share };
  }, [entryLamports, matchFee, protocol.data, arena]);

  const validate = () => {
    const next: typeof errors = {};
    if (entryLamports == null) next.entry = "Enter an amount in SOL, like 0.01. Use 0 for a free duel.";
    else if (arena && entryLamports !== 0n && (entryLamports < arena.minEntryLamports || entryLamports > maxEntry))
      next.entry = `Entry must be 0 (free) or between ${formatSol(arena.minEntryLamports)} and ${formatSol(maxEntry)} SOL.`;
    if (opponent.trim()) {
      try {
        const pk = new PublicKey(opponent.trim());
        if (wallet.publicKey && pk.equals(wallet.publicKey))
          next.opponent = "That's your own wallet. Leave blank or invite someone else.";
      } catch {
        next.opponent = "That isn't a valid Solana address.";
      }
    }
    setErrors(next);
    if (next.entry) entryRef.current?.focus();
    else if (next.opponent) opponentRef.current?.focus();
    return !next.entry && !next.opponent;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!wallet.publicKey) return setVisible(true);
    if (!arena || !validate() || entryLamports == null) return;

    setSubmitting(true);
    try {
      const session = newSessionKey();
      const { ix, matchAccount, pot } = await v2.createMatchIx(programV2, {
        creator: wallet.publicKey,
        arenaId: arena.arenaId,
        nonce: randomNonce(),
        windowSecs: Number(windowSecs),
        entryLamports,
        joinDeadline: BigInt(Math.floor(Date.now() / 1000) + Number(deadline)),
        sessionKey: session.publicKey,
        validator: v2.VALIDATORS[region],
        allowedOpponent: opponent.trim() ? new PublicKey(opponent.trim()) : null,
      });
      const res = await sendIxs(connection, wallet, [ix], v2.programErrorFromLogs);
      if (res.ok) {
        storeSessionKey(matchAccount, session);
        router.push(`/arena/duel/${pot.toBase58()}?created=1`);
      } else if (!res.cancelled) setSubmitError(res.message);
    } catch (err) {
      setSubmitError(unexpectedError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (arenas.isError || protocol.isError) {
    return (
      <ErrorState
        message="The devnet RPC didn't answer. It rate-limits often."
        onRetry={() => {
          arenas.refetch();
          protocol.refetch();
        }}
      />
    );
  }

  const notReady = arenas.isSuccess && (arenas.data.length === 0 || protocol.data === null);
  const paused = !!protocol.data?.paused || !!arena?.paused;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black uppercase tracking-tight md:text-5xl">Create a duel</h1>

      {notReady && (
        <Card role="status" className="bg-devnet text-devnet-foreground">
          <p className="font-bold">v2 isn&apos;t set up on this cluster yet.</p>
          <p className="text-sm">Creating a duel will fail until the protocol and an arena exist.</p>
        </Card>
      )}
      {paused && (
        <Card role="status" className="bg-rug text-rug-foreground">
          <p className="font-bold">{protocol.data?.paused ? "The protocol is paused." : "This arena is paused."}</p>
          <p className="text-sm">New duels are blocked until an admin unpauses it.</p>
        </Card>
      )}

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          {(arenas.data?.length ?? 0) > 1 && (
            <Card>
              <fieldset>
                <legend className="mb-3 text-lg font-black uppercase">Arena</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {arenas.data!.map((a) => (
                    <RadioCard
                      key={a.arenaId}
                      name="arena"
                      value={String(a.arenaId)}
                      checked={selectedArenaId === String(a.arenaId)}
                      onChange={setArenaId}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-black uppercase">{arenaName(a.arenaId)}</span>
                        <span className="block text-xs">
                          {a.assets.length} coins · {formatMicroUsd(a.bankroll)} bankroll
                        </span>
                      </span>
                      {a.paused && <Badge tone="rug">Paused</Badge>}
                    </RadioCard>
                  ))}
                </div>
              </fieldset>
            </Card>
          )}

          <Card className="grid gap-6 md:grid-cols-2">
            <fieldset>
              <legend className="mb-3 text-lg font-black uppercase">Trading window</legend>
              <div className="grid grid-cols-3 gap-2">
                {(arena?.windows ?? []).map((w) => (
                  <RadioCard
                    key={w}
                    name="window"
                    value={String(w)}
                    checked={windowSecs === String(w)}
                    onChange={setWindowSecs}
                  >
                    <span className="font-mono font-bold tabular-nums">{formatWindow(w)}</span>
                  </RadioCard>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1">
              <p className="text-lg font-black uppercase">Region</p>
              <p className="font-mono text-lg">
                {v2.REGION_LABEL[region]}
                {nearest && pings.data?.[nearest] != null && (
                  <span className="text-sm text-muted-foreground"> · {pings.data[nearest]} ms</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {pings.isPending
                  ? "Measuring your ping…"
                  : nearest
                    ? "Your nearest MagicBlock region. Trades for this duel run there."
                    : `No region answered the ping, so this duel runs in ${v2.REGION_LABEL[FALLBACK_REGION]}.`}
              </p>
            </div>
          </Card>

          <Card className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="entry" className="text-lg font-black uppercase">
                Entry (SOL)
              </label>
              <input
                ref={entryRef}
                id="entry"
                name="entry"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onBlur={validate}
                aria-invalid={!!errors.entry}
                aria-describedby={errors.entry ? "entry-error" : "entry-help"}
                className="h-11 border-[3px] border-border bg-card px-3 font-mono text-lg tabular-nums focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring aria-invalid:border-rug"
              />
              {errors.entry ? (
                <p id="entry-error" className="text-sm font-bold text-rug">
                  {errors.entry}
                </p>
              ) : (
                <p id="entry-help" className="text-xs text-muted-foreground">
                  Both players escrow this. 0 makes it a free duel.
                  {arena && ` Otherwise ${formatSol(arena.minEntryLamports)}–${formatSol(maxEntry)} SOL.`}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="opponent" className="text-lg font-black uppercase">
                Opponent <span className="text-sm font-bold normal-case text-muted-foreground">(optional)</span>
              </label>
              <input
                ref={opponentRef}
                id="opponent"
                name="opponent"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="7xKX...p2aB"
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                onBlur={validate}
                aria-invalid={!!errors.opponent}
                aria-describedby={errors.opponent ? "opponent-error" : "opponent-help"}
                className="h-11 border-[3px] border-border bg-card px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring aria-invalid:border-rug"
              />
              {errors.opponent ? (
                <p id="opponent-error" className="text-sm font-bold text-rug">
                  {errors.opponent}
                </p>
              ) : (
                <p id="opponent-help" className="text-xs text-muted-foreground">
                  Leave blank to let anyone join.
                </p>
              )}
            </div>
            <fieldset className="md:col-span-2">
              <legend className="mb-3 text-lg font-black uppercase">Join deadline</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {JOIN_DEADLINES.map((d) => (
                  <RadioCard
                    key={d.secs}
                    name="deadline"
                    value={String(d.secs)}
                    checked={deadline === String(d.secs)}
                    onChange={setDeadline}
                  >
                    <span className="font-bold">{d.label}</span>
                  </RadioCard>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                If nobody joins in time, anyone can cancel and your deposit comes back.
              </p>
            </fieldset>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col gap-4 bg-primary text-primary-foreground">
            <h2 className="text-xl font-black uppercase">Summary</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Bankroll each" value={arena ? formatMicroUsd(arena.bankroll) : "—"} />
              <Row label="You deposit now" value={preview ? `${formatSol(preview.deposit)} SOL` : "—"} />
              {preview && preview.share > 0n && (
                <Row label="(match fee share)" value={`${formatSol(preview.share)} SOL`} />
              )}
              <Row label="Pot if they join" value={preview ? `${formatSol(preview.pot)} SOL` : "—"} />
              <Row label="Match fee" value={preview ? `${formatSol(preview.fee)} SOL` : "—"} />
              <Row
                label={`Rake (${arena ? arena.rakeBps / 100 : 0}%)`}
                value={preview ? `${formatSol(preview.rake)} SOL` : "—"}
              />
              <Row label="Settler tip" value={preview ? `${formatSol(preview.tip)} SOL` : "—"} />
              <Row label="Winner takes" value={preview ? `${formatSol(preview.prize)} SOL` : "—"} strong />
            </dl>
            <p className="text-xs">
              Trading starts {arena?.startDelaySecs ?? 20} s after someone joins, so keep this tab open. Trades are
              signed by a key held in this tab: no wallet popups, but reloading the page loses it and you&apos;ll
              approve each trade in your wallet instead.
            </p>
            {entryLamports === 0n && (
              <Badge tone="muted">Free duel: you each cover half the match fee</Badge>
            )}
            {submitError && (
              <p role="alert" className="border-[3px] border-border bg-rug p-2 text-sm font-bold text-rug-foreground">
                {submitError}
              </p>
            )}
            {wallet.publicKey ? (
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                loading={submitting}
                disabled={!arena || !protocol.data || paused}
              >
                {submitting ? "Confirm in wallet" : "Create duel"}
              </Button>
            ) : (
              <Button type="button" variant="secondary" size="lg" onClick={() => setVisible(true)}>
                Connect wallet
              </Button>
            )}
          </Card>
        </aside>
      </form>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>{label}</dt>
      <dd className={strong ? "font-mono text-lg font-black tabular-nums" : "font-mono tabular-nums"}>{value}</dd>
    </div>
  );
}
