import { describe, expect, it } from 'vitest';
import { VariantPicker } from './propVariants';

describe('VariantPicker (V1 repetition breaking)', () => {
  it('is deterministic: same placements, same picks', () => {
    const a = new VariantPicker();
    const b = new VariantPicker();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(a.pick('crate', x, y, 4)).toBe(b.pick('crate', x, y, 4));
      }
    }
  });

  it('never repeats a look on orthogonal neighbors, even packed solid (pool 4)', () => {
    // A 12×12 SOLID grid of one prop kind — far denser than any real map.
    const picker = new VariantPicker();
    const grid = new Map<string, number>();
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        grid.set(`${x},${y}`, picker.pick('crate', x, y, 4));
      }
    }
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        const mine = grid.get(`${x},${y}`);
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
          const other = grid.get(`${x + dx},${y + dy}`);
          if (other !== undefined) expect(mine).not.toBe(other);
        }
      }
    }
  });

  it('avoids diagonal twins too at realistic prop density (pool 4)', () => {
    // Real maps scatter crates with gaps; drop every third tile and demand
    // full 8-neighbor uniqueness on what remains.
    const picker = new VariantPicker();
    const grid = new Map<string, number>();
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        if ((x * 5 + y * 7) % 3 === 0) continue;
        grid.set(`${x},${y}`, picker.pick('crate', x, y, 4));
      }
    }
    for (const [key, mine] of grid) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) {
        const other = grid.get(`${x + dx},${y + dy}`);
        if (other !== undefined) expect(mine).not.toBe(other);
      }
    }
  });

  it('breaks runs in a dense row even with a pool of 2 (reach 1 — the stack walls)', () => {
    const picker = new VariantPicker();
    const row: number[] = [];
    for (let x = 0; x < 20; x++) row.push(picker.pick('stack-3', x, 5, 2, 1));
    for (let x = 1; x < 20; x++) expect(row[x]).not.toBe(row[x - 1]);
  });

  it('scopes the adjacency guard by kind — other families do not repel', () => {
    const solo = new VariantPicker();
    const busy = new VariantPicker();
    busy.pick('block-paint', 4, 4, 6);
    busy.pick('crate', 5, 4, 4);
    busy.pick('drums', 4, 5, 2);
    // The rust pick lands the same whether or not OTHER kinds crowd it.
    expect(busy.pick('block-rust', 5, 5, 6)).toBe(solo.pick('block-rust', 5, 5, 6));
  });

  it('stays in range and falls back gracefully when the pool is exhausted', () => {
    const picker = new VariantPicker();
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const v = picker.pick('drums', x, y, 2); // pool 2, reach 2: exhaustion certain
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(2);
      }
    }
  });

  it('single-look pools short-circuit to 0', () => {
    const picker = new VariantPicker();
    expect(picker.pick('ventbox', 3, 3, 1)).toBe(0);
  });
});
