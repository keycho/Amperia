import { describe, expect, it } from 'vitest';
import {
  dailySaleHeadroom,
  dayKey,
  merchantUnitPrice,
  pressureAfterRecovery,
  saleValue,
  type PriceBand,
} from './economy';

const band: PriceBand = { floor: 2, ceiling: 10, slidePerUnit: 0.01, recoverPerHour: 0.5 };

describe('merchantUnitPrice', () => {
  it('pays the ceiling at zero pressure and the floor at full pressure', () => {
    expect(merchantUnitPrice(0, band)).toBe(10);
    expect(merchantUnitPrice(1, band)).toBe(2);
  });

  it('never leaves the published band, even for out-of-range pressure', () => {
    expect(merchantUnitPrice(-3, band)).toBe(10);
    expect(merchantUnitPrice(7, band)).toBe(2);
  });

  it('slides monotonically down as pressure rises', () => {
    let last = Infinity;
    for (let p = 0; p <= 1; p += 0.1) {
      const price = merchantUnitPrice(p, band);
      expect(price).toBeLessThanOrEqual(last);
      last = price;
    }
  });
});

describe('saleValue', () => {
  it('a big dump is worth less per unit than the opening price', () => {
    const { totalBolts, endPressure } = saleValue(0, 100, band);
    expect(totalBolts).toBeLessThan(100 * 10);
    expect(totalBolts).toBeGreaterThanOrEqual(100 * 2);
    expect(endPressure).toBeCloseTo(1, 5);
  });

  it('selling one unit at zero pressure pays the ceiling', () => {
    expect(saleValue(0, 1, band).totalBolts).toBe(10);
  });

  it('two half-dumps equal one full dump (path independence)', () => {
    const whole = saleValue(0, 60, band);
    const first = saleValue(0, 30, band);
    const second = saleValue(first.endPressure, 30, band);
    expect(first.totalBolts + second.totalBolts).toBe(whole.totalBolts);
    expect(second.endPressure).toBeCloseTo(whole.endPressure, 9);
  });
});

describe('pressureAfterRecovery', () => {
  it('recovers toward the ceiling over time and clamps at zero', () => {
    expect(pressureAfterRecovery(1, 1, band)).toBeCloseTo(0.5, 9);
    expect(pressureAfterRecovery(1, 10, band)).toBe(0);
    expect(pressureAfterRecovery(0.2, -5, band)).toBeCloseTo(0.2, 9);
  });
});

describe('dailySaleHeadroom', () => {
  const noon = Date.UTC(2026, 6, 10, 12, 0, 0);
  it('tracks the cap within a day', () => {
    const r = dailySaleHeadroom(400, dayKey(noon), noon, 1500);
    expect(r.headroom).toBe(1100);
    expect(r.soldToday).toBe(400);
  });
  it('rolls over on a new UTC day', () => {
    const r = dailySaleHeadroom(1500, '2026-07-09', noon, 1500);
    expect(r.headroom).toBe(1500);
    expect(r.soldToday).toBe(0);
    expect(r.day).toBe('2026-07-10');
  });
});
