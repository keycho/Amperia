import { describe, expect, it } from 'vitest';
import type { MarketSyncEvent } from '@shared/protocol';
import {
  buildBoardPanels,
  fmtChange24h,
  fmtCompactUsd,
  fmtCount,
  fmtPriceUsd,
} from './boardFormat';

const live = (over: Partial<MarketSyncEvent> = {}): MarketSyncEvent => ({
  live: true,
  configured: true,
  priceUsd: 0.0182,
  change24hPct: -3.2,
  marketCapUsd: 18_200_000,
  burnedAmp: null,
  asOfMs: 1_000,
  ...over,
});

describe('formatters', () => {
  it('prices read plainly at any magnitude, never exponent notation', () => {
    expect(fmtPriceUsd(1.5)).toBe('1.50 USD');
    expect(fmtPriceUsd(0.0182)).toBe('0.0182 USD');
    expect(fmtPriceUsd(0.0000123)).toBe('0.0000123 USD');
  });

  it('market cap compacts without ceremony', () => {
    expect(fmtCompactUsd(18_200_000)).toBe('18.2M USD');
    expect(fmtCompactUsd(2_400_000_000)).toBe('2.4B USD');
    expect(fmtCompactUsd(950)).toBe('950 USD');
    expect(fmtCompactUsd(125_000)).toBe('125K USD');
  });

  it('the 24h line is signed, one decimal, no arrows and no emojis', () => {
    expect(fmtChange24h(-3.2)).toBe('24H -3.2%');
    expect(fmtChange24h(2)).toBe('24H +2.0%');
    expect(fmtChange24h(0)).toBe('24H 0.0%');
  });

  it('counts group thousands like the public stats do', () => {
    expect(fmtCount(12_402_110)).toBe('12,402,110');
  });
});

describe('buildBoardPanels — the rotation deck', () => {
  it('live market: price (with 24h), cap, then the city rows', () => {
    const panels = buildBoardPanels(live(), 14, { tier: 2, tierMax: 3 });
    expect(panels.map((p) => p.caption)).toEqual([
      '$AMP',
      'MARKET CAP',
      'SPARKS IN THE CITY',
      'CITYWIDE CHARGE',
    ]);
    expect(panels[0]?.sub).toBe('24H -3.2%');
    expect(panels[3]?.value).toBe('TIER 2 OF 3');
  });

  it('a negative 24h dims to rose; a positive one stays amber', () => {
    expect(buildBoardPanels(live(), null, null)[0]?.tone).toBe('dimRose');
    expect(buildBoardPanels(live({ change24hPct: 4.2 }), null, null)[0]?.tone).toBe('amber');
  });

  it('the burned row appears only once the token ledger reports', () => {
    expect(
      buildBoardPanels(live(), null, null).some((p) => p.caption === 'BURNED TO DATE'),
    ).toBe(false);
    const withBurn = buildBoardPanels(live({ burnedAmp: 12_402_110 }), null, null);
    expect(withBurn.find((p) => p.caption === 'BURNED TO DATE')?.value).toBe(
      '12,402,110 $AMP',
    );
  });

  it('pre-token (T3): the wake panel replaces every market row', () => {
    const panels = buildBoardPanels(
      live({ live: false, configured: false, priceUsd: null, marketCapUsd: null }),
      3,
      { tier: 0, tierMax: 3 },
    );
    expect(panels.map((p) => p.caption)).toEqual([
      'THE TICKER',
      'SPARKS IN THE CITY',
      'CITYWIDE CHARGE',
    ]);
    expect(panels[0]?.value).toBe('WAKES AT LAUNCH');
    expect(panels[2]?.value).toBe('UNLIT');
  });

  it('configured but resting (stale feed): city rows only — no stale figures', () => {
    const panels = buildBoardPanels(
      live({ live: false, priceUsd: null, marketCapUsd: null }),
      5,
      null,
    );
    expect(panels.map((p) => p.caption)).toEqual(['SPARKS IN THE CITY']);
  });

  it('every string obeys the comms rules — no selling words anywhere', () => {
    const all = [
      ...buildBoardPanels(live({ burnedAmp: 1 }), 9, { tier: 3, tierMax: 3 }),
      ...buildBoardPanels(live({ live: false, configured: false }), 9, { tier: 0, tierMax: 3 }),
    ];
    for (const p of all) {
      const text = `${p.caption} ${p.value} ${p.sub ?? ''}`.toLowerCase();
      for (const banned of ['buy', 'earn', 'yield', 'apy', 'invest', 'moon', 'soon']) {
        expect(text).not.toContain(banned);
      }
    }
  });
});
