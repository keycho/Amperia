import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  canCraft,
  recipeById,
  repairQuote,
  toolSpeedMult,
  weaponDamageMult,
} from './crafting';
import { addItem, fullDurability, makeInventory, transfer } from './inventory';

describe('recipes + canCraft', () => {
  const r = recipeById('magclaw2');
  it('finds recipes by id', () => {
    expect(r?.output).toBe('brassMagclaw');
  });
  it('reports shortfalls honestly', () => {
    const res = canCraft(r!, 10, () => 0);
    expect(res.ok).toBe(false);
    expect(res.missingBolts).toBe(r!.bolts - 10);
    expect(res.missing.length).toBeGreaterThan(0);
  });
  it('passes when everything is covered', () => {
    const res = canCraft(r!, 9999, () => 9999);
    expect(res.ok).toBe(true);
  });
});

describe('tier multipliers', () => {
  it('higher tool tiers gather faster (smaller seconds multiplier)', () => {
    expect(toolSpeedMult('magclaw')).toBe(1);
    expect(toolSpeedMult('brassMagclaw')).toBeLessThan(toolSpeedMult('magclaw'));
    expect(toolSpeedMult('coilMagclaw')).toBeLessThan(toolSpeedMult('brassMagclaw'));
  });
  it('only sparkwrenches raise Brawling damage', () => {
    expect(weaponDamageMult('magclaw')).toBe(1);
    expect(weaponDamageMult('sparkwrench')).toBeGreaterThan(1);
    expect(weaponDamageMult('coilSparkwrench')).toBeGreaterThan(
      weaponDamageMult('brassSparkwrench'),
    );
  });
});

describe('repairQuote', () => {
  it('scales Bolts with missing durability and never quotes zero', () => {
    const small = repairQuote('brassMagclaw', 10);
    const big = repairQuote('brassMagclaw', 190);
    expect(small.bolts).toBeGreaterThanOrEqual(1);
    expect(big.bolts).toBeGreaterThan(small.bolts);
  });
  it('tier-1 gear repairs on Bolts alone (no craft recipe)', () => {
    const q = repairQuote('magclaw', 100);
    expect(q.materials.length).toBe(0);
    expect(q.bolts).toBeGreaterThan(0);
  });
  it('crafted gear charges a fraction of its recipe materials', () => {
    const q = repairQuote('brassMagclaw', CONFIG.gear.maxDurability[2] as number);
    expect(q.materials.length).toBeGreaterThan(0);
  });
});

describe('durability-aware inventory', () => {
  it('gear never stacks and is born at full durability', () => {
    const inv = makeInventory(4);
    const r = addItem(inv, 'sparkwrench', 2, 999);
    expect(r.added).toBe(2);
    expect(r.inv.slots[0]).toEqual({
      itemId: 'sparkwrench',
      qty: 1,
      durability: fullDurability('sparkwrench'),
    });
    expect(r.inv.slots[1]?.qty).toBe(1);
  });
  it('transfer swaps rather than merges gear', () => {
    const inv = makeInventory(4);
    const a = addItem(inv, 'sparkwrench', 2, 999).inv;
    const moved = transfer(a, 0, a, 1, 999);
    expect(moved.src.slots[0]?.qty).toBe(1);
    expect(moved.src.slots[1]?.qty).toBe(1);
  });
});
