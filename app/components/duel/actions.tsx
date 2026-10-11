"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { cancelDuelAccounts, settleAccounts, type DuelRef } from "@rug-royale/sdk";
import { Button } from "@/components/ui/button";
import { program } from "@/lib/program";
import { sendIxs, unexpectedError } from "@/lib/send";
import { formatSol } from "@/lib/format";

/** Shared shell: connect if needed, send, refresh, show errors inline. */
function ActionButton({
  label,
  busyLabel,
  variant,
  build,
  duel,
}: {
  label: string;
  busyLabel: string;
  variant: "primary" | "secondary" | "danger";
  build: (wallet: PublicKey) => Promise<Parameters<typeof sendIxs>[2]>;
  duel: PublicKey;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!wallet.publicKey) {
    return (
      <Button variant={variant} size="lg" onClick={() => setVisible(true)}>
        Connect wallet to {label.toLowerCase()}
      </Button>
    );
  }
  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await sendIxs(connection, wallet, await build(wallet.publicKey!));
      if (res.ok) await qc.invalidateQueries({ queryKey: ["duel-live", duel.toBase58()] });
      else if (!res.cancelled) setError(res.message);
    } catch (err) {
      setError(unexpectedError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button variant={variant} size="lg" loading={busy} onClick={run}>
        {busy ? busyLabel : label}
      </Button>
      {error && (
        <p role="alert" className="border-[3px] border-border bg-rug p-2 text-sm font-bold text-rug-foreground">
          {error}
        </p>
      )}
    </div>
  );
}

/** RT-1: any wallet can settle once the window ends; the crank usually gets there first. */
export function SettleButton({ duelRef, treasury, tipLamports }: { duelRef: DuelRef; treasury: PublicKey; tipLamports: bigint }) {
  return (
    <div className="flex flex-col gap-2">
      <ActionButton
        label="Settle duel"
        busyLabel="Confirm in wallet"
        variant="primary"
        duel={duelRef.duel}
        build={async (wallet) => [
          await program.methods.settle().accountsStrict(settleAccounts(duelRef, wallet, treasury)).instruction(),
        ]}
      />
      <p className="text-xs">Anyone can settle. The settler earns up to {formatSol(tipLamports)} SOL from the pot.</p>
    </div>
  );
}

/** REQ07: refunds go to the creator (and sponsor), never to the caller. */
export function CancelButton({ duelRef, sponsor }: { duelRef: DuelRef; sponsor: PublicKey | null }) {
  return (
    <ActionButton
      label="Cancel duel"
      busyLabel="Confirm in wallet"
      variant="secondary"
      duel={duelRef.duel}
      build={async (wallet) => [
        await program.methods.cancelDuel().accountsStrict(cancelDuelAccounts(duelRef, wallet, sponsor)).instruction(),
      ]}
    />
  );
}
