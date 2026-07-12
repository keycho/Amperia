import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  chargeThresholds,
  chargeTier,
  chargeWeekKey,
  isWeekendUtc,
  weekendXpMultiplier,
} from './charge';

const utc = (s: string) => Date.parse(s);

describe('chargeWeekKey — Monday (UTC) reset', () => {
  it('maps every day of a week to that week\'s Monday', () => {
    // 2026-07-06 is a Monday.
    expect(chargeWeekKey(utc('2026-07-06T00:00:00Z'))).toBe('2026-07-06');
    expect(chargeWeekKey(utc('2026-07-08T12:00:00Z'))).toBe('2026-07-06');
    expect(chargeWeekKey(utc('2026-07-12T23:59:59Z'))).toBe('2026-07-06');
  });

  it('rolls to a new key exactly at Monday 00:00 UTC', () => {
    expect(chargeWeekKey(utc('2026-07-12T23:59:59Z'))).toBe('2026-07-06');
    expect(chargeWeekKey(utc('2026-07-13T00:00:00Z'))).toBe('2026-07-13');
  });

  it('handles month and year boundaries', () => {
    // 2026-01-01 is a Thursday → its Monday is 2025-12-29.
    expect(chargeWeekKey(utc('2026-01-01T09:00:00Z'))).toBe('2025-12-29');
  });
});

describe('thresholds indexed to active players', () => {
  it('scales per-tier amounts by the active count', () => {
    const t = chargeThresholds(20);
    expect(t).toEqual(CONFIG.charge.tierPerActivePlayer.map((per) => Math.ceil(per * 20)));
  });

  it('never drops below the config floor', () => {
    expect(chargeThresholds(1)).toEqual(chargeThresholds(CONFIG.charge.minActivePlayers));
  });
});

describe('tier + weekend buff', () => {
  const thresholds = [100, 300, 700];

  it('steps through tiers as the meter fills', () => {
    expect(chargeTier(0, thresholds)).toBe(0);
    expect(chargeTier(99, thresholds)).toBe(0);
    expect(chargeTier(100, thresholds)).toBe(1);
    expect(chargeTier(500, thresholds)).toBe(2);
    expect(chargeTier(9999, thresholds)).toBe(3);
  });

  it('knows a UTC weekend', () => {
    expect(isWeekendUtc(utc('2026-07-11T10:00:00Z'))).toBe(true); // Saturday
    expect(isWeekendUtc(utc('2026-07-12T10:00:00Z'))).toBe(true); // Sunday
    expect(isWeekendUtc(utc('2026-07-10T10:00:00Z'))).toBe(false); // Friday
  });

  it('buffs gather XP only on buffed weekends, scaling with tier', () => {
    const sat = utc('2026-07-11T10:00:00Z');
    const fri = utc('2026-07-10T10:00:00Z');
    const per = CONFIG.charge.weekendXpBonusPerTier;
    expect(weekendXpMultiplier(0, sat)).toBe(1);
    expect(weekendXpMultiplier(2, fri)).toBe(1);
    expect(weekendXpMultiplier(1, sat)).toBeCloseTo(1 + per);
    expect(weekendXpMultiplier(3, sat)).toBeCloseTo(1 + 3 * per);
  });
});
