import { describe, expect, it } from 'vitest';
import {
  COSMETIC_SLOTS,
  COSMETICS,
  decodeEquipped,
  encodeEquipped,
  ownedForSlot,
} from './cosmetics';

describe('cosmetic defs', () => {
  it('every cosmetic sits in a real slot', () => {
    for (const def of Object.values(COSMETICS)) {
      expect(COSMETIC_SLOTS).toContain(def.slot);
      expect(def.id in COSMETICS).toBe(true);
    }
  });

  it('the I3 set is present: bulb hat, beanie, scarf, satchel, tools, trim', () => {
    expect(COSMETICS.bulbHat?.slot).toBe('head');
    expect(COSMETICS.alleyBeanie?.slot).toBe('head');
    expect(COSMETICS.starterScarf?.slot).toBe('jacket');
    expect(COSMETICS.salvagerSatchel?.slot).toBe('back');
    expect(COSMETICS.brassToolSkin?.slot).toBe('tool');
    expect(COSMETICS.chargeTrim?.slot).toBe('nameGlow');
  });
});

describe('encode/decode equipped', () => {
  it('round-trips a full loadout canonically', () => {
    const eq = {
      head: 'bulbHat',
      jacket: 'starterScarf',
      back: 'salvagerSatchel',
      tool: 'brassToolSkin',
    };
    const wire = encodeEquipped(eq);
    expect(decodeEquipped(wire)).toEqual(eq);
    // Canonical order is slot-table order, independent of input order.
    expect(wire).toBe('head:bulbHat;back:salvagerSatchel;jacket:starterScarf;tool:brassToolSkin');
  });

  it('drops slot mismatches, unknown ids, and unowned cosmetics', () => {
    expect(decodeEquipped('head:starterScarf')).toEqual({}); // scarf is jacket-slot
    expect(decodeEquipped('head:notAThing')).toEqual({});
    expect(decodeEquipped('nonsense')).toEqual({});
    expect(decodeEquipped('head:bulbHat', [])).toEqual({});
    expect(decodeEquipped('head:bulbHat', ['bulbHat'])).toEqual({ head: 'bulbHat' });
  });

  it('empty equips encode to the empty string', () => {
    expect(encodeEquipped({})).toBe('');
    expect(decodeEquipped('')).toEqual({});
  });
});

describe('ownedForSlot', () => {
  it('filters an owned list down to one slot', () => {
    const owned = ['bulbHat', 'alleyBeanie', 'starterScarf'];
    expect(ownedForSlot(owned, 'head').map((d) => d.id)).toEqual(['bulbHat', 'alleyBeanie']);
    expect(ownedForSlot(owned, 'back')).toEqual([]);
  });
});
