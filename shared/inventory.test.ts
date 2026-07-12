import { describe, expect, it } from 'vitest';
import { addItem, countItem, makeInventory, removeItem, transfer } from './inventory';

const MAX = 999;

describe('inventory', () => {
  it('stacks additions into existing stacks then empty slots', () => {
    let inv = makeInventory(3);
    ({ inv } = addItem(inv, 'salvage', 5, MAX));
    ({ inv } = addItem(inv, 'salvage', 7, MAX));
    expect(inv.slots[0]).toEqual({ itemId: 'salvage', qty: 12 });
    expect(countItem(inv, 'salvage')).toBe(12);
  });

  it('splits across slots at stackMax and reports overflow when full', () => {
    let inv = makeInventory(2);
    const r1 = addItem(inv, 'salvage', 5, 4);
    inv = r1.inv;
    expect(inv.slots).toEqual([
      { itemId: 'salvage', qty: 4 },
      { itemId: 'salvage', qty: 1 },
    ]);
    const r2 = addItem(inv, 'salvage', 10, 4);
    expect(r2.added).toBe(3);
    expect(r2.overflow).toBe(7);
  });

  it('does not mutate the input inventory', () => {
    const inv = makeInventory(2);
    addItem(inv, 'salvage', 5, MAX);
    expect(inv.slots).toEqual([null, null]);
  });

  it('removes items and clears emptied slots', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'salvage', 6, 4));
    const r = removeItem(inv, 'salvage', 5);
    expect(r.removed).toBe(5);
    expect(countItem(r.inv, 'salvage')).toBe(1);
    expect(r.inv.slots.filter((s) => s === null)).toHaveLength(1);
  });

  it('transfer swaps different items', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'salvage', 3, MAX));
    ({ inv } = addItem(inv, 'gildedScrap', 1, MAX));
    const { src } = transfer(inv, 0, inv, 1, MAX);
    expect(src.slots[0]).toEqual({ itemId: 'gildedScrap', qty: 1 });
    expect(src.slots[1]).toEqual({ itemId: 'salvage', qty: 3 });
  });

  it('transfer merges same items up to stackMax', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'salvage', 3, 4));
    inv.slots[1] = { itemId: 'salvage', qty: 3 };
    const { src } = transfer(inv, 0, inv, 1, 4);
    expect(src.slots[1]).toEqual({ itemId: 'salvage', qty: 4 });
    expect(src.slots[0]).toEqual({ itemId: 'salvage', qty: 2 });
  });

  it('transfer into empty slot moves the whole stack', () => {
    let inv = makeInventory(2);
    ({ inv } = addItem(inv, 'salvage', 3, MAX));
    const { src } = transfer(inv, 0, inv, 1, MAX);
    expect(src.slots[0]).toBeNull();
    expect(src.slots[1]).toEqual({ itemId: 'salvage', qty: 3 });
  });
});
