import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { rollGather, rollGlintTime } from './gathering';
import { makeRng } from './rng';

const cfg = CONFIG.gathering.junkHeap;

describe('rollGather', () => {
  it('is deterministic per seed', () => {
    expect(rollGather(cfg, true, makeRng(5))).toEqual(rollGather(cfg, true, makeRng(5)));
  });

  it('passive yield stays within the configured base range', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 500; i++) {
      const r = rollGather(cfg, false, rng);
      expect(r.amount).toBeGreaterThanOrEqual(cfg.yieldMin);
      expect(r.amount).toBeLessThanOrEqual(cfg.yieldMax);
      expect(r.rare).toBeNull();
      expect(r.glintHit).toBe(false);
    }
  });

  it('glint hits multiply yield and stay within the multiplied range', () => {
    const rng = makeRng(12);
    for (let i = 0; i < 500; i++) {
      const r = rollGather(cfg, true, rng);
      expect(r.amount).toBeGreaterThanOrEqual(Math.round(cfg.yieldMin * cfg.glint.yieldMultiplier));
      expect(r.amount).toBeLessThanOrEqual(Math.round(cfg.yieldMax * cfg.glint.yieldMultiplier));
    }
  });

  it('attentive play visibly beats passive play on average', () => {
    const rngA = makeRng(77);
    const rngB = makeRng(77);
    let passive = 0;
    let attentive = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      passive += rollGather(cfg, false, rngA).amount;
      attentive += rollGather(cfg, true, rngB).amount;
    }
    // Bible B3: engaged play is worth roughly 20-30%+ per glint cycle.
    expect(attentive / passive).toBeGreaterThan(1.2);
  });

  it('rare finds only ever come from glint hits, at roughly the configured rate', () => {
    const rng = makeRng(99);
    let rares = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const r = rollGather(cfg, true, rng);
      if (r.rare !== null) {
        expect(r.rare).toBe(cfg.glint.rareFindItem);
        rares++;
      }
    }
    const rate = rares / n;
    expect(rate).toBeGreaterThan(cfg.glint.rareFindChance * 0.7);
    expect(rate).toBeLessThan(cfg.glint.rareFindChance * 1.3);
  });
});

describe('rollGlintTime', () => {
  it('always lands inside the configured window fraction of the cycle', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 500; i++) {
      const t = rollGlintTime(cfg, cfg.gatherSeconds, rng);
      expect(t).toBeGreaterThanOrEqual(cfg.glint.earliestCycleFraction * cfg.gatherSeconds);
      expect(t).toBeLessThanOrEqual(cfg.glint.latestCycleFraction * cfg.gatherSeconds);
    }
  });
});
