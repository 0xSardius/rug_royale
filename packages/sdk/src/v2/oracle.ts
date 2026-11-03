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

export function decodePriceFeed(data: Uint8Array): PriceFeed | null {
  const b = Buffer.from(data);
  const tag = b[40];
  if (tag !== 0 && tag !== 1) return null;
  const msg = tag === 0 ? 42 : 41;
  if (b.length < msg + 92) return null;
  return {
    price: b.readBigInt64LE(msg + 32),
    exponentField: b.readInt32LE(msg + 48),
    publishTime: b.readBigInt64LE(msg + 52),
    postedSlot: b.readBigUInt64LE(msg + 84),
    verification: tag === 0 ? "partial" : "full",
  };
}

/** Real price as a JS number for display only (never for settlement math). */
export const displayPrice = (price: bigint, exponent: number) =>
  Number(price) / 10 ** exponent;
