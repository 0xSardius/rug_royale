// v2 display formatting. Cash and bankrolls are micro-USD bigints; oracle prices are display
// numbers from v2.displayPrice (never used for settlement math).

const MICRO = 1_000_000n;

/** Micro-USD -> "$10,000" (cents shown only when non-zero). */
export function formatMicroUsd(micro: bigint) {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const cents = (abs % MICRO) / 10_000n;
  const dollars = (abs / MICRO).toLocaleString("en-US");
  return `${neg ? "-" : ""}$${dollars}${cents > 0n ? `.${cents.toString().padStart(2, "0")}` : ""}`;
}

/**
 * Coin price -> "$187.42" / "$0.8123" / "$0.00002145". Sub-dollar prices keep 4 significant
 * digits so memecoins like BONK still move visibly.
 */
export function formatUsdPrice(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "n/a";
  if (v >= 1) return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return `$${v.toLocaleString("en-US", { maximumSignificantDigits: 4, minimumSignificantDigits: 4 })}`;
}
