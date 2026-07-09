import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  effectiveSeconds,
  levelForXp,
  levelProgress,
  makeSkillXp,
  nextUnlock,
  SKILL_BY_NODE,
  SKILLS,
  xpForLevel,
} from './mastery';

describe('mastery curve', () => {
  it('starts at level 1 with 0 xp and is monotonic', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelForXp(0)).toBe(1);
    for (let l = 2; l <= CONFIG.mastery.maxLevel; l++) {
      expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    }
  });

  it('is fast early and long-horizon late (OSRS shape)', () => {
    const early = xpForLevel(11) - xpForLevel(10);
    const late = xpForLevel(50) - xpForLevel(49);
    // A late level costs far more than an early one.
    expect(late / early).toBeGreaterThan(20);
    // A first session (a few hundred XP) reaches several levels.
    expect(levelForXp(300)).toBeGreaterThanOrEqual(4);
  });

  it('levelForXp inverts xpForLevel exactly at boundaries', () => {
    for (const l of [2, 10, 25, 50]) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      expect(levelForXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(CONFIG.mastery.maxLevel);
  });

  it('levelProgress runs 0..1', () => {
    expect(levelProgress(0)).toBe(0);
    const mid = xpForLevel(3) + (xpForLevel(4) - xpForLevel(3)) / 2;
    expect(levelProgress(mid)).toBeCloseTo(0.5, 1);
    expect(levelProgress(xpForLevel(50) + 999)).toBe(1);
  });
});

describe('gather-speed curve', () => {
  it('is modest and floored (never below the cap)', () => {
    const base = 2.6;
    expect(effectiveSeconds(base, 1)).toBe(base);
    expect(effectiveSeconds(base, 10)).toBeLessThan(base);
    expect(effectiveSeconds(base, 10)).toBeGreaterThan(base * 0.9);
    expect(effectiveSeconds(base, 50)).toBeGreaterThanOrEqual(base * CONFIG.mastery.speedCap);
    expect(effectiveSeconds(base, 500)).toBe(base * CONFIG.mastery.speedCap);
  });
});

describe('unlocks and mappings', () => {
  it('every skill has flags and nextUnlock walks them', () => {
    for (const skill of SKILLS) {
      const first = nextUnlock(skill, 1);
      expect(first).not.toBeNull();
      expect(first?.level).toBe(10);
      expect(nextUnlock(skill, 40)).toBeNull();
    }
  });

  it('every node kind trains a skill and makeSkillXp covers all skills', () => {
    const xp = makeSkillXp();
    for (const skill of Object.values(SKILL_BY_NODE)) {
      expect(xp[skill]).toBe(0);
    }
    expect(Object.keys(xp).sort()).toEqual([...SKILLS].sort());
  });
});
