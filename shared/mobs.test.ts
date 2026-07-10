import { describe, expect, it } from 'vitest';
import { chebyshev, nextMobState, type MobAiSnapshot } from './mobs';

const cfg = { aggroRadiusTiles: 3, leashRadiusTiles: 7, windupSeconds: 0.6 };

const base: MobAiSnapshot = {
  state: 'idle',
  mobTile: { x: 32, y: 32 },
  homeTile: { x: 32, y: 32 },
  targetDist: null,
  targetDistFromHome: null,
  windupElapsed: 0,
  onCooldown: false,
};

describe('nextMobState', () => {
  it('idles until a Spark walks into aggro range', () => {
    expect(nextMobState({ ...base, targetDist: 4, targetDistFromHome: 4 }, cfg).state).toBe('idle');
    expect(nextMobState({ ...base, targetDist: 3, targetDistFromHome: 3 }, cfg).state).toBe(
      'chase',
    );
  });

  it('never aggros on a Spark outside the leash, even if close to the mob', () => {
    const d = nextMobState(
      { ...base, mobTile: { x: 38, y: 38 }, targetDist: 2, targetDistFromHome: 9 },
      cfg,
    );
    expect(d.state).toBe('idle');
  });

  it('chases into windup when adjacent and off cooldown', () => {
    const d = nextMobState(
      { ...base, state: 'chase', targetDist: 1, targetDistFromHome: 2 },
      cfg,
    );
    expect(d.state).toBe('windup');
  });

  it('keeps chasing (no windup) while the bite cooldown runs', () => {
    const d = nextMobState(
      { ...base, state: 'chase', targetDist: 1, targetDistFromHome: 2, onCooldown: true },
      cfg,
    );
    expect(d.state).toBe('chase');
  });

  it('gives up the chase once the target leaves the leash', () => {
    const d = nextMobState(
      { ...base, state: 'chase', targetDist: 5, targetDistFromHome: 8 },
      cfg,
    );
    expect(d.state).toBe('return');
  });

  it('windup always completes; bite lands only if still in reach', () => {
    const mid = nextMobState(
      { ...base, state: 'windup', windupElapsed: 0.3, targetDist: 1, targetDistFromHome: 2 },
      cfg,
    );
    expect(mid.state).toBe('windup');
    expect(mid.bite).toBe(false);
    const landed = nextMobState(
      { ...base, state: 'windup', windupElapsed: 0.6, targetDist: 1, targetDistFromHome: 2 },
      cfg,
    );
    expect(landed).toEqual({ state: 'chase', bite: true });
    const dodged = nextMobState(
      { ...base, state: 'windup', windupElapsed: 0.6, targetDist: 2, targetDistFromHome: 2 },
      cfg,
    );
    expect(dodged.bite).toBe(false);
  });

  it('returns home and settles back to idle', () => {
    const walking = nextMobState(
      { ...base, state: 'return', mobTile: { x: 36, y: 36 } },
      cfg,
    );
    expect(walking.state).toBe('return');
    const home = nextMobState({ ...base, state: 'return', mobTile: { x: 32, y: 33 } }, cfg);
    expect(home.state).toBe('idle');
  });
});

describe('chebyshev', () => {
  it('measures king-move distance', () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 3, y: -2 })).toBe(3);
  });
});
