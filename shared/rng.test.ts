import { describe, expect, it } from 'vitest';
import { makeRng, randInt, pick } from './rng';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const c = makeRng(43);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    const seqC = [c(), c(), c()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('produces values in [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('randInt covers the inclusive range and nothing else', () => {
    const rng = makeRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(randInt(rng, 1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('pick returns elements from the array', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 100; i++) {
      expect(['a', 'b']).toContain(pick(rng, ['a', 'b']));
    }
  });
});
