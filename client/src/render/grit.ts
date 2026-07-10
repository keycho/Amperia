import Phaser from 'phaser';

/**
 * GRIT PASS — fixed texel density + face grit (owner A/B, ?grit= toggle).
 *
 * The world bakes at 2× (16 texture px per 8-world-px voxel diamond) and
 * draws at 0.5, which reads SMOOTH at medium/wide zoom. Grit caps the
 * texel density: after a model bakes, its texture is downsampled with
 * NEAREST sampling to N texels per voxel edge and drawn scaled back up,
 * so the chunky pixel grid rides the WORLD (visible at every zoom), not
 * the screen. Same toggle pattern as the parked ?style system:
 *
 *   ?grit=none  A — current smooth bake (16 texels/voxel)
 *   ?grit=6     B — 6 texels per voxel edge (texel ≈ 1.33 world px)
 *   ?grit=8     C — 8 texels per voxel edge (texel = 1 world px)
 *
 * Every amount is a constant here or a per-material field in
 * materials.ts — tune, don't hunt.
 */

/** The smooth bake's texel count per voxel edge (2× × 8 world px). */
const BAKE_TEXELS = 16;

/** Default when no ?grit= is present — flips to the owner's A/B pick. */
const GRIT_DEFAULT: 'none' | '6' | '8' = 'none';

export interface GritConfig {
  /** Texels per voxel edge, or null for the smooth bake. */
  texelsPerVoxel: 6 | 8 | null;
  /** Hi-res bake px per final texel (1 = no downsample). */
  factor: number;
  on: boolean;
}

function parseGrit(): GritConfig {
  const raw =
    typeof window === 'undefined'
      ? GRIT_DEFAULT
      : (new URLSearchParams(window.location.search).get('grit')?.toLowerCase() ??
        GRIT_DEFAULT);
  if (raw === '6') return { texelsPerVoxel: 6, factor: BAKE_TEXELS / 6, on: true };
  if (raw === '8') return { texelsPerVoxel: 8, factor: BAKE_TEXELS / 8, on: true };
  return { texelsPerVoxel: null, factor: 1, on: false };
}

export const GRIT: GritConfig = parseGrit();

/** Face-grit amounts (G2). Per-material multipliers live in materials.ts. */
export const GRIT_FACE = {
  /** Base chance an exposed side face carries a scratch tick. Combined
   *  with the stain pass this puts marks on ~20% of faces at mult 1. */
  scratchFaceChance: 0.12,
  /** Value swing of a scratch tick (± around the face color). */
  scratchShade: 0.3,
  /** Chance multiplier on corner edge-wear texels (vs mat.wearChance). */
  cornerWearMult: 1.5,
  /** Brightness lift of a worn corner texel. */
  cornerWearShade: 0.5,
  /** Top-face speckle keeps off the diamond tips (fraction of half-axis). */
  topInset: 0.78,
} as const;

/** Film grain (R5, strengthened by the grit pass — felt, not seen). */
export const FILM_GRAIN_ALPHA = 0.075;

/** Floor per-texel speckle amplitude by floor kind (G2, floors). */
export const FLOOR_SPECKLE: Record<string, number> = {
  asphalt: 0.055,
  paver: 0.04,
  paverLight: 0.04,
  plating: 0.05,
  deck: 0.035,
  rug: 0.02,
  coolant: 0.015,
};

/** Deterministic downsampled size for a bake dimension. */
export function gritSize(px: number): number {
  return Math.max(1, Math.round(px / GRIT.factor));
}

/**
 * Downsample a just-generated canvas texture to the grit texel grid with
 * nearest sampling and swap it in place. Returns the display-scale
 * multiplier (1 when grit is off). Textures from Graphics.generateTexture
 * are always canvas-backed, so the read-back is synchronous.
 */
export function gritDownsample(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
): number {
  if (!GRIT.on) return 1;
  const src = scene.textures.get(key).getSourceImage() as
    | HTMLCanvasElement
    | HTMLImageElement;
  const dw = gritSize(w);
  const dh = gritSize(h);
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, w, h, 0, 0, dw, dh);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return w / dw;
}
