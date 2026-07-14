import { DISTRICT_NAMES, type DistrictId } from './map';

/**
 * PUBLIC STATS — the ONE contract shared by the server endpoint
 * (`GET /api/public-stats`, P1), the public `/ledger` dashboard (P2), and any
 * marketing page (P3), so the three never drift.
 *
 * Everything here is AGGREGATE and NON-PERSONAL: no usernames, no per-player
 * rows, no wallet anything. Framing is BACKWARD-LOOKING only, and copy obeys
 * the comms rules (golden rule 11): never "earn", "yield", "APY",
 * "investment", or price talk — the city reports what happened, it never
 * projects or sells.
 */

/** The raw aggregate snapshot. This exact shape is the response's `stats`. */
export interface PublicStats {
  /** Server clock (ms) the snapshot was built at. */
  asOfMs: number;
  /** Sparks ever registered (accounts with a Character). */
  sparksRegistered: number;
  /** Distinct Sparks seen since UTC midnight. */
  sparksActiveToday: number;
  /** Bolts in circulation — Sparks' hands + stall cashboxes. */
  boltsInCirculation: number;
  /** Bolts removed by sinks over the last 7 days (tolls, repairs, fees). */
  boltsSunkThisWeek: number;
  /** Player trades settled, all time. */
  tradesCompleted: number;
  /** Citywide Charge tier this week (0 = unlit). */
  chargeTier: number;
  /** Highest reachable Charge tier (for "tier N of M"). */
  chargeTierMax: number;
  /** Busiest district today, or null when the city is quiet. */
  topDistrict: { id: string; name: string } | null;
}

/** A rendered city-stat tile — label + display value + one-line hint. */
export interface StatTile {
  label: string;
  value: string;
  hint: string;
}

/** A token-ledger tile: label + hint only (values await the first City Ledger). */
export interface TokenTile {
  label: string;
  hint: string;
}

/** The full `/api/public-stats` response. Consumers render `tiles`/`tokenTiles`
 *  directly (no client-side formatting → no drift); `stats` is the raw shape
 *  for anything that needs the numbers. */
export interface PublicStatsResponse {
  stats: PublicStats;
  tiles: StatTile[];
  tokenTiles: TokenTile[];
  tokenPlaceholder: string;
  /** Human "as of" line, UTC. */
  updatedIso: string;
}

/** Grouped thousands, stable across server + client. */
function n(v: number): string {
  return Math.max(0, Math.round(v)).toLocaleString('en-US');
}

/**
 * The live city tiles, formatted ONCE here so every surface reads identically.
 * Order is the display order.
 */
export function cityStatTiles(s: PublicStats): StatTile[] {
  return [
    { label: 'Sparks registered', value: n(s.sparksRegistered), hint: 'accounts made, all time' },
    { label: 'Active today', value: n(s.sparksActiveToday), hint: 'Sparks seen since UTC midnight' },
    {
      label: 'Bolts in circulation',
      value: n(s.boltsInCirculation),
      hint: "in Sparks' hands and stall cashboxes",
    },
    {
      label: 'Bolts sunk this week',
      value: n(s.boltsSunkThisWeek),
      hint: 'removed by tolls, repairs and fees (7 days)',
    },
    { label: 'Trades completed', value: n(s.tradesCompleted), hint: 'player deals settled, all time' },
    {
      label: 'Citywide Charge',
      value: s.chargeTier <= 0 ? 'unlit' : `tier ${s.chargeTier} of ${s.chargeTierMax}`,
      hint: "this week's Dynamo meter",
    },
    {
      label: 'Busiest district',
      value: s.topDistrict?.name ?? '—',
      hint: 'most Sparks active today',
    },
  ];
}

/**
 * The TOKEN LEDGER tiles. Values await the first published City Ledger (the
 * token layer is M4-gated — no $AMP state exists yet), so they render greyed
 * with {@link TOKEN_LEDGER_PLACEHOLDER}. Copy is backward-looking; the only
 * treasury outflows named are burns and the champions' purse (golden rule 8).
 * v3 economy: purchases are $AMP-only and split 30% burn / 70% treasury; the
 * buyback is flag-gated OFF (CREATOR_REWARDS_ENABLED) until creator-fee volume
 * is confirmed, so its total reads 0 until then.
 */
export const TOKEN_LEDGER_TILES: readonly TokenTile[] = [
  { label: '$AMP burned', hint: '30% of every spend, on-chain' },
  { label: 'Treasury balance', hint: 'the 70% share; only ever burns + the purse' },
  { label: 'Buyback total', hint: 'monthly; off until creator fees are confirmed' },
  { label: "Champions' purse", hint: 'the capped prize purse' },
];

export const TOKEN_LEDGER_PLACEHOLDER = '— awaiting first ledger —';

/** The public footer line (comms-locked). */
export const LEDGER_FOOTER = 'Updated monthly in public. Nothing here is ever estimated.';

/** Resolve a district id to its display name (safe for unknown ids). */
export function districtName(id: string): string {
  return DISTRICT_NAMES[id as DistrictId] ?? id;
}
