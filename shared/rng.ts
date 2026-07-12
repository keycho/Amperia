/**
 * Deterministic seeded RNG (mulberry32) so map decoration and every value
 * roll (gathering yields, rare finds) are reproducible and unit-testable.
 * Game logic must take an Rng argument instead of calling Math.random.
 */
export type Rng = () => number;

/** mulberry32 — small, fast, good-enough distribution for game rolls. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element (array must be non-empty). */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  const item = arr[Math.floor(rng() * arr.length)];
  if (item === undefined && arr.length === 0) {
    throw new Error('pick() from empty array');
  }
  return item as T;
}
