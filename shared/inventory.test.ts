import { describe, expect, it } from 'vitest';
import {
  addItem,
  countItem,
  makeInventory,
  removeItem,
  sortInventory,
  stackFor,
  transfer,
} from './inventory';

describe('inventory', () => {
  it('stacks additions into existing stacks then empty slots', () => {
    let inv = makeInventory(3);
    ({ inv } = addItem(inv, 'salvage', 5));
    ({ inv } = addItem(inv, 'salvage', 7));
    expect(inv.slots[0]).toEqual({ itemId: 'salvage', qty: 12 });
    expect(countItem(inv, 'salvage')).toBe(12);
  });

  it('F2: stack caps are PER ITEM — a Heatlamp stacks to 8, not 999', () => {
    expect(stackFor('salvage')).toBe(999);
    expect(stackFor('heatlamp')).toBe(8);
    expect(stackFor('warmcup')).toBe(24);
    expect(stackFor('gildedScrap')).toBe(50);
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'heatlamp', 9));
    expect(inv.slots).toEqual([
      { itemId: 'heatlamp', qty: 8 },
      { itemId: 'heatlamp', qty: 1 },
    ]);
  });

  it('splits across slots at the cap and reports overflow when full', () => {
    const inv = makeInventory(2);
    const r = addItem(inv, 'heatlamp', 20);
    expect(r.added).toBe(16);
    expect(r.overflow).toBe(4);
  });

  it('does not mutate the input inventory', () => {
    const inv = makeInventory(2);
    addItem(inv, 'salvage', 5);
    expect(inv.slots).toEqual([null, null]);
  });

  it('removes items and clears emptied slots', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'heatlamp', 9));
    const r = removeItem(inv, 'heatlamp', 8);
    expect(r.removed).toBe(8);
    expect(countItem(r.inv, 'heatlamp')).toBe(1);
    expect(r.inv.slots.filter((s) => s === null)).toHaveLength(1);
  });

  it('transfer swaps different items', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'salvage', 3));
    ({ inv } = addItem(inv, 'gildedScrap', 1));
    const { src } = transfer(inv, 0, inv, 1);
    expect(src.slots[0]).toEqual({ itemId: 'gildedScrap', qty: 1 });
    expect(src.slots[1]).toEqual({ itemId: 'salvage', qty: 3 });
  });

  it('transfer merges same items up to the item cap', () => {
    const inv = makeInventory(2);
    inv.slots[0] = { itemId: 'heatlamp', qty: 3 };
    inv.slots[1] = { itemId: 'heatlamp', qty: 7 };
    const { src } = transfer(inv, 0, inv, 1);
    expect(src.slots[1]).toEqual({ itemId: 'heatlamp', qty: 8 });
    expect(src.slots[0]).toEqual({ itemId: 'heatlamp', qty: 2 });
  });

  it('transfer into empty slot moves the whole stack', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'salvage', 3));
    const { src } = transfer(inv, 0, inv, 1);
    expect(src.slots[0]).toBeNull();
    expect(src.slots[1]).toEqual({ itemId: 'salvage', qty: 3 });
  });

  it('F2 SPLIT: a qty moves part of the stack into an empty slot', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'salvage', 10));
    const { src } = transfer(inv, 0, inv, 1, 4);
    expect(src.slots[0]).toEqual({ itemId: 'salvage', qty: 6 });
    expect(src.slots[1]).toEqual({ itemId: 'salvage', qty: 4 });
  });

  it('F2 SPLIT: a partial onto a MISMATCHED stack is refused (no half-swaps)', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'salvage', 10));
    ({ inv } = addItem(inv, 'brass', 2));
    const { src } = transfer(inv, 0, inv, 1, 4);
    expect(src.slots[0]).toEqual({ itemId: 'salvage', qty: 10 });
    expect(src.slots[1]).toEqual({ itemId: 'brass', qty: 2 });
  });

  it('F2 SPLIT: a partial into a matching stack merges up to the cap', () => {
    const inv = makeInventory(2);
    inv.slots[0] = { itemId: 'warmcup', qty: 10 };
    inv.slots[1] = { itemId: 'warmcup', qty: 20 };
    const { src } = transfer(inv, 0, inv, 1, 6);
    expect(src.slots[1]).toEqual({ itemId: 'warmcup', qty: 24 });
    expect(src.slots[0]).toEqual({ itemId: 'warmcup', qty: 6 });
  });

  it('F2 SORT: merges partials, orders category → tier → name, empties last', () => {
    const inv = makeInventory(8);
    inv.slots[0] = { itemId: 'warmcup', qty: 3 };
    inv.slots[2] = { itemId: 'salvage', qty: 40 };
    inv.slots[3] = { itemId: 'magclaw', qty: 1, durability: 55 };
    inv.slots[4] = { itemId: 'warmcup', qty: 4 };
    inv.slots[5] = { itemId: 'gildedScrap', qty: 2 };
    inv.slots[6] = { itemId: 'brass', qty: 9 };
    const sorted = sortInventory(inv);
    expect(sorted.slots[0]).toEqual({ itemId: 'magclaw', qty: 1, durability: 55 }); // tool first
    expect(sorted.slots[1]).toEqual({ itemId: 'brass', qty: 9 }); // resources by name
    expect(sorted.slots[2]).toEqual({ itemId: 'salvage', qty: 40 });
    expect(sorted.slots[3]).toEqual({ itemId: 'warmcup', qty: 7 }); // merged partials
    expect(sorted.slots[4]).toEqual({ itemId: 'gildedScrap', qty: 2 }); // curio after
    expect(sorted.slots[5]).toBeNull();
    // Nothing created, nothing lost.
    expect(countItem(sorted, 'warmcup')).toBe(7);
    expect(countItem(sorted, 'salvage')).toBe(40);
  });

  it('F2 SORT: gear never merges and keeps its wear', () => {
    const inv = makeInventory(4);
    inv.slots[1] = { itemId: 'magclaw', qty: 1, durability: 12 };
    inv.slots[3] = { itemId: 'magclaw', qty: 1, durability: 80 };
    const sorted = sortInventory(inv);
    const claws = sorted.slots.filter((s) => s?.itemId === 'magclaw');
    expect(claws).toHaveLength(2);
    expect(new Set(claws.map((s) => s?.durability))).toEqual(new Set([12, 80]));
  });
});
