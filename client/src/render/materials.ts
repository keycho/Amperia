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
}

const def = (
  base: number,
  noise: number,
  wearChance: number,
  stainChance: number,
  litSat: number,
  tier: 'low' | 'mid' = 'mid',
): Material => ({
  // LOW tier (ground/walls/backdrop) sits greyer than MID (props).
  base: tier === 'low' ? sat(base, -0.18) : base,
  noise,
  wearChance,
  stainChance,
  litSat,
});

export const MATERIALS = {
  /** Warm brown-orange old steel: crates, junk, machines past their prime. */
  rust: def(MATERIAL_INT.rust, 0.11, 0.24, 0.12, 0.4),
  rustDeep: def(MATERIAL_INT.rustDeep, 0.1, 0.2, 0.12, 0.35),
  /** Cool grey-blue plating: the Dynamo, pipes, industrial frames. */
  gunmetal: def(MATERIAL_INT.gunmetal, 0.05, 0.07, 0.09, 0.1, 'low'),
  gunmetalDeep: def(MATERIAL_INT.gunmetalDeep, 0.05, 0.06, 0.09, 0.08, 'low'),
  /** Tan decking and stall timber. */
  wood: def(MATERIAL_INT.wood, 0.09, 0.2, 0.07, 0.25),
  woodDeep: def(MATERIAL_INT.woodDeep, 0.09, 0.16, 0.07, 0.2),
  /** Weathered paint — truer color under the lamps (addendum c). */
  paintTeal: def(MATERIAL_INT.paintTeal, 0.06, 0.12, 0.1, 0.5),
  paintOchre: def(MATERIAL_INT.paintOchre, 0.06, 0.12, 0.1, 0.5),
  paintRose: def(MATERIAL_INT.paintRose, 0.06, 0.12, 0.1, 0.5),
  /** Neutral grey-mauve pavement and curbs. */
  concrete: def(MATERIAL_INT.concrete, 0.045, 0.09, 0.13, 0.05, 'low'),
  concreteDeep: def(MATERIAL_INT.concreteDeep, 0.045, 0.08, 0.13, 0.05, 'low'),
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
