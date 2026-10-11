"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { BN } from "@anchor-lang/core";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { COINS, PROGRAM_ID, createDuelAccounts, payout } from "@rug-royale/sdk";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { RadioCard } from "@/components/ui/radio-card";
import { CoinAvatar } from "@/components/coin-avatar";
import { useConfig } from "@/lib/queries";
import { program } from "@/lib/program";
import { sendIxs, unexpectedError } from "@/lib/send";
import { CREATE_DUEL_CU } from "@/lib/config";
import { DEFAULT_MAX_ENTRY, DEFAULT_RAKE_BPS, DEFAULT_TIERS, DEFAULT_WINDOWS, JOIN_DEADLINES } from "@/lib/defaults";
import { formatCompact, formatSol, formatUsdCompact, formatWindow } from "@/lib/format";

const COIN_OPTIONS = COINS.coins.filter((c) => c.demoMint);

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

export default function CreatePage() {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const config = useConfig();

  const tiers = config.data?.tiers ?? DEFAULT_TIERS;
  const windows = config.data?.windows ?? DEFAULT_WINDOWS;
  const maxEntry = config.data?.maxEntryLamports ?? DEFAULT_MAX_ENTRY;
  const rakeBps = config.data?.rakeBps ?? DEFAULT_RAKE_BPS;

  const [coin, setCoin] = useState(COIN_OPTIONS[0]?.demoMint ?? "");
  const [tier, setTier] = useState("0");
  const [windowSecs, setWindowSecs] = useState(String(windows.includes(120) ? 120 : windows[0]));
  const [entry, setEntry] = useState("0.05");
  const [opponent, setOpponent] = useState("");
  const [deadline, setDeadline] = useState(String(JOIN_DEADLINES[1].secs));
  const [errors, setErrors] = useState<{ entry?: string; opponent?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const entryRef = useRef<HTMLInputElement>(null);
  const opponentRef = useRef<HTMLInputElement>(null);

  const entryLamports = parseSol(entry);
  const preview = useMemo(() => {
    if (entryLamports == null) return null;
    return payout({
      entryLamports,
      sponsoredLamports: 0n,
      settlerTipLamports: config.data?.settlerTipLamports ?? 1_000_000n,
      rakeBps,
      result: 1,
    });
  }, [entryLamports, rakeBps, config.data]);

  const validate = () => {
    const next: typeof errors = {};
    if (entryLamports == null) next.entry = "Enter an amount in SOL, like 0.05. Use 0 for an unranked duel.";
    else if (entryLamports > maxEntry) next.entry = `Devnet entries are capped at ${formatSol(maxEntry)} SOL.`;
    if (opponent.trim()) {
      try {
        const pk = new PublicKey(opponent.trim());
        if (wallet.publicKey && pk.equals(wallet.publicKey)) next.opponent = "That's your own wallet. Leave blank or invite someone else.";
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
    if (!validate() || entryLamports == null) return;

    setSubmitting(true);
    try {
      const nonce = randomNonce();
      const quoteMint = new PublicKey(COINS.quote.demoMint!);
      const { duel, accounts } = createDuelAccounts({
        programId: PROGRAM_ID,
        creator: wallet.publicKey,
        nonce,
        quoteMint,
        coinMint: new PublicKey(coin),
      });
      const joinDeadline = Math.floor(Date.now() / 1000) + Number(deadline);
      const ix = await program.methods
        .createDuel(
          new BN(nonce.toString()),
          Number(tier),
          Number(windowSecs),
          new BN(entryLamports.toString()),
          opponent.trim() ? new PublicKey(opponent.trim()) : PublicKey.default,
          new BN(joinDeadline),
        )
        .accountsStrict(accounts)
        .instruction();
      const res = await sendIxs(connection, wallet, [
        ComputeBudgetProgram.setComputeUnitLimit({ units: CREATE_DUEL_CU }),
        ix,
      ]);
      if (res.ok) router.push(`/duel/${duel.toBase58()}?created=1`);
      else if (!res.cancelled) setSubmitError(res.message);
    } catch (err) {
      setSubmitError(unexpectedError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const configMissing = config.isSuccess && config.data === null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black uppercase tracking-tight md:text-5xl">Create a duel</h1>

      {configMissing && (
        <Card role="status" className="bg-devnet text-devnet-foreground">
          <p className="font-bold">The protocol isn&apos;t initialized on devnet yet.</p>
          <p className="text-sm">You can explore the form, but creating a duel will fail until the team runs init-config.</p>
        </Card>
      )}

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <fieldset>
              <legend className="mb-1 text-lg font-black uppercase">Coin</legend>
              <p className="mb-4 text-sm text-muted-foreground">
                Both players trade a devnet stand-in for one of today&apos;s StonkFun top 10. Market cap is the real
                coin&apos;s, for context only.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {COIN_OPTIONS.map((c) => (
                  <RadioCard key={c.demoMint} name="coin" value={c.demoMint!} checked={coin === c.demoMint} onChange={setCoin}>
                    <CoinAvatar coin={c} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-black uppercase">{c.symbol}</span>
                      <span className="block truncate text-xs">{c.name}</span>
                    </span>
                    <span className="font-mono text-xs tabular-nums">{formatUsdCompact(c.marketCapUsd)}</span>
                  </RadioCard>
                ))}
              </div>
            </fieldset>
          </Card>

          <Card className="grid gap-6 md:grid-cols-2">
            <fieldset>
              <legend className="mb-3 text-lg font-black uppercase">Bankroll</legend>
              <div className="flex flex-col gap-2">
                {tiers.map((t, i) => (
                  <RadioCard key={i} name="tier" value={String(i)} checked={tier === String(i)} onChange={setTier}>
                    <span className="font-mono font-bold tabular-nums">{formatCompact(t)}</span>
                    <span className="text-sm">{COINS.quote.symbol} each</span>
                  </RadioCard>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-3 text-lg font-black uppercase">Trading window</legend>
              <div className="grid grid-cols-2 gap-2">
                {windows.map((w) => (
                  <RadioCard key={w} name="window" value={String(w)} checked={windowSecs === String(w)} onChange={setWindowSecs}>
                    <span className="font-mono font-bold tabular-nums">{formatWindow(w)}</span>
                  </RadioCard>
                ))}
              </div>
            </fieldset>
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
                  Both players escrow this. 0 makes it unranked. Max {formatSol(maxEntry)} SOL on devnet.
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
                  <RadioCard key={d.secs} name="deadline" value={String(d.secs)} checked={deadline === String(d.secs)} onChange={setDeadline}>
                    <span className="font-bold">{d.label}</span>
                  </RadioCard>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                If nobody joins in time, anyone can cancel and your entry comes back.
              </p>
            </fieldset>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col gap-4 bg-primary text-primary-foreground">
            <h2 className="text-xl font-black uppercase">Summary</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="You escrow now" value={entryLamports == null ? "—" : `${formatSol(entryLamports)} SOL`} />
              <Row label="Pot if they join" value={preview ? `${formatSol(preview.pot)} SOL` : "—"} />
              <Row label={`Rake (${rakeBps / 100}%)`} value={preview ? `${formatSol(preview.rake)} SOL` : "—"} />
              <Row label="Settler tip" value={preview ? `${formatSol(preview.tip)} SOL` : "—"} />
              <Row label="Winner takes" value={preview ? `${formatSol(preview.prize)} SOL` : "—"} strong />
            </dl>
            <p className="text-xs">
              Trading starts 60 s after someone joins. The first buyer gets the better price, so be quick.
            </p>
            {entryLamports === 0n && <Badge tone="muted">Unranked: no money changes hands</Badge>}
            {submitError && (
              <p role="alert" className="border-[3px] border-border bg-rug p-2 text-sm font-bold text-rug-foreground">
                {submitError}
              </p>
            )}
            {wallet.publicKey ? (
              <Button type="submit" variant="secondary" size="lg" loading={submitting}>
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
