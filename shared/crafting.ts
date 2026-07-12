import { CONFIG } from './config';
import { ITEMS, type ItemId } from './items';

/**
 * Pure craft/repair math for the Tinkerbench (tested off the server).
 * Tiers buy config multipliers only — never new drop tables or loot.
 */

export interface Recipe {
  id: string;
  output: string;
  bolts: number;
  materials: Record<string, number>;
}

export function recipeById(id: string): Recipe | undefined {
  return (CONFIG.gear.recipes as readonly Recipe[]).find((r) => r.id === id);
}

/** Can this craft go ahead? Reports what's missing for honest UI copy. */
export function canCraft(
  recipe: Recipe,
  bolts: number,
  countOf: (itemId: ItemId) => number,
): { ok: boolean; missingBolts: number; missing: Array<{ itemId: string; short: number }> } {
  const missingBolts = Math.max(0, recipe.bolts - bolts);
  const missing: Array<{ itemId: string; short: number }> = [];
  for (const [itemId, qty] of Object.entries(recipe.materials)) {
    const short = qty - countOf(itemId as ItemId);
    if (short > 0) missing.push({ itemId, short });
  }
  return { ok: missingBolts === 0 && missing.length === 0, missingBolts, missing };
}

/** Gather-seconds multiplier for the held tool (undefined tool = 1). */
export function toolSpeedMult(itemId: ItemId | null): number {
  if (itemId === null) return 1;
  const def = ITEMS[itemId];
  if (def.tool !== true) return 1;
  return CONFIG.gear.gatherSpeedMult[def.tier ?? 1] ?? 1;
}

/** Brawling damage multiplier for the held item (bare hands = 1). */
export function weaponDamageMult(itemId: ItemId | null): number {
  if (itemId === null) return 1;
  const def = ITEMS[itemId];
  if (def.tool !== true || def.toolKind !== 'sparkwrench') return 1;
  return CONFIG.gear.weaponDamageMult[def.tier ?? 1] ?? 1;
}

export interface RepairQuote {
  bolts: number;
  materials: Array<{ itemId: string; qty: number }>;
}

/**
 * Repair cost for restoring `missing` durability on a piece of gear:
 * Bolts scale with the missing fraction; materials are a config fraction
 * of the CRAFT recipe scaled the same way (tier-1 gear has no recipe —
 * it repairs on Bolts alone).
 */
export function repairQuote(itemId: ItemId, missing: number): RepairQuote {
  const def = ITEMS[itemId];
  const max = CONFIG.gear.maxDurability[def.tier ?? 1] ?? 100;
  const frac = Math.max(0, Math.min(1, missing / max));
  const bolts = Math.max(1, Math.ceil((missing / 100) * CONFIG.gear.repair.boltsPer100));
  const recipe = (CONFIG.gear.recipes as readonly Recipe[]).find((r) => r.output === itemId);
  const materials: Array<{ itemId: string; qty: number }> = [];
  if (recipe !== undefined) {
    for (const [mid, qty] of Object.entries(recipe.materials)) {
      const scaled = Math.ceil(qty * CONFIG.gear.repair.materialFraction * frac);
      if (scaled > 0) materials.push({ itemId: mid, qty: scaled });
    }
  }
  return { bolts, materials };
}
