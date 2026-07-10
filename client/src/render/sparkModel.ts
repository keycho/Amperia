import type Phaser from 'phaser';
import { MATERIAL_INT, mixPalette, PALETTE_INT } from '@shared/palette';
import { MATERIALS } from './materials';
import { voxelHash } from './materials';
import { bakeVoxelModel, shade, type Voxel } from './voxel';

/**
 * The Spark character pipeline (identity block). The canonical reference
 * is docs/brand/spark-mascot.png — the bust below IS that reference,
 * rebuilt through the real voxel pipeline: warm sand skin, rose mop under
 * a black goggle band with teal lenses, plum collar with the amber tag,
 * and the glowing bulb hat. Every body/cosmetic build in this file keeps
 * that material language.
 */

export const SPARK_COLORS = {
  skin: MATERIAL_INT.skin,
  hairRose: mixPalette('neonRose', 'structureMid', 0.12),
  hairRoseDeep: mixPalette('neonRose', 'ink', 0.42),
  band: mixPalette('ink', 'structureMid', 0.22),
  lens: PALETTE_INT.neonTeal,
  jacketPlum: mixPalette('duskSky', 'structureMid', 0.42),
  jacketPlumDeep: mixPalette('duskSky', 'ink', 0.35),
  tag: PALETTE_INT.neonAmber,
  bulbGlass: mixPalette('warmGlow', 'neonAmber', 0.25),
  bulbHot: 0xfff3d0 as number, // core only — leaned from warmGlow via shade
  screw: mixPalette('structureMid', 'ink', 0.15),
} as const;

const skinMat = MATERIALS.skin;
const cloth = MATERIALS.cloth;

/** Material-tagged box with an arbitrary color (mat drives behavior). */
function cbox(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  c: number,
  mat = cloth,
): Voxel[] {
  const out: Voxel[] = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      for (let dz = 0; dz < h; dz++) {
        out.push({ x: x + dx, y: y + dy, z: z + dz, c, mat });
      }
    }
  }
  return out;
}

/**
 * THE MASCOT BUST — the brand reference model (I0). Rendered at 1000px on
 * black for docs/brand/spark-mascot.png and compared against every
 * character-work screenshot.
 */
export function mascotBustModel(): Voxel[] {
  const v: Voxel[] = [];

  // Plum collar slab with the amber tag on the lit (+y) chest face.
  v.push(...cbox(0, 0, 0, 18, 18, 2, SPARK_COLORS.jacketPlum));
  v.push({ x: 12, y: 17, z: 0, c: SPARK_COLORS.tag });
  v.push({ x: 13, y: 17, z: 0, c: SPARK_COLORS.tag });
  // Dark under-band between collar and jaw.
  v.push(...cbox(1, 1, 2, 16, 16, 1, SPARK_COLORS.jacketPlumDeep));

  // The head: warm sand skin. The FACE goes on the +y side — that is the
  // projection's LEFT face, which renders at base color (the lit side).
  for (const vox of cbox(2, 2, 3, 14, 14, 5, SPARK_COLORS.skin, skinMat)) {
    v.push(vox);
  }
  // Mouth: a small dark dip on the proud face plane, under the lens gap.
  v.push({ x: 8, y: 16, z: 4, c: shade(SPARK_COLORS.skin, -0.45) });
  v.push({ x: 9, y: 16, z: 4, c: shade(SPARK_COLORS.skin, -0.45) });

  // Goggle band: a PROUD wrap (one voxel out from the head all around) so
  // the black strip stays visible under the mop — it's a signature element.
  v.push(...cbox(1, 1, 8, 16, 16, 2, SPARK_COLORS.band));
  // Two big teal lenses sitting proud of the face, just under the band.
  v.push(...cbox(4, 16, 5, 4, 1, 3, SPARK_COLORS.lens));
  v.push(...cbox(10, 16, 5, 4, 1, 3, SPARK_COLORS.lens));

  // The rose mop: corner-cut layers with jagged edges and lighter streaks.
  const hairLayer = (
    x0: number,
    y0: number,
    z0: number,
    size: number,
    h: number,
    cut: number,
    jag: boolean,
  ) => {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        // Diagonal corner cut → the layer reads as a rounded octagon.
        if (Math.min(dx, size - 1 - dx) + Math.min(dy, size - 1 - dy) < cut) continue;
        const onEdge = dx === 0 || dy === 0 || dx === size - 1 || dy === size - 1;
        if (jag && onEdge && voxelHash(x0 + dx, y0 + dy, z0, 51) < 0.28) continue;
        for (let dz = 0; dz < h; dz++) {
          const streak = voxelHash(x0 + dx, y0 + dy, z0 + dz, 53);
          const c =
            streak < 0.16
              ? shade(SPARK_COLORS.hairRose, 0.22)
              : streak > 0.85
                ? SPARK_COLORS.hairRoseDeep
                : SPARK_COLORS.hairRose;
          v.push({ x: x0 + dx, y: y0 + dy, z: z0 + dz, c, mat: cloth });
        }
      }
    }
  };
  // Bulge at the second layer, then a stepped dome — the bottom layer
  // matches the band footprint so the black strip stays visible.
  hairLayer(1, 1, 10, 16, 2, 2, true);
  hairLayer(0, 0, 12, 18, 2, 2, true);
  hairLayer(2, 2, 14, 14, 1, 2, true);
  hairLayer(3, 3, 15, 12, 1, 1, true);
  hairLayer(4, 4, 16, 10, 1, 1, false);
  hairLayer(5, 5, 17, 8, 1, 1, false);

  // The bulb: screw base + warm glass with a hot core (glow at placement).
  v.push(...cbox(7, 7, 18, 4, 4, 2, SPARK_COLORS.screw, MATERIALS.gunmetal));
  for (let dx = 0; dx < 6; dx++) {
    for (let dy = 0; dy < 6; dy++) {
      for (let dz = 0; dz < 5; dz++) {
        const corner =
          (dx === 0 || dx === 5) && (dy === 0 || dy === 5) && (dz === 0 || dz === 4);
        if (corner) continue; // knock the corners: rounder glass
        const inner = dx > 1 && dx < 4 && dy > 1 && dy < 4;
        v.push({
          x: 6 + dx,
          y: 6 + dy,
          z: 20 + dz,
          c: inner ? shade(SPARK_COLORS.bulbGlass, 0.35) : SPARK_COLORS.bulbGlass,
        });
      }
    }
  }
  return v;
}

/** Bake the identity-block character models (call from BootScene). */
export function bakeSparkModels(scene: Phaser.Scene): void {
  bakeVoxelModel(scene, {
    name: 'spark-mascot-bust',
    voxels: mascotBustModel(),
    warmRim: true,
    shadow: false,
    grounding: false,
  });
}
