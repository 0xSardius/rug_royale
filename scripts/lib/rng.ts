// Deterministic PRNG (mulberry32) so generated vectors and randomized tests are reproducible.
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Uniform bigint in [lo, hi]. */
  const big = (lo: bigint, hi: bigint) => {
    const span = hi - lo + 1n;
    const r =
      (BigInt(Math.floor(next() * 2 ** 32)) << 32n) |
      BigInt(Math.floor(next() * 2 ** 32));
    return lo + (r % span);
  };
  const int = (lo: number, hi: number) =>
    lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  return { next, big, int, pick };
}
