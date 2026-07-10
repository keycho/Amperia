/**
 * AMPERIA locked palette — the exact hex constants from ART-DIRECTION.md §2.
 *
 * These are the ONLY colors used anywhere in the game (client, UI, effects).
 * Never hardcode a hex in game code — import from here. Blends for subtle
 * variation must go through {@link mixPalette} so every on-screen color is
 * derived from the locked table.
 */
export const PALETTE = {
  /** Sky, deepest shadows — a warm plum, never pure black. */
  duskSky: '#35284F',
  /** Sprite outlines and fine linework only — not large fills. */
  ink: '#1E1930',
  /** Building bodies, walls, mid-shadow. */
  structureMid: '#4E4560',
  /** Primary walkable pavement / plating (warm grey-mauve). */
  groundBase: '#6B5E70',
  /** Wooden decks, tan tiles, rugs, paths — warmth & variety. */
  groundAccent: '#9A8574',
  /** The overall golden light wash, lamp halos. */
  warmGlow: '#FFD9A0',
  /** Signage, lanterns, key light sources (primary warm neon). */
  neonAmber: '#FFB84D',
  /** Accent signage, fabric, highlights. */
  neonRose: '#FF6F91',
  /** Interactables, UI highlights, screens (primary cool neon). */
  neonTeal: '#2FD3B8',
  /** Holo-signage, water/coolant glints (secondary cool neon). */
  neonCyan: '#5BC0FF',
  /** Potted plants, hanging gardens — greenery as decor, never terrain. */
  solarGreen: '#7BC59A',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * UI text color: "near-white with a warm tint" (kickoff spec §Project setup 4).
 * Derived as warmGlow washed 60% toward white — the sanctioned text color on
 * dark panels. Not part of the world palette; UI text only.
 */
export const UI_TEXT_WARM = '#FFF0D9';

/** Parse '#RRGGBB' to a 0xRRGGBB integer (Phaser color format). */
export function hexToInt(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Format a 0xRRGGBB integer back to '#RRGGBB' (CSS/DOM contexts). */
export function intToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Locked palette as 0xRRGGBB integers, for Phaser fill/tint APIs. */
export const PALETTE_INT: Readonly<Record<PaletteKey, number>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(PALETTE) as PaletteKey[]).map((k) => [k, hexToInt(PALETTE[k])]),
  ) as Record<PaletteKey, number>,
);

/**
 * Linear blend between two locked palette colors (t = 0 → a, t = 1 → b).
 * The only sanctioned way to produce in-between shades (per-tile variation,
 * shading facets) — inputs are palette keys, so results stay palette-derived.
 */
export function mixPalette(a: PaletteKey, b: PaletteKey, t: number): number {
  const ca = PALETTE_INT[a];
  const cb = PALETTE_INT[b];
  const clamp = Math.max(0, Math.min(1, t));
  const mix = (sa: number, sb: number) => Math.round(sa + (sb - sa) * clamp);
  const r = mix((ca >> 16) & 0xff, (cb >> 16) & 0xff);
  const g = mix((ca >> 8) & 0xff, (cb >> 8) & 0xff);
  const bl = mix(ca & 0xff, cb & 0xff);
  return (r << 16) | (g << 8) | bl;
}

/**
 * MATERIAL BASE COLORS — the owner-directed materials pass (2026-07-10):
 * every world object is built from a real material; purple/plum is reserved
 * for unlit shadow sides, the night-air tint, and the void — it is no longer
 * a material. These are the sanctioned hue-shifted derivations of the locked
 * table (neons unchanged); like UI_TEXT_WARM they live here so palette.ts
 * stays the single audit point for every color in the game.
 */
export const MATERIAL_COLORS = {
  /** Rusted steel — crates, junk, old machines (warm brown-orange darks). */
  rust: '#6E4A33',
  rustDeep: '#513425',
  /** Gunmetal — Dynamo housing, plating, pipes (cool grey-blue). */
  gunmetal: '#525B6E',
  gunmetalDeep: '#3B4252',
  /** Wood / decking — stall frames, boardwalk, pallets (groundAccent tan). */
  wood: '#9A8574',
  woodDeep: '#75655A',
  /** Painted panels — weathered, never candy. */
  paintTeal: '#5E7A74',
  paintOchre: '#96793F',
  paintRose: '#96626E',
  /** Concrete / pavement — neutral grey-mauve ground and curbs. */
  concrete: '#6B6169',
  concreteDeep: '#514A52',
  /** Street asphalt — dark, warm-grey, never purple. */
  asphalt: '#453F47',
  asphaltDeep: '#332E36',
  /** The void beyond the map: ink fading to near-black (composition §B5). */
  voidBlack: '#0B0812',
} as const;

export type MaterialColorKey = keyof typeof MATERIAL_COLORS;

/** Material base colors as 0xRRGGBB integers. */
export const MATERIAL_INT: Readonly<Record<MaterialColorKey, number>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(MATERIAL_COLORS) as MaterialColorKey[]).map((k) => [
      k,
      hexToInt(MATERIAL_COLORS[k]),
    ]),
  ) as Record<MaterialColorKey, number>,
);
