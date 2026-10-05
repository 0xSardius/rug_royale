import { PublicKey } from "@solana/web3.js";
import { DEMO_DECIMALS } from "@rug-royale/sdk";

export function truncateAddress(address: string | PublicKey, chars = 4) {
  const s = typeof address === "string" ? address : address.toBase58();
  return s.length <= chars * 2 + 3 ? s : `${s.slice(0, chars)}...${s.slice(-chars)}`;
}

const LAMPORTS = 1_000_000_000n;

/** Lamports -> "0.05" (trailing zeros trimmed, up to 4 dp). */
export function formatSol(lamports: bigint) {
  const whole = lamports / LAMPORTS;
  const frac = (lamports % LAMPORTS).toString().padStart(9, "0").slice(0, 4).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Raw demo-token units -> "1,000" style display. */
export function formatToken(raw: bigint, decimals = DEMO_DECIMALS, maxFraction = 2) {
  const v = Number(raw) / 10 ** decimals;
  return v.toLocaleString("en-US", { maximumFractionDigits: maxFraction });
}

/** Compact bankroll label: 1_000 tokens -> "1K". */
export function formatCompact(raw: bigint, decimals = DEMO_DECIMALS) {
  return (Number(raw) / 10 ** decimals).toLocaleString("en-US", { notation: "compact" });
}

export function formatUsdCompact(v: number | null) {
  return v == null ? "n/a" : v.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact" });
}

export function formatWindow(secs: number) {
  return secs < 60 ? `${secs}s` : secs % 60 === 0 ? `${secs / 60} min` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/** Seconds -> "4h 12m" / "3m 05s" / "12s". */
export function formatCountdown(secs: number) {
  if (secs <= 0) return "0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}
