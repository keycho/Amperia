import { mixPalette, PALETTE_INT } from '@shared/palette';

/**
 * Warm multiply-tints for the stock Kenney sprites so nothing ever ships the
 * packs' default bright daylight look. All values are palette blends
 * (mixPalette), so every on-screen color stays palette-derived.
 */
export const TINTS = {
  /** Cream shopfront buildings → golden-dusk facades. */
  building: mixPalette('warmGlow', 'groundAccent', 0.25),
  /** Wooden crates → dusty lamplit wood (desaturated: scenery, not neon). */
  crate: mixPalette('groundAccent', 'structureMid', 0.25),
  /** Grey stone/metal cubes → warm mauve structures. The source cubes are
   *  blue-grey, so the tint leans rose to cancel the blue (a pure warm-tan
   *  multiply turns them olive). */
  block: mixPalette('groundAccent', 'neonRose', 0.3),
  /** Ore cubes keep more brightness so the speckles read. */
  oreRock: mixPalette('warmGlow', 'groundBase', 0.3),
  /** White UI icons → warm near-glow. */
  icon: PALETTE_INT.warmGlow,
} as const;
