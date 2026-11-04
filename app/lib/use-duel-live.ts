"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import {
  PROGRAM_ID,
  decodeDuel,
  decodePool,
  playerVaults,
  poolAccounts,
  type Duel,
  type DuelRef,
  type Pool,
} from "@rug-royale/sdk";

export interface VaultBalances {
  quote: bigint;
  coin: bigint;
}

export interface DuelLive {
  duel: Duel & { address: PublicKey };
  ref: DuelRef;
  /** Null once close_duel has closed the pool. */
  pool: Pool | null;
  creator: VaultBalances;
  /** Null until someone joins. */
  opponent: VaultBalances | null;
}

const balance = (pk: PublicKey, info: { data: Buffer; owner: PublicKey; lamports: number; executable: boolean } | null) =>
  info ? unpackAccount(pk, info, TOKEN_2022_PROGRAM_ID).amount : 0n;

/**
 * Duel, pool, and all four vault balances in one getMultipleAccountsInfo call, polled every
 * 2 s while the duel is live (PRD §11 falls back to polling; one call keeps public-RPC load low).
 */
export function useDuelLive(address: PublicKey | null) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["duel-live", address?.toBase58()],
    enabled: !!address,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && (d.duel.closed || d.duel.status >= 2) ? 15_000 : 2_000;
    },
    queryFn: async (): Promise<DuelLive | null> => {
      const duelInfo = await connection.getAccountInfo(address!);
      if (!duelInfo) return null;
      const duel = { ...decodeDuel(duelInfo.data), address: address! };
      const ref: DuelRef = {
        programId: PROGRAM_ID,
        duel: address!,
        creator: duel.creator,
        opponent: duel.opponent ?? undefined,
        quoteMint: duel.quoteMint,
        coinMint: duel.coin,
      };
      const p = poolAccounts(ref);
      const c = playerVaults(ref, duel.creator);
      const o = duel.opponent ? playerVaults(ref, duel.opponent) : null;
      const keys = [p.pool, c.quote, c.coin, ...(o ? [o.quote, o.coin] : [])];
      const infos = await connection.getMultipleAccountsInfo(keys);
      return {
        duel,
        ref,
        pool: infos[0] ? decodePool(infos[0].data) : null,
        creator: { quote: balance(c.quote, infos[1]), coin: balance(c.coin, infos[2]) },
        opponent: o ? { quote: balance(o.quote, infos[3]), coin: balance(o.coin, infos[4]) } : null,
      };
    },
  });
}
