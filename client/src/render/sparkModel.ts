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
  jacketPlum: mixPalette('duskSky', 'structureMid', 0.68),
  jacketPlumDeep: mixPalette('duskSky', 'structureMid', 0.28),
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

// ── the base Spark body (I1) ───────────────────────────────────────────────
//
// Canonical models are built in TWO views and transposed for the other two
// directions, so every direction is a REAL bake with correct face shading
// (never a texture flip):
//   front (face on +y, the lit face) = SW · transpose → SE
//   back  (back on +y)               = NE · transpose → NW

export type SparkFrame = 'idle' | 'walkA' | 'walkP' | 'walkB';
export type SparkPoseId =
  | 'magclaw'
  | 'drillhammer'
  | 'skimnet'
  | 'tuner'
  | 'riveter'
  | 'brawl';

const BODY_COLORS = {
  boots: MATERIAL_INT.gunmetal,
  trousers: mixPalette('structureMid', 'ink', 0.28),
  sleeve: mixPalette('duskSky', 'structureMid', 0.45),
  scarf: PALETTE_INT.neonRose,
  scarfDeep: mixPalette('neonRose', 'ink', 0.3),
  toolWood: MATERIAL_INT.wood,
  toolMetal: MATERIAL_INT.gunmetal,
  toolRust: MATERIAL_INT.rust,
} as const;

/** Swap x↔y: mirrors the screen silhouette with correct re-baked shading. */
function transpose(voxels: Voxel[]): Voxel[] {
  return voxels.map((v) => ({ ...v, x: v.y, y: v.x }));
}

/** Rectangular hair layer with corner cuts + jagged edges (mop language). */
function mopLayer(
  v: Voxel[],
  x0: number,
  y0: number,
  z0: number,
  w: number,
  d: number,
  h: number,
  cut: number,
  jag: boolean,
): void {
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      if (Math.min(dx, w - 1 - dx) + Math.min(dy, d - 1 - dy) < cut) continue;
      const onEdge = dx === 0 || dy === 0 || dx === w - 1 || dy === d - 1;
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
}

/** Tool minis for the gather poses, as offsets past the raised hand.
 *  [dx, dyForward, dz, color] — dyForward is mapped through the view. */
const TOOL_CELLS: Record<Exclude<SparkPoseId, 'brawl'>, Array<[number, number, number, number]>> = {
  magclaw: [
    [0, 1, 0, BODY_COLORS.toolRust],
    [-1, 2, 0, PALETTE_INT.neonTeal],
    [1, 2, 0, PALETTE_INT.neonTeal],
  ],
  drillhammer: [
    [0, 1, 0, BODY_COLORS.toolWood],
    [-1, 2, 0, BODY_COLORS.toolMetal],
    [0, 2, 0, BODY_COLORS.toolMetal],
    [1, 2, 0, BODY_COLORS.toolMetal],
    [0, 2, 1, BODY_COLORS.toolMetal],
  ],
  skimnet: [
    [0, 1, 0, BODY_COLORS.toolWood],
    [-1, 2, 0, PALETTE_INT.neonTeal],
    [1, 2, 0, PALETTE_INT.neonTeal],
    [-1, 3, 0, PALETTE_INT.neonTeal],
    [1, 3, 0, PALETTE_INT.neonTeal],
    [0, 3, 0, PALETTE_INT.neonTeal],
  ],
  tuner: [
    [0, 1, 0, BODY_COLORS.toolMetal],
    [0, 2, 0, PALETTE_INT.neonCyan],
    [0, 1, 1, BODY_COLORS.toolMetal],
  ],
  riveter: [
    [0, 1, 0, BODY_COLORS.toolRust],
    [0, 2, 0, BODY_COLORS.toolRust],
    [0, 3, 0, PALETTE_INT.neonAmber],
  ],
};

interface SparkBuild {
  view: 'front' | 'back';
  frame: SparkFrame;
  pose?: SparkPoseId;
  scarf?: boolean;
}

/**
 * The Spark body, mascot-proportioned: boots, trousers, tool-belt, layered
 * plum jacket with visible hands, and the oversized head (~45% of total
 * height) under the rose mop and goggle band. Walk frames carry weight —
 * stride split + counter-swinging arms (A/B), body lifted one voxel on the
 * passing frame (P), constant forward lean while moving.
 */
export function sparkBodyModel(b: SparkBuild): Voxel[] {
  const v: Voxel[] = [];
  const C = SPARK_COLORS;
  const back = b.view === 'back';
  const fwd = back ? -1 : 1;
  const posed = b.pose !== undefined;
  const walking = !posed && b.frame !== 'idle';
  // Stride: left leg forward on A, right on B; legs together on P/idle.
  const stride = b.frame === 'walkA' ? 1 : b.frame === 'walkB' ? -1 : 0;
  const lift = !posed && b.frame === 'walkP' ? 1 : 0;
  const lean = (walking ? 1 : posed ? 1 : 0) * fwd;

  // Legs (boots z0-1, trousers z2-3): two 2×3 columns.
  const leg = (x0: number, dy: number) => {
    v.push(...cbox(x0, dy, 0, 2, 3, 2, BODY_COLORS.boots, MATERIALS.gunmetal));
    v.push(...cbox(x0, dy, 2, 2, 3, 2, BODY_COLORS.trousers));
  };
  leg(1, walking ? stride * fwd : 0);
  leg(3, walking ? -stride * fwd : 0);

  // Tool-belt (z4): dark strap, amber buckle on the front, rust hip pouch.
  v.push(...cbox(1, lean, 4 + lift, 4, 3, 1, C.band, MATERIALS.gunmetal));
  if (!back) {
    v.push({ x: 2, y: 3 + lean, z: 4 + lift, c: C.tag }); // buckle
    v.push({ x: 4, y: 3 + lean, z: 4 + lift, c: BODY_COLORS.toolRust, mat: MATERIALS.rust });
  }

  // Layered jacket (z5-8): deep hem, plum body, deep collar; chest tag on
  // the front, small salvage pack on the back.
  v.push(...cbox(1, lean, 5 + lift, 4, 3, 1, C.jacketPlumDeep));
  v.push(...cbox(1, lean, 6 + lift, 4, 3, 2, C.jacketPlum));
  v.push(...cbox(1, lean, 8 + lift, 4, 3, 1, C.jacketPlumDeep));
  if (!back) {
    v.push({ x: 3, y: 2 + lean, z: 7 + lift, c: C.tag });
  } else {
    v.push(...cbox(2, 2 + lean, 5 + lift, 2, 1, 2, BODY_COLORS.toolRust, MATERIALS.rust));
  }

  // Arms: sleeves with VISIBLE skin hands; counter-swing while walking.
  const raisedRight = posed; // gather/brawl: right arm up and forward
  const raisedLeft = b.pose === 'brawl';
  const arm = (x0: number, raised: boolean, swing: number) => {
    if (raised) {
      v.push(...cbox(x0, lean, 6 + lift, 1, 2, 2, BODY_COLORS.sleeve));
      v.push({ x: x0, y: lean + 2 * fwd, z: 7 + lift, c: C.skin, mat: skinMat });
    } else {
      v.push(...cbox(x0, lean + swing, 5 + lift, 1, 2, 3, BODY_COLORS.sleeve));
      v.push({ x: x0, y: lean + swing, z: 4 + lift, c: C.skin, mat: skinMat });
    }
    v.push(...cbox(x0, lean, 8 + lift, 1, 2, 1, C.jacketPlumDeep)); // shoulder
  };
  arm(0, raisedLeft, walking ? -stride * fwd : 0);
  arm(5, raisedRight, walking ? stride * fwd : 0);

  // Tool past the raised right hand (gather poses only).
  if (posed && b.pose !== 'brawl') {
    const handX = 5;
    const handY = lean + 2 * fwd;
    for (const [dx, dyF, dz, c] of TOOL_CELLS[b.pose as Exclude<SparkPoseId, 'brawl'>]) {
      v.push({ x: handX + dx, y: handY + dyF * fwd, z: 7 + lift + dz, c });
    }
  }

  // Starter scarf (JACKET-slot cosmetic): a rose wrap proud of the collar
  // with a trailing tail down the chest (front) / back (back view).
  if (b.scarf === true) {
    v.push(...cbox(0, lean - 1, 8 + lift, 6, 5, 1, BODY_COLORS.scarf, cloth));
    const tailY = lean + (back ? -1 : 3);
    v.push({ x: back ? 1 : 0, y: tailY, z: 7 + lift, c: BODY_COLORS.scarfDeep, mat: cloth });
    v.push({ x: back ? 1 : 0, y: tailY, z: 6 + lift, c: BODY_COLORS.scarf, mat: cloth });
  }

  // The oversized head (z9-13): skin block, face on the lit +y side.
  v.push(...cbox(0, lean - 1, 9 + lift, 6, 4, 5, C.skin, skinMat));
  if (!back) {
    // Mouth low on the face, under the lens gap.
    v.push({ x: 2, y: lean + 3, z: 9 + lift, c: shade(C.skin, -0.45) });
    v.push({ x: 3, y: lean + 3, z: 9 + lift, c: shade(C.skin, -0.45) });
    // Two big teal lenses proud of the face.
    v.push(...cbox(0, lean + 3, 10 + lift, 2, 1, 2, C.lens));
    v.push(...cbox(4, lean + 3, 10 + lift, 2, 1, 2, C.lens));
  }
  // Goggle band: proud wrap at the crown — visible from every direction.
  v.push(...cbox(-1, lean - 2, 12 + lift, 8, 6, 2, C.band));

  // The rose mop: flush with the proud band (already a voxel out from the
  // head), jagged, domed — never wider than the shoulders read.
  mopLayer(v, -1, lean - 2, 14 + lift, 8, 6, 2, 1, true);
  mopLayer(v, 0, lean - 1, 16 + lift, 6, 4, 1, 1, true);
  if (back) {
    // The mop hangs lower at the back of the head.
    mopLayer(v, 0, lean + 2, 10 + lift, 6, 1, 4, 0, true);
  }
  return v;
}

const SPARK_DIRS = ['se', 'sw', 'ne', 'nw'] as const;
export type SparkDir = (typeof SPARK_DIRS)[number];

/** view + transpose per direction (see the header comment). */
function dirVoxels(dir: SparkDir, build: Omit<SparkBuild, 'view'>): Voxel[] {
  const view: SparkBuild['view'] = dir === 'sw' || dir === 'se' ? 'front' : 'back';
  const raw = sparkBodyModel({ ...build, view });
  return dir === 'se' || dir === 'nw' ? transpose(raw) : raw;
}

const SPARK_FRAMES: SparkFrame[] = ['idle', 'walkA', 'walkP', 'walkB'];
const SPARK_POSES: SparkPoseId[] = [
  'magclaw',
  'drillhammer',
  'skimnet',
  'tuner',
  'riveter',
  'brawl',
];

/** Bake the identity-block character models (call from BootScene). */
export function bakeSparkModels(scene: Phaser.Scene): void {
  bakeVoxelModel(scene, {
    name: 'spark-mascot-bust',
    voxels: mascotBustModel(),
    warmRim: true,
    shadow: false,
    grounding: false,
  });
  for (const dir of SPARK_DIRS) {
    for (const frame of SPARK_FRAMES) {
      const frameSuffix = frame === 'idle' ? '' : `-${frame}`;
      for (const scarf of [false, true]) {
        bakeVoxelModel(scene, {
          name: `spark-${dir}${frameSuffix}${scarf ? '-starterScarf' : ''}`,
          voxels: dirVoxels(dir, { frame, scarf }),
          warmRim: true,
          shadow: false,
        });
      }
    }
    for (const pose of SPARK_POSES) {
      bakeVoxelModel(scene, {
        name: `spark-${dir}-pose-${pose}`,
        voxels: dirVoxels(dir, { frame: 'idle', pose }),
        warmRim: true,
        shadow: false,
      });
    }
  }
}
