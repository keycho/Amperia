import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { saleValue } from './economy';

/**
 * EARLY BOLTS TUNING (EBT) — the sanity ratio. A Spark's first ~15 minutes
 * should net roughly 75–100 Bolts so gather → sell → buy always affords a
 * cheap ware and the first hour feels generous. These lock the tuned
 * numbers and the modelled early-session total against that band.
 */

const OB = CONFIG.economy.onboarding;
const questBolts = (id: string): number => {
  const def = CONFIG.quests.defs.find((d) => d.id === id);
  if (def === undefined) throw new Error(`no quest ${id}`);
  return def.rewards.bolts;
};

describe('EBT quest-step payouts', () => {
  it('the first three starter quests follow the 10/25/15 curve', () => {
    expect([questBolts('tut1'), questBolts('tut2'), questBolts('tut3')]).toEqual([10, 25, 15]);
  });

  it('the welcome bonus doubles the first three turn-ins (100 Bolts total)', () => {
    expect(OB.starterQuestBonus).toEqual({ count: 3, multiplier: 2 });
    const doubled =
      (questBolts('tut1') + questBolts('tut2') + questBolts('tut3')) *
      OB.starterQuestBonus.multiplier;
    expect(doubled).toBe(100);
  });
});

describe('EBT Manifest first-finds', () => {
  it('every first-find payout sits inside the 10–25 Bolt band', () => {
    const values = [...Object.values(OB.manifestFind.byPage), OB.manifestFind.default];
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(25);
    }
  });
});

describe('EBT sanity ratio', () => {
  it("a diligent Spark's first ~15 minutes nets 75–100 Bolts", () => {
    const salvageBand = CONFIG.economy.merchant.buy.salvage;
    const warmcup = CONFIG.economy.merchant.sells.find((s) => s.itemId === 'warmcup');
    if (warmcup === undefined) throw new Error('no warmcup ware');

    // The GUARANTEED early path (fresh merchant pressure), no RNG:
    //  · gather + sell ~10 Salvage (the guided loop plus the tut2 quota),
    //  · buy one 12-Bolt Warmcup,
    //  · turn in the first two starter quests at the welcome 2×.
    // A rare Manifest first-find (+10–25) is on-top luck, not part of the
    // floor, so it's excluded from the guaranteed sanity model.
    const sale = saleValue(0, 10, salvageBand).totalBolts;
    const buy = warmcup.price;
    const q1 = questBolts('tut1') * OB.starterQuestBonus.multiplier;
    const q2 = questBolts('tut2') * OB.starterQuestBonus.multiplier;

    const total = sale - buy + q1 + q2;
    expect(total).toBeGreaterThanOrEqual(75);
    expect(total).toBeLessThanOrEqual(100);

    // Even with a lucky rare first-find on top, the first 15 minutes stays
    // civilised (well under a day's worth).
    const withFind = total + (OB.manifestFind.byPage.scavving ?? OB.manifestFind.default);
    expect(withFind).toBeLessThanOrEqual(130);
  });

  it('never grants $AMP or converts Bolts — onboarding is a pure Bolts faucet', () => {
    // Structural guard (golden rules 4/5): the config carries only Bolts.
    const json = JSON.stringify(OB);
    expect(json).not.toMatch(/amp|token|mint/i);
  });
});
