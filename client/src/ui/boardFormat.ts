import type { MarketSyncEvent } from '@shared/protocol';

/**
 * T2 — THE CITY BOARD's dot-matrix copy, as pure functions so the rotation
 * logic and every string it can ever show are unit-testable.
 *
 * COMMS RULES (golden rule 11) are load-bearing here: figures only, plain
 * numbers, no emojis, no arrows, no calls to action, never "buy"/"earn"/
 * "yield"/"APY". A negative 24h may dim to rose; nothing ever flashes.
 */

export interface BoardPanel {
  /** The caption row (dot-matrix voice, upper case). */
  caption: string;
  /** The figure row. */
  value: string;
  /** Optional second row (the 24h line under the price). */
  sub?: string;
  /** 'dimRose' only for a negative 24h; everything else stays amber. */
  tone: 'amber' | 'dimRose';
}

/** USD price: sensible digits at any magnitude, never exponent notation. */
export function fmtPriceUsd(v: number): string {
  const s = v >= 1 ? v.toFixed(2) : v.toPrecision(3);
  return `${s.includes('e') ? v.toFixed(8) : s} USD`;
}

/** Compact USD for the big figures: 18,200,000 → "18.2M USD". */
export function fmtCompactUsd(v: number): string {
  const unit = (n: number, u: string): string => {
    const d = n >= 100 ? 0 : 1;
    return `${n.toFixed(d).replace(/\.0$/, '')}${u} USD`;
  };
  if (v >= 1e9) return unit(v / 1e9, 'B');
  if (v >= 1e6) return unit(v / 1e6, 'M');
  if (v >= 1e3) return unit(v / 1e3, 'K');
  return `${Math.round(v)} USD`;
}

/** The 24h line: signed, one decimal, percent. Plain — no arrows. */
export function fmtChange24h(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `24H ${sign}${Math.abs(v).toFixed(1)}%`;
}

/** Grouped thousands for counts (the publicStats convention). */
export function fmtCount(v: number): string {
  return Math.max(0, Math.round(v)).toLocaleString('en-US');
}

/**
 * The rotation deck. Market rows ride only on a LIVE snapshot (fail-soft:
 * a resting ticker shows city rows alone); the burned row additionally
 * waits for the token ledger to report. Pre-launch (unconfigured) the
 * market rows are replaced by the single T3 panel.
 */
export function buildBoardPanels(
  m: MarketSyncEvent | null,
  sparksInCity: number | null,
  charge: { tier: number; tierMax: number } | null,
): BoardPanel[] {
  const panels: BoardPanel[] = [];
  if (m !== null && m.live && m.priceUsd !== null) {
    panels.push({
      caption: '$AMP',
      value: fmtPriceUsd(m.priceUsd),
      sub: m.change24hPct === null ? undefined : fmtChange24h(m.change24hPct),
      tone: m.change24hPct !== null && m.change24hPct < 0 ? 'dimRose' : 'amber',
    });
    if (m.marketCapUsd !== null) {
      panels.push({ caption: 'MARKET CAP', value: fmtCompactUsd(m.marketCapUsd), tone: 'amber' });
    }
    if (m.burnedAmp !== null) {
      panels.push({
        caption: 'BURNED TO DATE',
        value: `${fmtCount(m.burnedAmp)} $AMP`,
        tone: 'amber',
      });
    }
  } else if (m !== null && !m.configured) {
    panels.push({ caption: 'THE TICKER', value: 'WAKES AT LAUNCH', tone: 'amber' });
  }
  if (sparksInCity !== null) {
    panels.push({ caption: 'SPARKS IN THE CITY', value: fmtCount(sparksInCity), tone: 'amber' });
  }
  if (charge !== null) {
    panels.push({
      caption: 'CITYWIDE CHARGE',
      value: charge.tier <= 0 ? 'UNLIT' : `TIER ${charge.tier} OF ${charge.tierMax}`,
      tone: 'amber',
    });
  }
  return panels;
}
