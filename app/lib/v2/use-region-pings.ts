"use client";

import { useQuery } from "@tanstack/react-query";
import { v2 } from "@rug-royale/sdk";
import { MB_CLUSTER } from "@/lib/v2/program";

export const REGIONS: v2.Region[] = ["us", "eu", "as"];

export type RegionPings = Record<v2.Region, number | null>;

const SAMPLES = 3;
const TIMEOUT_MS = 4_000;

/** Best-of-N round trip (ms) of a tiny JSON-RPC call to one ER, or null if unreachable. */
async function pingOnce(url: string): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    await r.text();
    return performance.now() - t0;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function pingRegion(region: v2.Region): Promise<number | null> {
  const url = v2.MAGICBLOCK[MB_CLUSTER].er[region];
  let best: number | null = null;
  // Sequential: the first call pays TLS setup; later ones measure the steady-state RTT.
  for (let i = 0; i < SAMPLES; i++) {
    const ms = await pingOnce(url);
    if (ms !== null && (best === null || ms < best)) best = ms;
  }
  return best === null ? null : Math.round(best);
}

/**
 * The viewer's ping to each MagicBlock ER region (D6). The ERs allow any origin and need no
 * key, so the browser measures them directly (not via /api/rpc, which would add a hop).
 */
export function useRegionPings() {
  return useQuery({
    queryKey: ["v2", "pings"],
    queryFn: async (): Promise<RegionPings> => {
      const ms = await Promise.all(REGIONS.map(pingRegion));
      return { us: ms[0], eu: ms[1], as: ms[2] };
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** Lowest-ping region, or null when none answered. A new duel is pinned here (D6). */
export function nearestRegion(pings: RegionPings | undefined): v2.Region | null {
  if (!pings) return null;
  let best: v2.Region | null = null;
  for (const r of REGIONS) {
    const ms = pings[r];
    if (ms !== null && (best === null || ms < (pings[best] as number))) best = r;
  }
  return best;
}
