// decodePriceFeed must not depend on Buffer's BigInt methods: the browser Buffer polyfill
// bundled by Next.js lacks them, which once made every lobby ticker read "n/a".
import { expect } from "chai";
import { v2 } from "@rug-royale/sdk";

function feedBytes(
  tag: 0 | 1,
  price: bigint,
  publishTime: bigint,
  slot: bigint
): Uint8Array {
  const msg = tag === 0 ? 42 : 41;
  const out = new Uint8Array(msg + 92 + 16);
  out[40] = tag;
  const v = new DataView(out.buffer);
  v.setBigInt64(msg + 32, price, true);
  v.setInt32(msg + 48, -8, true);
  v.setBigInt64(msg + 52, publishTime, true);
  v.setBigUint64(msg + 84, slot, true);
  return out;
}

describe("v2 oracle decode", () => {
  it("decodes partial and full verification layouts from a plain Uint8Array", () => {
    for (const tag of [0, 1] as const) {
      const d = v2.decodePriceFeed(
        feedBytes(tag, 7_103_360_437n, 1_764_000_000n, 525_602_167n)
      )!;
      expect(d.price).to.equal(7_103_360_437n);
      expect(d.publishTime).to.equal(1_764_000_000n);
      expect(d.postedSlot).to.equal(525_602_167n);
      expect(d.exponentField).to.equal(-8);
      expect(d.verification).to.equal(tag === 0 ? "partial" : "full");
    }
  });

  it("works on an offset view with Buffer BigInt reads unavailable", () => {
    const proto = Buffer.prototype as unknown as Record<string, unknown>;
    const saved = ["readBigInt64LE", "readBigUInt64LE"].map(
      (k) => [k, proto[k]] as const
    );
    try {
      for (const [k] of saved) proto[k] = undefined;
      const inner = feedBytes(0, -5n, 9n, 10n);
      const big = new Uint8Array(inner.length + 3);
      big.set(inner, 3);
      const d = v2.decodePriceFeed(big.subarray(3))!;
      expect(d.price).to.equal(-5n);
      expect(d.publishTime).to.equal(9n);
    } finally {
      for (const [k, f] of saved) proto[k] = f;
    }
  });

  it("rejects unknown tags and short data", () => {
    const bad = feedBytes(0, 1n, 1n, 1n);
    bad[40] = 7;
    expect(v2.decodePriceFeed(bad)).to.equal(null);
    expect(v2.decodePriceFeed(new Uint8Array(60))).to.equal(null);
  });
});
