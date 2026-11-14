"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { v2 } from "@rug-royale/sdk";
import { MB_CLUSTER, PROGRAM_ID_V2 } from "@/lib/v2/program";

export interface PotWithAddress extends v2.Pot {
  address: PublicKey;
  /** ER region the match is pinned to (from Pot.validator), or null if unknown. */
  region: v2.Region | null;
}

export interface ArenaWithAddress extends v2.Arena {
  address: PublicKey;
}

/** On-chain Protocol (treasury, match fee, pause flag), or null before init. */
export function useProtocol() {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["v2", "protocol"],
    queryFn: async (): Promise<v2.Protocol | null> => {
      const info = await connection.getAccountInfo(v2.findProtocol(PROGRAM_ID_V2)[0]);
      return info ? v2.decodeProtocol(info.data) : null;
    },
    staleTime: 60_000,
  });
}

/** Every Arena account, by id. Arenas change only through admin updates, so cache long. */
export function useArenas() {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["v2", "arenas"],
    queryFn: async (): Promise<ArenaWithAddress[]> => {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID_V2, { filters: v2.arenaFilters() });
      const out: ArenaWithAddress[] = [];
      for (const a of accounts) {
        try {
          out.push({ ...v2.decodeArena(a.account.data), address: a.pubkey });
        } catch {
          // Skip accounts from an older layout rather than failing the lobby.
        }
      }
      return out.sort((a, b) => a.arenaId - b.arenaId);
    },
    staleTime: 60_000,
  });
}

function decodePots(accounts: readonly { pubkey: PublicKey; account: { data: Buffer } }[]): PotWithAddress[] {
  const out: PotWithAddress[] = [];
  for (const a of accounts) {
    try {
      const pot = v2.decodePot(a.account.data);
      out.push({ ...pot, address: a.pubkey, region: v2.regionOf(pot.validator) });
    } catch {
      // Skip undecodable accounts.
    }
  }
  return out;
}

/** The open lobby: Open pots whose join deadline hasn't passed, soonest deadline first. */
export function useOpenPots() {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["v2", "pots", "open"],
    queryFn: async () => {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID_V2, { filters: v2.openLobbyFilters() });
      const now = BigInt(Math.floor(Date.now() / 1000));
      return decodePots(accounts)
        .filter((p) => p.joinDeadline > now)
        .sort((a, b) => Number(a.joinDeadline - b.joinDeadline));
    },
    // getProgramAccounts costs 10 of the proxy's 300/min per-IP budget (lib/rate-limit.ts).
    refetchInterval: 10_000,
  });
}

/** Pots where the wallet is creator or opponent, newest join deadline first. */
export function useMyPots(wallet: PublicKey | null, refetchMs = 10_000) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["v2", "pots", "mine", wallet?.toBase58()],
    enabled: !!wallet,
    queryFn: async () => {
      const [asCreator, asOpponent] = await Promise.all([
        connection.getProgramAccounts(PROGRAM_ID_V2, { filters: v2.playerPotFilters(wallet!, "creator") }),
        connection.getProgramAccounts(PROGRAM_ID_V2, { filters: v2.playerPotFilters(wallet!, "opponent") }),
      ]);
      return decodePots([...asCreator, ...asOpponent]).sort((a, b) => Number(b.joinDeadline - a.joinDeadline));
    },
    refetchInterval: refetchMs,
  });
}

const erConnections = new Map<v2.Region, Connection>();
/** One shared Connection per ER region (feeds have live data only on ERs, spike 01). */
export function erConnectionFor(region: v2.Region) {
  let c = erConnections.get(region);
  if (!c) {
    c = new Connection(v2.MAGICBLOCK[MB_CLUSTER].er[region], { commitment: "processed" });
    erConnections.set(region, c);
  }
  return c;
}

/** Latest oracle price per feed (null = missing or undecodable), read from one ER region. */
export function usePriceFeeds(feeds: PublicKey[], region: v2.Region | null, refetchMs = 1_000) {
  return useQuery({
    queryKey: ["v2", "feeds", region, feeds.map((f) => f.toBase58()).join(",")],
    enabled: !!region && feeds.length > 0,
    queryFn: async (): Promise<(v2.PriceFeed | null)[]> => {
      const infos = await erConnectionFor(region!).getMultipleAccountsInfo(feeds);
      return infos.map((i) => (i ? v2.decodePriceFeed(i.data) : null));
    },
    refetchInterval: refetchMs,
    // Keep the last prices on screen while the next poll is in flight or after a blip.
    placeholderData: (prev) => prev,
  });
}
