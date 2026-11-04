"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  type Config,
  type Duel,
  DuelStatus,
  decodeConfig,
  decodeDuel,
  decodePool,
  duelsAsCreator,
  duelsAsOpponent,
  duelsByStatus,
  findConfig,
} from "@rug-royale/sdk";

export interface DuelWithAddress extends Duel {
  address: PublicKey;
}

/** On-chain Config, or null when init-config hasn't run on this cluster yet. */
export function useConfig() {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["config"],
    queryFn: async (): Promise<Config | null> => {
      const info = await connection.getAccountInfo(findConfig(PROGRAM_ID)[0]);
      return info ? decodeConfig(info.data) : null;
    },
    staleTime: 60_000,
  });
}

function decodeAll(accounts: readonly { pubkey: PublicKey; account: { data: Buffer } }[]): DuelWithAddress[] {
  const out: DuelWithAddress[] = [];
  for (const a of accounts) {
    try {
      out.push({ ...decodeDuel(a.account.data), address: a.pubkey });
    } catch {
      // Skip accounts from older layouts rather than failing the whole list.
    }
  }
  return out;
}

/** REQ11 lobby: Open duels whose join deadline hasn't passed, soonest deadline first. */
export function useOpenDuels() {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["duels", "open"],
    queryFn: async () => {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters: duelsByStatus(DuelStatus.Open) });
      const now = BigInt(Math.floor(Date.now() / 1000));
      return decodeAll(accounts)
        .filter((d) => d.joinDeadline > now)
        .sort((a, b) => Number(a.joinDeadline - b.joinDeadline));
    },
    refetchInterval: 10_000,
  });
}

/** Duels where the wallet is creator or opponent, newest window first. */
export function useMyDuels(wallet: PublicKey | null) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["duels", "mine", wallet?.toBase58()],
    enabled: !!wallet,
    queryFn: async () => {
      const [asCreator, asOpponent] = await Promise.all([
        connection.getProgramAccounts(PROGRAM_ID, { filters: duelsAsCreator(wallet!) }),
        connection.getProgramAccounts(PROGRAM_ID, { filters: duelsAsOpponent(wallet!) }),
      ]);
      return decodeAll([...asCreator, ...asOpponent]).sort((a, b) => Number(b.joinDeadline - a.joinDeadline));
    },
  });
}

export function useDuel(address: PublicKey | null) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["duel", address?.toBase58()],
    enabled: !!address,
    queryFn: async () => {
      const info = await connection.getAccountInfo(address!);
      return info ? { ...decodeDuel(info.data), address: address! } : null;
    },
    refetchInterval: 5_000,
  });
}

export function usePool(address: PublicKey | null) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["pool", address?.toBase58()],
    enabled: !!address,
    queryFn: async () => {
      const info = await connection.getAccountInfo(address!);
      return info ? decodePool(info.data) : null;
    },
    refetchInterval: 5_000,
  });
}
