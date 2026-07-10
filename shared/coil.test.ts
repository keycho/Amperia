import { describe, expect, it } from 'vitest';
import {
  assertFreeSpin,
  COIL_TAKES_NO_CURRENCY,
  type CoilPrizeDef,
  coilDayKey,
  rollCoil,
} from './coil';
import { makeRng } from './rng';

const TABLE: readonly CoilPrizeDef[] = [
  { id: 'bolts-s', label: '15 Bolts', kind: 'bolts', weight: 30, amount: 15 },
  { id: 'bolts-m', label: '40 Bolts', kind: 'bolts', weight: 12, amount: 40 },
  { id: 'warmcup', label: 'A Warmcup', kind: 'item', weight: 20, amount: 1, itemId: 'warmcup' },
  { id: 'shard', label: 'Coil Shard', kind: 'shard', weight: 10, amount: 1 },
];

const OPTS = { shards: 0, shardsTarget: 6, cosmeticOwned: false, pity: 0, pityWeightStep: 4 };

describe('the Fortune Coil', () => {
  it('HARD RULE: the spin intent carries no currency, ever', () => {
    // Compile-time brand + runtime guard.
    expect(COIL_TAKES_NO_CURRENCY).toBe(true);
    expect(() => assertFreeSpin({ free: true })).not.toThrow();
    expect(() => assertFreeSpin({})).not.toThrow();
    expect(() => assertFreeSpin({ bolts: 10 })).toThrow(/currency input path does not exist/);
    expect(() => assertFreeSpin({ amp: 1 })).toThrow();
    expect(() => assertFreeSpin({ payment: 'x' })).toThrow();
  });

  it('no prize in a sane table ever costs anything', () => {
    for (const p of TABLE) expect(p.amount).toBeGreaterThan(0);
  });

  it('rolls are seed-stable and land inside the table', () => {
    const rng = makeRng(7);
    const a = rollCoil(TABLE, rng, OPTS);
    expect(a.index).toBeGreaterThanOrEqual(0);
    expect(a.index).toBeLessThan(TABLE.length);
    const again = rollCoil(TABLE, makeRng(7), OPTS);
    expect(again.prize.id).toBe(a.prize.id);
  });

  it('pity ramps shard odds', () => {
    let base = 0;
    let ramped = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (rollCoil(TABLE, makeRng(seed), OPTS).prize.kind === 'shard') base++;
      if (rollCoil(TABLE, makeRng(seed), { ...OPTS, pity: 10 }).prize.kind === 'shard') ramped++;
    }
    expect(ramped).toBeGreaterThan(base);
  });

  it('duplicate-pity: shard rolls convert once the cosmetic is complete', () => {
    for (let seed = 0; seed < 200; seed++) {
      const roll = rollCoil(TABLE, makeRng(seed), { ...OPTS, cosmeticOwned: true });
      expect(roll.prize.kind).not.toBe('shard');
      if (roll.converted) expect(roll.prize.kind).toBe('bolts');
    }
  });

  it('one spin per UTC day key', () => {
    expect(coilDayKey(Date.UTC(2026, 6, 10, 23, 59))).toBe('2026-07-10');
    expect(coilDayKey(Date.UTC(2026, 6, 11, 0, 1))).toBe('2026-07-11');
  });
});
