import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  amperiteStrikeYield,
  inSweetZone,
  koiYield,
  pickLiveFork,
  pulseIsOn,
  rollBrassRare,
  rollBrassSegmentYield,
  rollKoi,
  rollSignalRare,
  rollSweetZoneStart,
  signalYield,
  targetFrequencyAt,
  tensionValue,
} from './minigames';
import { makeRng } from './rng';

const brass = CONFIG.gathering.brassSeam;
const amp = CONFIG.gathering.amperite;
const koi = CONFIG.gathering.glowkoi;
const ant = CONFIG.gathering.antenna;

describe('brass forks', () => {
  it('segment yields stay in range and forks are 0/1', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 300; i++) {
      const y = rollBrassSegmentYield(brass, rng);
      expect(y).toBeGreaterThanOrEqual(brass.segmentYieldMin);
      expect(y).toBeLessThanOrEqual(brass.segmentYieldMax);
      expect([0, 1]).toContain(pickLiveFork(rng));
    }
  });

  it('rare rolls only on completed veins', () => {
    const rng = makeRng(2);
    for (let i = 0; i < 200; i++) expect(rollBrassRare(brass, false, rng)).toBe(false);
    let hits = 0;
    for (let i = 0; i < 5000; i++) if (rollBrassRare(brass, true, rng)) hits++;
    expect(hits / 5000).toBeGreaterThan(brass.rareFindChance * 0.6);
    expect(hits / 5000).toBeLessThan(brass.rareFindChance * 1.4);
  });
});

describe('amperite pulses', () => {
  it('is on-pulse near peaks and off-pulse between them', () => {
    const period = amp.pulsePeriodSeconds;
    const w = amp.pulseWindowSeconds;
    const phase = 0.4;
    expect(pulseIsOn(phase, phase, period, w)).toBe(true);
    expect(pulseIsOn(phase + period * 3, phase, period, w)).toBe(true);
    expect(pulseIsOn(phase + w / 2 - 0.001, phase, period, w)).toBe(true);
    expect(pulseIsOn(phase + period / 2, phase, period, w)).toBe(false);
  });

  it('on-pulse strikes beat lattice shatter', () => {
    expect(amperiteStrikeYield(amp, true)).toBeGreaterThan(amperiteStrikeYield(amp, false));
  });
});

describe('glowkoi', () => {
  it('size distribution roughly matches weights', () => {
    const rng = makeRng(7);
    const counts = [0, 0, 0];
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const idx = rollKoi(koi, rng).sizeIdx;
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    const totalW = koi.sizes.reduce((s, k) => s + k.weight, 0);
    koi.sizes.forEach((s, i) => {
      const expected = s.weight / totalW;
      expect((counts[i] ?? 0) / n).toBeGreaterThan(expected * 0.85);
      expect((counts[i] ?? 0) / n).toBeLessThan(expected * 1.15);
    });
  });

  it('tension is a 0..1 triangle wave', () => {
    const p = koi.tensionPeriodSeconds;
    expect(tensionValue(0, p)).toBe(0);
    expect(tensionValue(p / 2, p)).toBe(1);
    expect(tensionValue(p, p)).toBe(0);
    expect(tensionValue(p / 4, p)).toBeCloseTo(0.5);
    for (let t = 0; t < 5; t += 0.1) {
      const v = tensionValue(t, p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('sweet zone always fits inside the bar and detects hits', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 300; i++) {
      const start = rollSweetZoneStart(koi, rng);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start + koi.sweetZoneFraction).toBeLessThanOrEqual(1);
      expect(inSweetZone(start + koi.sweetZoneFraction / 2, start, koi.sweetZoneFraction)).toBe(
        true,
      );
      expect(inSweetZone(start + koi.sweetZoneFraction + 0.01, start, koi.sweetZoneFraction)).toBe(
        false,
      );
    }
  });

  it('bigger koi and rares land more', () => {
    expect(koiYield(koi, { sizeIdx: 2, rare: false })).toBeGreaterThan(
      koiYield(koi, { sizeIdx: 0, rare: false }),
    );
    expect(koiYield(koi, { sizeIdx: 0, rare: true })).toBe(
      koiYield(koi, { sizeIdx: 0, rare: false }) + koi.rareBonusYield,
    );
  });
});

describe('signal tuning (flagship)', () => {
  it('target stays inside the dial and drifts', () => {
    let moved = false;
    let prev = targetFrequencyAt(0, 1, ant);
    for (let t = 0; t < 10; t += 0.25) {
      const v = targetFrequencyAt(t, 1, ant);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (Math.abs(v - prev) > 0.01) moved = true;
      prev = v;
    }
    expect(moved).toBe(true);
  });

  it('yield scales with lock ratio (accuracy pays)', () => {
    expect(signalYield(ant, 0)).toBe(ant.yieldBase);
    expect(signalYield(ant, 1)).toBe(ant.yieldBase + ant.yieldLockBonus);
    expect(signalYield(ant, 0.5)).toBeGreaterThan(signalYield(ant, 0.1));
    expect(signalYield(ant, 2)).toBe(signalYield(ant, 1));
  });

  it('Ghost Frequencies need a near-perfect lock', () => {
    const rng = makeRng(4);
    for (let i = 0; i < 200; i++) {
      expect(rollSignalRare(ant, ant.rareLockRatio - 0.05, rng)).toBe(false);
    }
    let hits = 0;
    for (let i = 0; i < 5000; i++) if (rollSignalRare(ant, 0.95, rng)) hits++;
    expect(hits).toBeGreaterThan(0);
  });
});
