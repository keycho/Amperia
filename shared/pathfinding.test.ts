import { describe, expect, it } from 'vitest';
import { canStep, findPath, findPathAdjacent, type PathGrid } from './pathfinding';

function gridFrom(rows: string[]): PathGrid {
  return {
    size: rows.length,
    walkable: rows.map((r) => [...r].map((c) => c === '.')),
  };
}

describe('findPath', () => {
  it('walks a straight line', () => {
    const g = gridFrom(['....', '....', '....', '....']);
    const p = findPath(g, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(p).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('returns [] when already at the goal', () => {
    const g = gridFrom(['..', '..']);
    expect(findPath(g, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });

  it('routes around blocked tiles with optimal length', () => {
    const g = gridFrom([
      '..#..',
      '..#..',
      '..#..',
      '.....',
      '.....',
    ]);
    const p = findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(p).not.toBeNull();
    // Around the wall: down 3, across 4, up 3 — optimal is 10 steps.
    expect(p as unknown[]).toHaveLength(10);
    // Every step is orthogonal (never diagonal → no corner cutting).
    let prev = { x: 0, y: 0 };
    for (const step of p ?? []) {
      expect(Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y)).toBe(1);
      expect(g.walkable[step.y]?.[step.x]).toBe(true);
      prev = step;
    }
  });

  it('returns null for unreachable or blocked goals', () => {
    const g = gridFrom([
      '..#..',
      '..#..',
      '#####',
      '..#..',
      '..#..',
    ]);
    expect(findPath(g, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeNull();
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it('handles large open grids quickly', () => {
    const size = 40;
    const g: PathGrid = {
      size,
      walkable: Array.from({ length: size }, () => Array(size).fill(true)),
    };
    const started = performance.now();
    for (let i = 0; i < 200; i++) {
      findPath(g, { x: 0, y: 0 }, { x: size - 1, y: size - 1 });
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('findPathAdjacent', () => {
  const g = gridFrom([
    '.....',
    '.....',
    '..#..',
    '.....',
    '.....',
  ]);

  it('paths to a tile next to the footprint', () => {
    const p = findPathAdjacent(g, { x: 0, y: 0 }, { x: 2, y: 2, w: 1, h: 1 });
    expect(p).not.toBeNull();
    const last = (p as { x: number; y: number }[]).at(-1);
    const adjacent =
      last !== undefined && Math.abs(last.x - 2) + Math.abs(last.y - 2) === 1;
    expect(adjacent).toBe(true);
  });

  it('returns [] when already adjacent', () => {
    expect(findPathAdjacent(g, { x: 1, y: 2 }, { x: 2, y: 2, w: 1, h: 1 })).toEqual([]);
  });

  it('returns null when the footprint is fully sealed', () => {
    const sealed = gridFrom([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ]);
    expect(findPathAdjacent(sealed, { x: 0, y: 0 }, { x: 2, y: 2, w: 1, h: 1 })).toBeNull();
  });
});

describe('terrain elevation (R4)', () => {
  // A 5×5 yard with a raised 2×2 platform at (2..3, 1..2) and one stair
  // tile at (1,1): cliff edges block, the stair carries traffic.
  const elev = [
    [0, 0, 0, 0, 0],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];
  const ramp = [
    [false, false, false, false, false],
    [false, true, false, false, false],
    [false, false, false, false, false],
    [false, false, false, false, false],
    [false, false, false, false, false],
  ];
  const g = {
    size: 5,
    walkable: Array.from({ length: 5 }, () => Array(5).fill(true) as boolean[]),
    elevation: elev,
    ramp,
  };

  it('canStep crosses a level only over a ramp', () => {
    expect(canStep(g, 1, 1, 2, 1)).toBe(true); // ramp → platform
    expect(canStep(g, 2, 1, 1, 1)).toBe(true); // platform → ramp
    expect(canStep(g, 2, 0, 2, 1)).toBe(false); // cliff edge from the north
    expect(canStep(g, 3, 3, 3, 2)).toBe(false); // cliff edge from the south
    expect(canStep(g, 0, 0, 1, 0)).toBe(true); // flat ground unaffected
  });

  it('A* routes over the stair, never up a cliff face', () => {
    const p = findPath(g, { x: 4, y: 3 }, { x: 3, y: 2 });
    expect(p).not.toBeNull();
    const path = p as { x: number; y: number }[];
    // The path must pass through the stair tile (1,1).
    expect(path.some((t) => t.x === 1 && t.y === 1)).toBe(true);
  });

  it('a platform with no ramp is unreachable', () => {
    const noRamp = { ...g, ramp: undefined };
    expect(findPath(noRamp, { x: 0, y: 0 }, { x: 2, y: 1 })).toBeNull();
  });
});
