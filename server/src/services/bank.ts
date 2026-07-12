import { CONFIG } from '@shared/config';
import { fullDurability, makeInventory, type Inventory, type InventorySlot } from '@shared/inventory';
import { prisma } from './db.js';

/**
 * The Ledgerhouse (S5) — banked storage. Two invariants carry the whole
 * feature: (1) the bank is reachable ONLY while standing inside the
 * building (the room checks the interior region before every action);
 * (2) death NEVER touches this table — the Scrapcache drop reads the
 * PACK, and nothing in the death path imports this module.
 */

export interface BankState {
  inv: Inventory;
  slots: number;
}

function parseBank(raw: unknown, slotCount: number): Inventory {
  const inv = makeInventory(slotCount);
  if (!Array.isArray(raw)) return inv;
  for (let i = 0; i < slotCount; i++) {
    const s = raw[i] as InventorySlot | undefined;
    if (
      s !== null &&
      s !== undefined &&
      typeof s === 'object' &&
      typeof (s as { itemId?: unknown }).itemId === 'string' &&
      typeof (s as { qty?: unknown }).qty === 'number' &&
      (s as { qty: number }).qty > 0
    ) {
      const durability =
        typeof (s as { durability?: unknown }).durability === 'number'
          ? Math.max(0, Math.floor((s as { durability: number }).durability))
          : fullDurability(s.itemId);
      inv.slots[i] =
        durability === undefined
          ? { itemId: s.itemId, qty: Math.floor(s.qty) }
          : { itemId: s.itemId, qty: Math.floor(s.qty), durability };
    }
  }
  return inv;
}

export async function loadBank(characterId: string): Promise<BankState> {
  const c = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: { bankJson: true, bankSlots: true },
  });
  return { inv: parseBank(c.bankJson, c.bankSlots), slots: c.bankSlots };
}

export async function saveBank(characterId: string, state: BankState): Promise<void> {
  await prisma.character.update({
    where: { id: characterId },
    data: { bankJson: state.inv.slots as object[], bankSlots: state.slots },
  });
}

/** Bolts price of the NEXT +8-slot expansion — the hoarder sink curve. */
export function nextExpansionCost(currentSlots: number): number | null {
  const cfg = CONFIG.bank;
  const step = Math.floor((currentSlots - cfg.baseSlots) / cfg.slotsPerExpansion);
  const costs = cfg.expansionCosts as readonly number[];
  if (currentSlots >= cfg.maxSlots || step >= costs.length) return null;
  return costs[step] as number;
}
