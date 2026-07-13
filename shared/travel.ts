import { CONFIG } from './config';
import type { DistrictId } from './map';

/**
 * The tram line (D3): Filament ↔ Stacks ↔ Terrarium ↔ Tangle. One line,
 * tolls charged PER HOP along it — riding farther costs more, and every
 * toll is a recurring Bolts sink (golden rule 9). Pure math so the client
 * board and the server charge can never disagree.
 */

/** Hops between two districts along the line; 0 = no ride (same stop or unknown). */
export function tramHops(from: DistrictId, to: DistrictId): number {
  const line = CONFIG.travel.line as readonly DistrictId[];
  const a = line.indexOf(from);
  const b = line.indexOf(to);
  if (a === -1 || b === -1) return 0;
  return Math.abs(a - b);
}

/**
 * Bolts toll for the ride. 0 means the tram has nowhere to take you — OR the
 * destination rides free (PP6: The Stacks). Distance keeps its price elsewhere.
 */
export function tramToll(from: DistrictId, to: DistrictId): number {
  if (CONFIG.travel.freeStops.includes(to)) return 0;
  return tramHops(from, to) * CONFIG.travel.tollBolts;
}
