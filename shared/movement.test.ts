import { describe, expect, it } from 'vitest';
import { advanceMovement, makeMoveState, setPath } from './movement';

describe('movement stepping', () => {
  it('advances whole tiles as time accumulates', () => {
    let m = setPath(makeMoveState({ x: 0, y: 0 }), [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    m = advanceMovement(m, 0.1, 0.2);
    expect(m.tile).toEqual({ x: 0, y: 0 });
    m = advanceMovement(m, 0.1, 0.2);
    expect(m.tile).toEqual({ x: 1, y: 0 });
    m = advanceMovement(m, 0.45, 0.2);
    expect(m.tile).toEqual({ x: 3, y: 0 });
    expect(m.queue).toHaveLength(0);
    expect(m.acc).toBe(0);
  });

  it('is pure (does not mutate inputs)', () => {
    const m0 = setPath(makeMoveState({ x: 0, y: 0 }), [{ x: 1, y: 0 }]);
    const snapshot = JSON.parse(JSON.stringify(m0));
    advanceMovement(m0, 1, 0.2);
    expect(m0).toEqual(snapshot);
  });

  it('idles cleanly with an empty queue', () => {
    const m = advanceMovement(makeMoveState({ x: 2, y: 2 }), 5, 0.2);
    expect(m.tile).toEqual({ x: 2, y: 2 });
    expect(m.acc).toBe(0);
  });

  it('setPath resets the accumulator when starting from idle', () => {
    const idle = makeMoveState({ x: 0, y: 0 });
    const m = setPath(idle, [{ x: 0, y: 1 }]);
    expect(m.acc).toBe(0);
  });
});
