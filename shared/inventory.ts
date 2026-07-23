import { CONFIG } from './config';
import { ITEMS, type ItemCategory, type ItemId } from './items';

/**
 * Pure inventory math (stacking, moving, counting). The client renders it;
 * later the server owns it. All operations return new inventories so tests
 * and (M1.7) saves stay simple.
 *
 * F2: stack sizes are PER ITEM (ItemDef.stack, capped by the global
 * CONFIG.inventory.stackMax) and enforced here, which is what the server
 * runs — a client can't talk its way past a Warmcup's 24-stack.
 */

/** The stack cap for one item: its own size, never above the global max. */
export function stackFor(itemId: ItemId): number {
  return Math.min(ITEMS[itemId].stack, CONFIG.inventory.stackMax);
}

export interface ItemStack {
  itemId: ItemId;
  qty: number;
  /** Present on gear: remaining durability (0 = broken, never lost). */
  durability?: number;
}

export type InventorySlot = ItemStack | null;

export interface Inventory {
  slots: InventorySlot[];
}

export function makeInventory(slotCount: number): Inventory {
  return { slots: Array(slotCount).fill(null) };
}

/** Full durability for a gear item (by its tier), else undefined. */
export function fullDurability(itemId: ItemId): number | undefined {
  const def = ITEMS[itemId];
  if (def.tool !== true) return undefined;
  return CONFIG.gear.maxDurability[def.tier ?? 1];
}

/** New Sparks start with the tool belt on the hotbar (Game Bible B3). */
export function makeStarterHotbar(): Inventory {
  const inv = makeInventory(CONFIG.inventory.hotbarSlots);
  CONFIG.tools.starterHotbar.forEach((tool, i) => {
    if (i < inv.slots.length) {
      inv.slots[i] = {
        itemId: tool as ItemId,
        qty: 1,
        durability: fullDurability(tool as ItemId),
      };
    }
  });
  return inv;
}

function clone(inv: Inventory): Inventory {
  return { slots: inv.slots.map((s) => (s === null ? null : { ...s })) };
}

/**
 * Add qty of an item, filling existing stacks first, then empty slots.
 * Returns how much was added and how much overflowed (inventory full).
 * Stack cap comes from the item itself ({@link stackFor}).
 */
export function addItem(
  inv: Inventory,
  itemId: ItemId,
  qty: number,
): { inv: Inventory; added: number; overflow: number } {
  const next = clone(inv);
  const stackMax = stackFor(itemId);
  let remaining = qty;
  // Gear never stacks: one per slot, born at full durability.
  if (ITEMS[itemId].tool === true) {
    for (let i = 0; i < next.slots.length && remaining > 0; i++) {
      if (next.slots[i] === null) {
        next.slots[i] = { itemId, qty: 1, durability: fullDurability(itemId) };
        remaining -= 1;
      }
    }
    return { inv: next, added: qty - remaining, overflow: remaining };
  }
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
 * items up to the item's own stack cap, otherwise swaps. Returns new
 * [source, destination] (the same object when src === dst).
 *
 * F2: pass `qty` to move only part of the source stack — the SPLIT action.
 * A partial move lands in an empty slot or merges into a matching stack; a
 * partial onto a mismatched stack is refused (no swap — a swap of half a
 * stack has no meaning). Gear (durability) never merges and never splits.
 */
export function transfer(
  src: Inventory,
  srcIdx: number,
  dst: Inventory,
  dstIdx: number,
  qty?: number,
): { src: Inventory; dst: Inventory } {
  const sameInv = src === dst;
  const nextSrc = clone(src);
  const nextDst = sameInv ? nextSrc : clone(dst);
  const a = nextSrc.slots[srcIdx];
  const b = nextDst.slots[dstIdx];
  if (a === null || a === undefined || (sameInv && srcIdx === dstIdx)) {
    return { src: nextSrc, dst: nextDst };
  }
  const stackMax = stackFor(a.itemId);
  const gearInvolved = a.durability !== undefined || (b !== null && b !== undefined && b.durability !== undefined);
  const moving = Math.max(1, Math.min(a.qty, Math.floor(qty ?? a.qty)));
  const partial = moving < a.qty;

  if (!gearInvolved && b !== null && b !== undefined && b.itemId === a.itemId && b.qty < stackMax) {
    const take = Math.min(stackMax - b.qty, moving);
    b.qty += take;
    a.qty -= take;
    if (a.qty === 0) nextSrc.slots[srcIdx] = null;
    return { src: nextSrc, dst: nextDst };
  }
  if (partial) {
    if (gearInvolved) return { src: nextSrc, dst: nextDst }; // gear never splits
    if (b !== null && b !== undefined) return { src: nextSrc, dst: nextDst }; // no half-swaps
    a.qty -= moving;
    nextDst.slots[dstIdx] = { itemId: a.itemId, qty: moving };
    return { src: nextSrc, dst: nextDst };
  }
  nextSrc.slots[srcIdx] = b ?? null;
  nextDst.slots[dstIdx] = a;
  return { src: nextSrc, dst: nextDst };
}

/** The Pack's sort order: category first, then name; gear before its kin by
 *  tier descending so the best tool reads first. */
const CATEGORY_ORDER: Record<ItemCategory, number> = {
  tool: 0,
  weapon: 1,
  resource: 2,
  consumable: 3,
  curio: 4,
  cosmetic: 5,
};

/**
 * F2 SORT: merge partial stacks (per-item caps; gear never merges), then lay
 * stacks out by category → name → tier (best first), empties at the end.
 * Deterministic and pure — the server runs it, the client just re-renders.
 */
export function sortInventory(inv: Inventory): Inventory {
  const stacks: ItemStack[] = [];
  for (const s of inv.slots) {
    if (s === null || s === undefined) continue;
    if (s.durability !== undefined) {
      stacks.push({ ...s }); // gear: one per slot, never merged
      continue;
    }
    const cap = stackFor(s.itemId);
    let remaining = s.qty;
    for (const t of stacks) {
      if (remaining <= 0) break;
      if (t.itemId === s.itemId && t.durability === undefined && t.qty < cap) {
        const take = Math.min(cap - t.qty, remaining);
        t.qty += take;
        remaining -= take;
      }
    }
    while (remaining > 0) {
      const take = Math.min(cap, remaining);
      stacks.push({ itemId: s.itemId, qty: take });
      remaining -= take;
    }
  }
  stacks.sort((a, b) => {
    const da = ITEMS[a.itemId];
    const db = ITEMS[b.itemId];
    const c = CATEGORY_ORDER[da.category] - CATEGORY_ORDER[db.category];
    if (c !== 0) return c;
    const t = (db.tier ?? 0) - (da.tier ?? 0);
    if (t !== 0) return t;
    const n = da.name.localeCompare(db.name);
    if (n !== 0) return n;
    return b.qty - a.qty; // fullest stacks first
  });
  const next = makeInventory(inv.slots.length);
  stacks.slice(0, next.slots.length).forEach((s, i) => {
    next.slots[i] = s;
  });
  return next;
}
