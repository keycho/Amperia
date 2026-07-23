import { describe, expect, it } from 'vitest';
import { ITEMS, rarityLabel } from './items';

/**
 * F2 — the item-card contract: every item ships the full card (distinct
 * icon recipe, name, 1–2 lines of flavor, category, stack size) and the
 * copy stays inside the comms rules. items sharing an (icon, accent) pair
 * WOULD render identical pixels — that's the regression this file blocks
 * (dentedCrest/wispFilament/drayPlate/waxChit once all wore gilded scrap).
 */

const COMMS_BANNED = /\b(earn|earns|earned|yield|apy|invest|investment|profit|roi|dividend|buy low)\b/i;

describe('the item card (F2)', () => {
  const defs = Object.values(ITEMS);

  it('every item has a name, 1–2 lines of flavor, a category and a stack', () => {
    for (const def of defs) {
      expect(def.name.trim().length, def.id).toBeGreaterThan(2);
      expect(def.flavor.trim().length, def.id).toBeGreaterThan(10);
      expect(def.flavor.length, `${def.id} flavor runs long`).toBeLessThanOrEqual(120);
      expect(def.category, def.id).toBeTruthy();
      expect(def.stack, def.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('tools, weapons and wearables never stack', () => {
    for (const def of defs) {
      if (def.tool === true || def.cosmetic === true) {
        expect(def.stack, def.id).toBe(1);
      }
    }
  });

  it('no two items share an icon recipe (icon + accent) — distinct pixels', () => {
    const seen = new Map<string, string>();
    for (const def of defs) {
      const recipe = `${def.icon}~${def.iconTint ?? 'default'}`;
      const prev = seen.get(recipe);
      expect(prev, `${def.id} and ${prev ?? ''} would bake identical icons (${recipe})`).toBeUndefined();
      seen.set(recipe, def.id);
    }
  });

  it('names and flavor obey the comms rules (golden rule 11)', () => {
    for (const def of defs) {
      expect(COMMS_BANNED.test(def.name), `${def.id} name: "${def.name}"`).toBe(false);
      expect(COMMS_BANNED.test(def.flavor), `${def.id} flavor: "${def.flavor}"`).toBe(false);
    }
  });

  it('rarity reads: rare > tier > common', () => {
    expect(rarityLabel(ITEMS.gildedScrap)).toBe('rare');
    expect(rarityLabel(ITEMS.coilMagclaw)).toBe('Coilworked');
    expect(rarityLabel(ITEMS.brassTuner)).toBe('Brassbound');
    expect(rarityLabel(ITEMS.magclaw)).toBe('Tinker');
    expect(rarityLabel(ITEMS.salvage)).toBe('common');
  });
});
