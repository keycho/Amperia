import { describe, expect, it } from 'vitest';
import {
  cityStatTiles,
  LEDGER_FOOTER,
  TOKEN_LEDGER_PLACEHOLDER,
  TOKEN_LEDGER_TILES,
  type PublicStats,
} from './publicStats';

const SAMPLE: PublicStats = {
  asOfMs: 0,
  sparksRegistered: 1234,
  sparksActiveToday: 87,
  boltsInCirculation: 4_560_000,
  boltsSunkThisWeek: 12_345,
  tradesCompleted: 42,
  chargeTier: 2,
  chargeTierMax: 3,
  topDistrict: { id: 'tangle', name: 'The Tangle' },
};

describe('cityStatTiles', () => {
  it('renders every aggregate as a labelled tile, in order', () => {
    const tiles = cityStatTiles(SAMPLE);
    expect(tiles).toHaveLength(7);
    expect(tiles[0]).toMatchObject({ label: 'Sparks registered', value: '1,234' });
    expect(tiles[2]).toMatchObject({ label: 'Bolts in circulation', value: '4,560,000' });
    expect(tiles[3]?.value).toBe('12,345');
    expect(tiles[5]).toMatchObject({ label: 'Citywide Charge', value: 'tier 2 of 3' });
    expect(tiles[6]).toMatchObject({ label: 'Busiest district', value: 'The Tangle' });
  });

  it('shows an unlit Charge and an em-dash for a quiet city', () => {
    const quiet = cityStatTiles({ ...SAMPLE, chargeTier: 0, topDistrict: null });
    expect(quiet[5]?.value).toBe('unlit');
    expect(quiet[6]?.value).toBe('—');
  });

  it('never renders a negative count', () => {
    const tiles = cityStatTiles({ ...SAMPLE, boltsInCirculation: -5, tradesCompleted: -1 });
    expect(tiles[2]?.value).toBe('0');
    expect(tiles[4]?.value).toBe('0');
  });
});

describe('comms rules (golden rule 11)', () => {
  // Never "earn", "yield", "APY", "investment", or price talk — backward-looking only.
  const BANNED = /\b(earn|yield|apy|invest(?:ment|ing|or)?|profit|roi|dividend|price|buy low)\b/i;
  const allCopy = [
    ...cityStatTiles(SAMPLE).flatMap((t) => [t.label, t.value, t.hint]),
    ...TOKEN_LEDGER_TILES.flatMap((t) => [t.label, t.hint]),
    TOKEN_LEDGER_PLACEHOLDER,
    LEDGER_FOOTER,
  ];

  it('has no forbidden earn/yield/price language anywhere', () => {
    for (const s of allCopy) expect(s, s).not.toMatch(BANNED);
  });

  it('keeps the locked footer exactly', () => {
    expect(LEDGER_FOOTER).toBe('Updated monthly in public. Nothing here is ever estimated.');
  });

  it('greys the token tiles until the first ledger', () => {
    expect(TOKEN_LEDGER_TILES).toHaveLength(4);
    expect(TOKEN_LEDGER_PLACEHOLDER).toBe('— awaiting first ledger —');
  });
});
