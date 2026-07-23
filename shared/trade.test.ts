import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { addItem, makeInventory, countItem, type Inventory } from './inventory';
import {
  emptyOffer,
  estimateItemValue,
  estimateOfferValue,
  isLopsided,
  itemIsTradeable,
  settleTrade,
  validateOffer,
  type TradeOffer,
} from './trade';


function packWith(items: Array<[string, number]>): Inventory {
  let inv = makeInventory(8);
  for (const [id, qty] of items) {
    inv = addItem(inv, id as never, qty).inv;
  }
  return inv;
}

describe('validateOffer', () => {
  it('accepts a well-formed offer covered by the pack', () => {
    const pack = packWith([['salvage', 20]]);
    const offer: TradeOffer = { bolts: 10, items: [{ itemId: 'salvage', qty: 15 }] };
    expect(validateOffer(pack, 50, offer)).toBeNull();
  });

  it('rejects short Bolts, short items, and bad quantities', () => {
    const pack = packWith([['salvage', 5]]);
    expect(validateOffer(pack, 5, { bolts: 6, items: [] })).toBe('shortBolts');
    expect(
      validateOffer(pack, 5, { bolts: 0, items: [{ itemId: 'salvage', qty: 6 }] }),
    ).toBe('missingItems');
    expect(
      validateOffer(pack, 5, { bolts: 0, items: [{ itemId: 'salvage', qty: 0 }] }),
    ).toBe('badQty');
    expect(validateOffer(pack, 5, { bolts: -1, items: [] })).toBe('badQty');
    expect(validateOffer(pack, 5, { bolts: 1.5, items: [] })).toBe('badQty');
  });

  it('rejects cosmetics — regalia never changes hands', () => {
    const pack = packWith([]);
    expect(itemIsTradeable('starterScarf')).toBe(false);
    expect(
      validateOffer(pack, 0, { bolts: 0, items: [{ itemId: 'starterScarf', qty: 1 }] }),
    ).toBe('untradeable');
  });

  it('matches gear on exact durability (stale offers fail)', () => {
    const pack = makeInventory(4);
    pack.slots[0] = { itemId: 'magclaw', qty: 1, durability: 77 };
    const fresh: TradeOffer = {
      bolts: 0,
      items: [{ itemId: 'magclaw', qty: 1, durability: 77 }],
    };
    const stale: TradeOffer = {
      bolts: 0,
      items: [{ itemId: 'magclaw', qty: 1, durability: 120 }],
    };
    expect(validateOffer(pack, 0, fresh)).toBeNull();
    expect(validateOffer(pack, 0, stale)).toBe('missingItems');
  });

  it('counts split lines of the same item against the total held', () => {
    const pack = packWith([['brass', 10]]);
    const offer: TradeOffer = {
      bolts: 0,
      items: [
        { itemId: 'brass', qty: 6 },
        { itemId: 'brass', qty: 6 },
      ],
    };
    expect(validateOffer(pack, 0, offer)).toBe('missingItems');
  });
});

describe('settleTrade — the escrowed atomic swap', () => {
  it('swaps items and Bolts both ways, conserving totals', () => {
    const a = packWith([['salvage', 30]]);
    const b = packWith([['brass', 12]]);
    const r = settleTrade(
      a,
      100,
      { bolts: 25, items: [{ itemId: 'salvage', qty: 20 }] },
      b,
      40,
      { bolts: 0, items: [{ itemId: 'brass', qty: 12 }] },
    );
    if (!r.ok) throw new Error('expected ok');
    expect(countItem(r.packA, 'salvage')).toBe(10);
    expect(countItem(r.packA, 'brass')).toBe(12);
    expect(countItem(r.packB, 'salvage')).toBe(20);
    expect(countItem(r.packB, 'brass')).toBe(0);
    expect(r.boltsA).toBe(75);
    expect(r.boltsB).toBe(65);
    // Conservation: nothing minted, nothing destroyed.
    expect(r.boltsA + r.boltsB).toBe(140);
    expect(countItem(r.packA, 'salvage') + countItem(r.packB, 'salvage')).toBe(30);
    expect(countItem(r.packA, 'brass') + countItem(r.packB, 'brass')).toBe(12);
  });

  it('moves gear with its worn durability intact', () => {
    const a = makeInventory(4);
    a.slots[0] = { itemId: 'brassTuner', qty: 1, durability: 151 };
    const b = packWith([['glowkoi', 4]]);
    const r = settleTrade(
      a,
      0,
      { bolts: 0, items: [{ itemId: 'brassTuner', qty: 1, durability: 151 }] },
      b,
      0,
      { bolts: 0, items: [{ itemId: 'glowkoi', qty: 4 }] },
    );
    if (!r.ok) throw new Error('expected ok');
    const moved = r.packB.slots.find((s) => s?.itemId === 'brassTuner');
    expect(moved?.durability).toBe(151);
    expect(countItem(r.packA, 'brassTuner')).toBe(0);
  });

  it('refuses (untouched) when a receiving pack cannot hold the goods', () => {
    // B's pack: every slot filled with un-stackable gear, and B stages
    // nothing — so no slot frees up to receive A's gear.
    const b = makeInventory(2);
    b.slots[0] = { itemId: 'magclaw', qty: 1, durability: 120 };
    b.slots[1] = { itemId: 'tuner', qty: 1, durability: 120 };
    const a = makeInventory(2);
    a.slots[0] = { itemId: 'skimnet', qty: 1, durability: 90 };
    const r = settleTrade(
      a,
      0,
      { bolts: 0, items: [{ itemId: 'skimnet', qty: 1, durability: 90 }] },
      b,
      0,
      emptyOffer(),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('bPackFull');
  });

  it('lets a swap through when staging itself frees the needed slot', () => {
    const b = makeInventory(2);
    b.slots[0] = { itemId: 'magclaw', qty: 1, durability: 120 };
    b.slots[1] = { itemId: 'tuner', qty: 1, durability: 120 };
    const a = packWith([['salvage', 10]]);
    const r = settleTrade(
      a,
      0,
      { bolts: 0, items: [{ itemId: 'salvage', qty: 10 }] },
      b,
      0,
      { bolts: 0, items: [{ itemId: 'magclaw', qty: 1, durability: 120 }] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(countItem(r.packB, 'salvage')).toBe(10);
    expect(countItem(r.packA, 'magclaw')).toBe(1);
  });

  it('refuses when either side no longer owns its staged goods', () => {
    const a = packWith([['salvage', 5]]);
    const b = packWith([['brass', 5]]);
    const r = settleTrade(
      a,
      0,
      { bolts: 0, items: [{ itemId: 'salvage', qty: 6 }] },
      b,
      0,
      emptyOffer(),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('aInvalid');
  });

  it('handles the one-sided gift', () => {
    const a = packWith([['signal', 3]]);
    const b = packWith([]);
    const r = settleTrade(
      a,
      10,
      { bolts: 10, items: [{ itemId: 'signal', qty: 3 }] },
      b,
      0,
      emptyOffer(),
    );
    if (!r.ok) throw new Error('expected ok');
    expect(countItem(r.packB, 'signal')).toBe(3);
    expect(r.boltsA).toBe(0);
    expect(r.boltsB).toBe(10);
  });
});

describe('valuation + lopsided flag', () => {
  it('prices resources at their published band midpoint', () => {
    const band = CONFIG.economy.merchant.buy.salvage;
    expect(estimateItemValue('salvage')).toBe(Math.round((band.floor + band.ceiling) / 2));
  });

  it('prices non-resources from the config table with a default fallback', () => {
    expect(estimateItemValue('tuner')).toBe(CONFIG.economy.trade.valuationBolts.tuner);
    expect(estimateItemValue('starterScarf')).toBe(CONFIG.economy.trade.valuationDefaultBolts);
  });

  it('values an offer as bolts + Σ item value × qty', () => {
    const v = estimateOfferValue({
      bolts: 7,
      items: [
        { itemId: 'salvage', qty: 10 },
        { itemId: 'tuner', qty: 1 },
      ],
    });
    expect(v).toBe(7 + estimateItemValue('salvage') * 10 + estimateItemValue('tuner'));
  });

  it('flags lopsided trades, including pure gifts, but not fair swaps', () => {
    const factor = CONFIG.economy.trade.lopsidedFactor;
    expect(isLopsided(100, 90, factor)).toBe(false);
    expect(isLopsided(1000, 10, factor)).toBe(true);
    expect(isLopsided(0, 500, factor)).toBe(true);
    expect(isLopsided(0, 0, factor)).toBe(false);
  });
});
