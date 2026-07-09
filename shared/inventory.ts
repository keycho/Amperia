import { CONFIG } from './config';
import type { ItemId } from './items';

/**
 * Pure inventory math (stacking, moving, counting). The client renders it;
 * later the server owns it. All operations return new inventories so tests
 * and (M1.7) saves stay simple.
 */

export interface ItemStack {
  itemId: ItemId;
  qty: number;
}

export type InventorySlot = ItemStack | null;

export interface Inventory {
  slots: InventorySlot[];
}

export function makeInventory(slotCount: number): Inventory {
  return { slots: Array(slotCount).fill(null) };
}

/** New Sparks start with the tool belt on the hotbar (Game Bible B3). */
export function makeStarterHotbar(): Inventory {
  const inv = makeInventory(CONFIG.inventory.hotbarSlots);
  CONFIG.tools.starterHotbar.forEach((tool, i) => {
    if (i < inv.slots.length) inv.slots[i] = { itemId: tool as ItemId, qty: 1 };
  });
  return inv;
}

function clone(inv: Inventory): Inventory {
  return { slots: inv.slots.map((s) => (s === null ? null : { ...s })) };
}

/**
 * Add qty of an item, filling existing stacks first, then empty slots.
 * Returns how much was added and how much overflowed (inventory full).
 */
export function addItem(
  inv: Inventory,
  itemId: ItemId,
  qty: number,
  stackMax: number,
): { inv: Inventory; added: number; overflow: number } {
  const next = clone(inv);
  let remaining = qty;
  for (const slot of next.slots) {
    if (remaining <= 0) break;
    if (slot !== null && slot.itemId === itemId && slot.qty < stackMax) {
      const take = Math.min(stackMax - slot.qty, remaining);
      slot.qty += take;
      remaining -= take;
    }
  }
  for (let i = 0; i < next.slots.length && remaining > 0; i++) {
    if (next.slots[i] === null) {
      const take = Math.min(stackMax, remaining);
      next.slots[i] = { itemId, qty: take };
      remaining -= take;
    }
  }
  return { inv: next, added: qty - remaining, overflow: remaining };
}

/** Remove up to qty of an item (from later slots first-found order). */
export function removeItem(
  inv: Inventory,
  itemId: ItemId,
  qty: number,
): { inv: Inventory; removed: number } {
  const next = clone(inv);
  let remaining = qty;
  for (let i = 0; i < next.slots.length && remaining > 0; i++) {
    const slot = next.slots[i];
    if (slot !== null && slot !== undefined && slot.itemId === itemId) {
      const take = Math.min(slot.qty, remaining);
      slot.qty -= take;
      remaining -= take;
      if (slot.qty === 0) next.slots[i] = null;
    }
  }
  return { inv: next, removed: qty - remaining };
}

export function countItem(inv: Inventory, itemId: ItemId): number {
  return inv.slots.reduce((sum, s) => (s !== null && s.itemId === itemId ? sum + s.qty : sum), 0);
}

/**
 * Move a stack between two slots (possibly across inventories): merges same
 * items up to stackMax, otherwise swaps. Returns new [source, destination]
 * (the same object when src === dst).
 */
export function transfer(
  src: Inventory,
  srcIdx: number,
  dst: Inventory,
  dstIdx: number,
  stackMax: number,
): { src: Inventory; dst: Inventory } {
  const sameInv = src === dst;
  const nextSrc = clone(src);
  const nextDst = sameInv ? nextSrc : clone(dst);
  const a = nextSrc.slots[srcIdx];
  const b = nextDst.slots[dstIdx];
  if (a === null || a === undefined || (sameInv && srcIdx === dstIdx)) {
    return { src: nextSrc, dst: nextDst };
  }
  if (b !== null && b !== undefined && b.itemId === a.itemId && b.qty < stackMax) {
    const take = Math.min(stackMax - b.qty, a.qty);
    b.qty += take;
    a.qty -= take;
    if (a.qty === 0) nextSrc.slots[srcIdx] = null;
  } else {
    nextSrc.slots[srcIdx] = b ?? null;
    nextDst.slots[dstIdx] = a;
  }
  return { src: nextSrc, dst: nextDst };
}
