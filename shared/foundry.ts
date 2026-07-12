import { COSMETICS, type CosmeticDef } from './cosmetics';

/**
 * THE COSMETIC FOUNDRY (premium shop). This is the catalog: rarity, $AMP
 * price, world flavor, and time-scarcity state for each offering. It is
 * DATA only — no purchase flow lives here (that is the token layer, M4).
 *
 * Non-negotiable rules baked into this file:
 *  · pure style — every entry is a cosmetic; NONE grants a stat, a rate, a
 *    drop, or any gameplay effect (golden rule 3/7). If a flavor line would
 *    ever describe an effect, the item is mis-designed — reject it.
 *  · honest scarcity — SEASONAL sets leave on a published date (VAULTED) and
 *    are never re-sold. No countdown-pressure, no randomness, no FOMO
 *    mechanics; a quiet date is the whole story.
 *  · comms rules — copy never says "earn", "yield", "investment", or
 *    promises resale value.
 */

/** Rarity tiers, named for the Charge Lock ladder (Ember → Arc → Aurora). */
export type FoundryRarity = 'Ember' | 'Arc' | 'Aurora';

/** Palette key each rarity paints its name/tag with. */
export const RARITY_COLOR: Record<FoundryRarity, string> = {
  Ember: 'emberOrange',
  Arc: 'neonCyan',
  Aurora: 'violetNeon',
};

export type FoundryState = 'available' | 'seasonal' | 'vaulted';

export interface FoundryItem {
  /** Cosmetic id — must exist in COSMETICS. */
  id: string;
  rarity: FoundryRarity;
  /** Whole $AMP. Prices are shown, never spun for — no randomness. */
  priceAmp: number;
  /** 1–2 lines of world flavor. EVERY item has this — no flavorless items. */
  flavor: string;
  state: FoundryState;
  /**
   * SEASONAL: the published UTC date the set vaults (leaves the shop).
   * VAULTED: the date it left. AVAILABLE: omitted. Absolute dates only —
   * scarcity is a calendar fact, not a ticking timer.
   */
  vaultDate?: string;
}

/**
 * The catalog. Order = display order (featured items first). A season's set
 * shares a `season` feel through its flavor + vault date; vaulted sets stay
 * listed forever as history, greyed, never re-sold.
 */
export const FOUNDRY_CATALOG: readonly FoundryItem[] = [
  {
    id: 'auroraCrown',
    rarity: 'Aurora',
    priceAmp: 14,
    flavor:
      'Spun from the Terrarium aurora on the longest night. It hums a colour the dusk forgot.',
    state: 'seasonal',
    vaultDate: '2026-07-23',
  },
  {
    id: 'filamentWings',
    rarity: 'Arc',
    priceAmp: 9,
    flavor: 'Two arcs of live filament, strung like the Dynamo cables. They catch the lamplight and hold it.',
    state: 'available',
  },
  {
    id: 'nightmarketCoat',
    rarity: 'Ember',
    priceAmp: 4,
    flavor: 'Cut for the Nightstalls after-hours — plum weave, warm neon piping, deep pockets for keepsakes.',
    state: 'available',
  },
  {
    id: 'duskBloomMantle',
    rarity: 'Arc',
    priceAmp: 8,
    flavor: 'A mantle of dusk-bloom petals from the hanging gardens. It drifts a half-second behind you.',
    state: 'seasonal',
    vaultDate: '2026-08-26',
  },
  {
    id: 'firstLightCrown',
    rarity: 'Aurora',
    priceAmp: 14,
    flavor: "The First Light season's crown — the morning the Dynamo first turned. Its glow runs warm, not cold.",
    state: 'vaulted',
    vaultDate: '2026-06-01',
  },
  {
    id: 'emberdriftCape',
    rarity: 'Arc',
    priceAmp: 9,
    flavor: 'First Light embers, caught mid-drift and stitched to a cape. It remembers a warmer season.',
    state: 'vaulted',
    vaultDate: '2026-06-01',
  },
];

/** Two weeks — under this, a seasonal item shows its quiet "VAULTS IN N DAYS". */
export const VAULT_SOON_DAYS = 14;

export function foundryCosmetic(item: FoundryItem): CosmeticDef | undefined {
  return COSMETICS[item.id];
}

/** Whole UTC days from `nowMs` until a date string (negative = already past). */
export function daysUntil(dateIso: string, nowMs: number): number {
  const then = Date.parse(`${dateIso}T00:00:00Z`);
  return Math.ceil((then - nowMs) / 86_400_000);
}
