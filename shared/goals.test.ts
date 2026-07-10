import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { type GoalDef, goalMatches, weeklyGoals } from './goals';

describe('weekly goals', () => {
  it('deterministically picks 8 from the pool per week key', () => {
    const a = weeklyGoals('2026-07-06');
    const b = weeklyGoals('2026-07-06');
    expect(a.map((g) => g.id)).toEqual(b.map((g) => g.id));
    expect(a.length).toBe(CONFIG.goals.perWeek);
    expect(new Set(a.map((g) => g.id)).size).toBe(a.length); // no dupes
  });

  it('different weeks shuffle differently (almost surely)', () => {
    const a = weeklyGoals('2026-07-06').map((g) => g.id);
    const b = weeklyGoals('2026-07-13').map((g) => g.id);
    expect(a.join()).not.toBe(b.join());
  });

  it('claim ceiling honors the any-5 rule', () => {
    expect(CONFIG.goals.maxClaims).toBe(5);
    expect(CONFIG.goals.perWeek).toBe(8);
  });

  it('comms rules: goal copy never says earn/yield', () => {
    for (const g of CONFIG.goals.pool as readonly GoalDef[]) {
      expect(g.label.toLowerCase()).not.toMatch(/earn|yield|apy|invest/);
    }
  });
});

describe('goalMatches', () => {
  const gather: GoalDef = { id: 'x', label: 'x', kind: 'gather', itemId: 'brass', target: 5, bolts: 1 };
  const craft2: GoalDef = { id: 'y', label: 'y', kind: 'craft', minTier: 2, target: 1, bolts: 1 };

  it('filters by kind, item, and tier', () => {
    expect(goalMatches(gather, { kind: 'gather', itemId: 'brass', qty: 3 })).toBe(true);
    expect(goalMatches(gather, { kind: 'gather', itemId: 'salvage', qty: 3 })).toBe(false);
    expect(goalMatches(gather, { kind: 'craft', qty: 1 })).toBe(false);
    expect(goalMatches(craft2, { kind: 'craft', tier: 2, qty: 1 })).toBe(true);
    expect(goalMatches(craft2, { kind: 'craft', tier: 1, qty: 1 })).toBe(false);
    expect(goalMatches(craft2, { kind: 'craft', qty: 1 })).toBe(false);
  });
});
