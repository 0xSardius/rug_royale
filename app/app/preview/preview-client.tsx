"use client";

import { useState } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { DuelResult, DuelStatus, PROGRAM_ID, type Duel, type Pool } from "@rug-royale/sdk";
import { Button } from "@/components/ui/button";
import { PnlBars } from "@/components/duel/pnl-bars";
import { TradePanel } from "@/components/duel/trade-panel";
import { ResultCard, ResultPopup } from "@/components/duel/result";

const U = 1_000_000n;
const creator = Keypair.generate().publicKey;
const opponent = Keypair.generate().publicKey;
const pool: Pool = { duel: PublicKey.default, coin: PublicKey.default, quoteReserve: 5_400n * U, tokenReserve: 4_650n * U, bump: 255 };

const duel = (result: number): Duel & { address: PublicKey } => ({
  address: Keypair.generate().publicKey,
  status: DuelStatus.Settled,
  result,
  tier: 0,
  closed: false,
  bump: 255,
  windowSecs: 120,
  nonce: 1n,
  entryLamports: 50_000_000n,
  sponsoredLamports: 0n,
  bankroll: 1_000n * U,
  finalA: 1_046_000_000n,
  finalB: 958_000_000n,
  joinDeadline: 0n,
  startTs: 0n,
  endTs: 0n,
  creator,
  opponent,
  allowedOpponent: null,
  sponsor: null,
  coin: PublicKey.default,
  quoteMint: PublicKey.default,
});

export function PreviewClient() {
  const [popup, setPopup] = useState<{ duel: ReturnType<typeof duel>; wallet: string } | null>(null);
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black uppercase">Component preview (dev only)</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <PnlBars
          pool={pool}
          feeBps={30}
          bankroll={1_000n * U}
          rows={[
            { label: "You (creator)", balances: { quote: 750n * U, coin: 270n * U }, highlight: true },
            { label: "Opponent", balances: { quote: 900n * U, coin: 80n * U } },
          ]}
        />
        <TradePanel
          duelRef={{ programId: PROGRAM_ID, duel: PublicKey.default, creator, quoteMint: PublicKey.default, coinMint: PublicKey.default }}
          pool={pool}
          feeBps={30}
          balances={{ quote: 750n * U, coin: 270n * U }}
          coinSymbol="ZCAT"
        />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ResultCard duel={duel(DuelResult.Creator)} config={null} />
        <div className="flex flex-wrap items-start gap-3">
          <Button onClick={() => setPopup({ duel: duel(DuelResult.Creator), wallet: creator.toBase58() })}>Show You Win!</Button>
          <Button variant="danger" onClick={() => setPopup({ duel: duel(DuelResult.Creator), wallet: opponent.toBase58() })}>
            Show You Lose!
          </Button>
          <Button variant="secondary" onClick={() => setPopup({ duel: duel(DuelResult.Tie), wallet: creator.toBase58() })}>
            Show tie
          </Button>
        </div>
      </div>
      {popup && <ResultPopup key={popup.duel.address.toBase58()} duel={popup.duel} wallet={popup.wallet} prizeLamports={94_000_000n} />}
    </div>
  );
}
