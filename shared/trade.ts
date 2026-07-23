import { CONFIG } from './config';
import { addItem, countItem, type Inventory } from './inventory';
import { ITEMS, type ItemId } from './items';

/**
 * Player↔player direct trade — pure math (Economy Design: player trade is
 * conservation, never creation). The room owns the live session; everything
 * value-deciding here is a pure function so the escrowed atomic swap can be
 * unit-tested off a live server:
 *
 *   request → accept → both sides stage items/Bolts → both confirm →
 *   server validates BOTH offers against live packs/balances and applies
 *   the swap in one synchronous step (no dupes possible: remove-then-add
 *   on clones, commit only if every item fits).
 */

/** One staged line of a trade offer (gear carries its worn durability). */
export interface TradeOfferItem {
  itemId: ItemId;
  qty: number;
  durability?: number;
}

export interface TradeOffer {
  bolts: number;
  items: TradeOfferItem[];
}

export const emptyOffer = (): TradeOffer => ({ bolts: 0, items: [] });

/**
 * Items that may never change hands player↔player: cosmetics (quest/Charge
 * regalia — golden rule 7 keeps premium/cosmetic items out of every
 * transfer path).
 */
export function itemIsTradeable(itemId: ItemId): boolean {
  return ITEMS[itemId].cosmetic !== true;
}

export type OfferProblem =
  | 'badQty'
  | 'untradeable'
  | 'missingItems'
  | 'shortBolts';

/**
 * Check an offer against the live pack + balance. Gear lines must match a
 * pack slot exactly (itemId + durability) — if the tool wore down since
 * staging, the offer is stale and must be re-staged.
 */
export function validateOffer(
  pack: Inventory,
  bolts: number,
  offer: TradeOffer,
): OfferProblem | null {
  if (!Number.isInteger(offer.bolts) || offer.bolts < 0) return 'badQty';
  if (offer.bolts > bolts) return 'shortBolts';
  const claimedSlots = new Set<number>();
  for (const line of offer.items) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) return 'badQty';
    if (ITEMS[line.itemId] === undefined) return 'badQty';
    if (!itemIsTradeable(line.itemId)) return 'untradeable';
    if (ITEMS[line.itemId].tool === true) {
      if (line.qty !== 1) return 'badQty';
      const idx = pack.slots.findIndex(
        (s, i) =>
          !claimedSlots.has(i) &&
          s !== null &&
          s.itemId === line.itemId &&
          s.durability === line.durability,
      );
      if (idx < 0) return 'missingItems';
      claimedSlots.add(idx);
    } else if (countItem(pack, line.itemId) < totalOf(offer, line.itemId)) {
      return 'missingItems';
    }
  }
  return null;
}

function totalOf(offer: TradeOffer, itemId: ItemId): number {
  return offer.items.reduce((a, l) => (l.itemId === itemId ? a + l.qty : a), 0);
}

/** Remove an offer's lines from a pack clone; null if anything is missing. */
function takeOffer(pack: Inventory, offer: TradeOffer): Inventory | null {
  let next: Inventory = { slots: pack.slots.map((s) => (s === null ? null : { ...s })) };
  for (const line of offer.items) {
    if (ITEMS[line.itemId].tool === true) {
      const idx = next.slots.findIndex(
        (s) => s !== null && s.itemId === line.itemId && s.durability === line.durability,
      );
      if (idx < 0) return null;
      next.slots[idx] = null;
    } else {
      let remaining = line.qty;
      for (let i = 0; i < next.slots.length && remaining > 0; i++) {
        const s = next.slots[i];
        if (s !== null && s !== undefined && s.itemId === line.itemId && s.durability === undefined) {
          const take = Math.min(s.qty, remaining);
          s.qty -= take;
          remaining -= take;
          if (s.qty === 0) next.slots[i] = null;
        }
      }
      if (remaining > 0) return null;
    }
  }
  return next;
}

/** Add an offer's lines into a pack clone; null if anything overflows. */
function giveOffer(pack: Inventory, offer: TradeOffer): Inventory | null {
  let next: Inventory = { slots: pack.slots.map((s) => (s === null ? null : { ...s })) };
  for (const line of offer.items) {
    if (ITEMS[line.itemId].tool === true) {
      // Traded gear keeps its wear — find a free slot and place it as-is.
      const idx = next.slots.findIndex((s) => s === null);
      if (idx < 0) return null;
      next.slots[idx] = { itemId: line.itemId, qty: 1, durability: line.durability };
    } else {
      const r = addItem(next, line.itemId, line.qty);
      if (r.overflow > 0) return null;
      next = r.inv;
    }
  }
  return next;
}

export type SettleResult =
  | {
      ok: true;
      packA: Inventory;
      packB: Inventory;
      boltsA: number;
      boltsB: number;
    }
  | { ok: false; reason: 'aInvalid' | 'bInvalid' | 'aPackFull' | 'bPackFull' };

/**
 * The escrowed atomic swap, computed on clones: remove each side's staged
 * lines, then add the OTHER side's lines. Commits nothing — the caller
 * applies the returned inventories/balances only when ok, all in one
 * synchronous step, so a failure anywhere leaves both Sparks untouched
 * (no dupes, no losses, no partial trades).
 */
export function settleTrade(
  packA: Inventory,
  boltsA: number,
  offerA: TradeOffer,
  packB: Inventory,
  boltsB: number,
  offerB: TradeOffer,
): SettleResult {
  if (validateOffer(packA, boltsA, offerA) !== null) return { ok: false, reason: 'aInvalid' };
  if (validateOffer(packB, boltsB, offerB) !== null) return { ok: false, reason: 'bInvalid' };
  const aWithout = takeOffer(packA, offerA);
  const bWithout = takeOffer(packB, offerB);
  if (aWithout === null) return { ok: false, reason: 'aInvalid' };
  if (bWithout === null) return { ok: false, reason: 'bInvalid' };
  const aFinal = giveOffer(aWithout, offerB);
  if (aFinal === null) return { ok: false, reason: 'aPackFull' };
  const bFinal = giveOffer(bWithout, offerA);
  if (bFinal === null) return { ok: false, reason: 'bPackFull' };
  return {
    ok: true,
    packA: aFinal,
    packB: bFinal,
    boltsA: boltsA - offerA.bolts + offerB.bolts,
    boltsB: boltsB - offerB.bolts + offerA.bolts,
  };
}

// ── valuation (the anomaly-detection read) ─────────────────────────────────

/**
 * Estimated Bolts value of one item for ledger valuation: resources price
 * at their NPC-band midpoint, everything else from the config valuation
 * table. This is what trade-anomaly detection reads later — it needs to be
 * stable and config-driven, not live-market-accurate.
 */
export function estimateItemValue(itemId: ItemId): number {
  const band = (CONFIG.economy.merchant.buy as Record<string, { floor: number; ceiling: number }>)[
    itemId
  ];
  if (band !== undefined) return Math.round((band.floor + band.ceiling) / 2);
  const table = CONFIG.economy.trade.valuationBolts as Record<string, number>;
  return table[itemId] ?? CONFIG.economy.trade.valuationDefaultBolts;
}

/** Estimated Bolts value of a whole offer (Bolts count at face value). */
export function estimateOfferValue(offer: TradeOffer): number {
  return offer.bolts + offer.items.reduce((a, l) => a + estimateItemValue(l.itemId) * l.qty, 0);
}

/**
 * Lopsided-trade check (instrumentation only — never blocks): one side's
 * staged value exceeding `factor`× the other's is an anomaly-ledger row.
 * Zero-value sides count as 1 so pure gifts of real value always flag.
 */
export function isLopsided(valueA: number, valueB: number, factor: number): boolean {
  const hi = Math.max(valueA, valueB);
  const lo = Math.max(1, Math.min(valueA, valueB));
  return hi > factor * lo;
}
