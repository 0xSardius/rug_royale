// MagicBlock Pricing Oracle feeds (Pyth PriceUpdateV2), mirrored from
// programs/rug_royale_v2/src/oracle.rs. Live data exists only on ER endpoints (spike 01).
// The message's `exponent` field is unreliable (reads 8 for every feed); use the arena's.

export interface PriceFeed {
  /** Raw price (scale by the arena asset's exponent, not `exponentField`). */
  price: bigint;
  publishTime: bigint;
  postedSlot: bigint;
  /** As stored in the account; do not use for pricing. */
  exponentField: number;
  verification: "partial" | "full";
}

// Reads use DataView, not Buffer.readBigInt64LE: the browser Buffer polyfill bundled by
// Next.js has no BigInt methods (same issue as pdas.ts), so a Buffer-based decoder throws in
// the app while working in Node.
export function decodePriceFeed(data: Uint8Array): PriceFeed | null {
  const tag = data[40];
  if (tag !== 0 && tag !== 1) return null;
  const msg = tag === 0 ? 42 : 41;
  if (data.length < msg + 92) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    price: v.getBigInt64(msg + 32, true),
    exponentField: v.getInt32(msg + 48, true),
    publishTime: v.getBigInt64(msg + 52, true),
    postedSlot: v.getBigUint64(msg + 84, true),
    verification: tag === 0 ? "partial" : "full",
  };
}

/** Real price as a JS number for display only (never for settlement math). */
export const displayPrice = (price: bigint, exponent: number) =>
  Number(price) / 10 ** exponent;
