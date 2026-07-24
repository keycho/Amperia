import { MATERIAL_INT, sat } from '@shared/palette';

/**
 * Material definitions for the voxel pipeline (owner-directed materials
 * pass). A material is a base color plus surface behavior: per-voxel value
 * noise, edge-wear chipping, and stain streaks. Neon accents stay plain
 * color voxels — they are light, not material.
 *
 * SATURATION HIERARCHY (R3b) lives here: LOW-tier structure/ground
 * materials desaturate at the base; every material declares how much
 * richer its color runs on LIT faces (addendum c: full material color in
 * the light, grey only in shadow).
 */
export interface Material {
  /** Left-face mid tone; top/right faces derive via the shade ramp. */
  base: number;
  /** Per-voxel value-noise amplitude (± fraction of shade). */
  noise: number;
  /** Chance an exposed top voxel shows a lighter chipped edge. */
  wearChance: number;
  /** Chance a tall face carries a darker stain/streak. */
  stainChance: number;
  /** Saturation boost on lit (top) faces — rust glows orange in the sun. */
  litSat: number;
  /** GRIT: per-TEXEL value swing inside a face (0 = flat face). Strong on
   *  rust/concrete, subtle on painted panels. Only used when grit is on. */
  speckle: number;
  /** GRIT: multiplier on the global scratch-tick face chance. */
  scratchMult: number;
}

const def = (
  base: number,
  noise: number,
  wearChance: number,
  stainChance: number,
  litSat: number,
  speckle: number,
  scratchMult: number,
  tier: 'low' | 'mid' = 'mid',
): Material => ({
  // LOW tier (ground/walls/backdrop) sits greyer than MID (props).
  base: tier === 'low' ? sat(base, -0.18) : base,
  noise,
  wearChance,
  stainChance,
  litSat,
  speckle,
  scratchMult,
});

export const MATERIALS = {
  /** Warm brown-orange old steel: crates, junk, machines past their prime. */
  rust: def(MATERIAL_INT.rust, 0.11, 0.24, 0.12, 0.4, 0.13, 1.4),
  rustDeep: def(MATERIAL_INT.rustDeep, 0.1, 0.2, 0.12, 0.35, 0.12, 1.3),
  /** Cool grey-blue plating: the Dynamo, pipes, industrial frames. */
  gunmetal: def(MATERIAL_INT.gunmetal, 0.05, 0.07, 0.09, 0.1, 0.08, 1.0, 'low'),
  gunmetalDeep: def(MATERIAL_INT.gunmetalDeep, 0.05, 0.06, 0.09, 0.08, 0.08, 1.0, 'low'),
  /** Tan decking and stall timber. */
  wood: def(MATERIAL_INT.wood, 0.09, 0.2, 0.07, 0.25, 0.08, 0.8),
  woodDeep: def(MATERIAL_INT.woodDeep, 0.09, 0.16, 0.07, 0.2, 0.08, 0.8),
  /** Weathered paint — truer color under the lamps (addendum c). */
  paintTeal: def(MATERIAL_INT.paintTeal, 0.06, 0.12, 0.1, 0.5, 0.045, 0.6),
  paintOchre: def(MATERIAL_INT.paintOchre, 0.06, 0.12, 0.1, 0.5, 0.045, 0.6),
  paintRose: def(MATERIAL_INT.paintRose, 0.06, 0.12, 0.1, 0.5, 0.045, 0.6),
  /** N4c object colors — same weathered-paint surface behavior. */
  paintCyanDeep: def(MATERIAL_INT.paintCyanDeep, 0.06, 0.12, 0.1, 0.5, 0.045, 0.6),
  paintMoss: def(MATERIAL_INT.paintMoss, 0.06, 0.12, 0.1, 0.5, 0.045, 0.6),
  paintPlum: def(MATERIAL_INT.paintPlum, 0.06, 0.12, 0.1, 0.5, 0.045, 0.6),
  paintCream: def(MATERIAL_INT.paintCream, 0.06, 0.12, 0.1, 0.5, 0.045, 0.6),
  /** Neutral grey-mauve pavement and curbs. */
  concrete: def(MATERIAL_INT.concrete, 0.045, 0.09, 0.13, 0.05, 0.11, 1.2, 'low'),
  concreteDeep: def(MATERIAL_INT.concreteDeep, 0.045, 0.08, 0.13, 0.05, 0.11, 1.2, 'low'),
  /** Character skin: quiet noise, no wear/stains, gentle lit warmth. */
  skin: def(MATERIAL_INT.skin, 0.035, 0, 0, 0.12, 0.02, 0),
  /** Character cloth (hair, jackets, knitwear): soft weave variation. */
  cloth: def(MATERIAL_INT.paintRose, 0.06, 0, 0.04, 0.3, 0.04, 0),
} as const;

export type MaterialId = keyof typeof MATERIALS;

/**
 * Deterministic per-voxel hash → [0, 1). Bakes must be stable across runs
 * (and identical between clients), so no Math.random anywhere in here.
 */
export function voxelHash(x: number, y: number, z: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + salt * 974634551) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
