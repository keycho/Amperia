import type Phaser from 'phaser';
import { decodeEquipped, encodeEquipped, type EquippedMap } from '@shared/cosmetics';
import {
  type Appearance,
  decodeAppearance,
  DEFAULT_APPEARANCE,
  DEFAULT_APPEARANCE_CODE,
  HAIR_COLORS,
  HAIR_STYLES,
  JACKET_COLORS,
  SKIN_TONES,
} from '@shared/appearance';
import { blendInt, MATERIAL_INT, mixPalette, PALETTE_INT } from '@shared/palette';
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
  | 'brawl'
  /** City-life L3 idle loops (persistent, server-replicated). */
  | 'sit'
  | 'lean'
  | 'warm';

/** The gather poses that carry a tool past the raised hand. */
export type GatherPoseId = Exclude<SparkPoseId, 'brawl' | 'sit' | 'lean' | 'warm'>;

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

/** Appearance indices resolved to concrete colors (single derivation spot). */
interface SparkTints {
  skin: number;
  hairMain: number;
  hairDeep: number;
  hairLight: number;
  jacket: number;
  jacketDeep: number;
  sleeve: number;
}

function resolveTints(a: Appearance): SparkTints {
  const hairMain = HAIR_COLORS[a.hairColor] ?? (HAIR_COLORS[0] as number);
  const jacket = JACKET_COLORS[a.jacket] ?? (JACKET_COLORS[0] as number);
  return {
    skin: SKIN_TONES[a.skin] ?? (SKIN_TONES[0] as number),
    hairMain,
    hairDeep: blendInt(hairMain, PALETTE_INT.ink, 0.4),
    hairLight: shade(hairMain, 0.22),
    jacket,
    jacketDeep: blendInt(jacket, PALETTE_INT.ink, 0.32),
    sleeve: blendInt(jacket, PALETTE_INT.ink, 0.18),
  };
}

/** Rectangular hair layer with corner cuts + jagged edges (mop language). */
function hairSlab(
  v: Voxel[],
  t: SparkTints,
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
        const c = streak < 0.16 ? t.hairLight : streak > 0.85 ? t.hairDeep : t.hairMain;
        v.push({ x: x0 + dx, y: y0 + dy, z: z0 + dz, c, mat: cloth });
      }
    }
  }
}

/**
 * Hair styles (creator option). Every style sits on/over the goggle band
 * (z12-13) — the band is Spark brand language and never disappears.
 * Coordinates are FRONT-view; the back-view lean sign is already applied.
 */
function buildHair(
  v: Voxel[],
  t: SparkTints,
  styleIdx: number,
  lean: number,
  lift: number,
  back: boolean,
  headWear?: string,
): void {
  const z = 14 + lift;
  if (headWear === 'alleyBeanie') {
    // The Alley Beanie replaces the hair: ochre knit dome, ember brim,
    // amber bobble — reads across the plaza as a warm knit silhouette.
    const knit = MATERIAL_INT.paintOchre;
    const knitDeep = blendInt(knit, PALETTE_INT.ink, 0.28);
    const brim = blendInt(PALETTE_INT.emberOrange, PALETTE_INT.structureMid, 0.3);
    for (let dx = 0; dx < 8; dx++) {
      for (let dy = 0; dy < 6; dy++) {
        if (Math.min(dx, 7 - dx) + Math.min(dy, 5 - dy) < 1) continue;
        v.push({ x: -1 + dx, y: lean - 2 + dy, z, c: brim, mat: cloth });
        const rib = voxelHash(dx, dy, 61) < 0.4;
        v.push({ x: -1 + dx, y: lean - 2 + dy, z: z + 1, c: rib ? knitDeep : knit, mat: cloth });
      }
    }
    for (let dx = 0; dx < 6; dx++) {
      for (let dy = 0; dy < 4; dy++) {
        if (Math.min(dx, 5 - dx) + Math.min(dy, 3 - dy) < 1) continue;
        const rib = voxelHash(dx, dy, 63) < 0.4;
        v.push({ x: dx, y: lean - 1 + dy, z: z + 2, c: rib ? knitDeep : knit, mat: cloth });
      }
    }
    v.push({ x: 2, y: lean, z: z + 3, c: PALETTE_INT.neonAmber }); // bobble
    v.push({ x: 3, y: lean + 1, z: z + 3, c: PALETTE_INT.neonAmber });
    return;
  }
  const style = HAIR_STYLES[styleIdx]?.id ?? 'mop';
  switch (style) {
    case 'spikes': {
      // EBT5: a low cap that BREAKS into tall spikes with clear gaps — a
      // serrated crown head-on, unmistakable against the round mop.
      hairSlab(v, t, -1, lean - 2, z, 8, 5, 1, 1, false);
      // Tall peaks at alternating columns; the empty columns between them
      // are the gaps that make the top silhouette jagged.
      const cols = [0, 2, 4, 6] as const; // gaps at x-columns 1,3,5
      cols.forEach((cx, i) => {
        const h = i % 2 === 0 ? 4 : 3;
        for (let dz = 1; dz <= h; dz++) {
          const c = dz >= h - 1 ? t.hairLight : t.hairMain;
          // Two rows deep so each spike has a lit front face, not a sliver.
          v.push({ x: -1 + cx, y: lean, z: z + dz, c, mat: cloth });
          v.push({ x: -1 + cx, y: lean + 2, z: z + dz, c, mat: cloth });
        }
      });
      break;
    }
    case 'buns': {
      hairSlab(v, t, -1, lean - 2, z, 8, 6, 1, 1, true);
      const bunY = back ? lean + 2 : lean - 2;
      for (const bx of [-1, 5] as const) {
        v.push(...cbox(bx, bunY, z + 1, 2, 2, 2, t.hairMain, cloth));
        v.push({ x: bx, y: bunY, z: z + 3, c: t.hairDeep, mat: cloth });
      }
      break;
    }
    case 'crest': {
      hairSlab(v, t, -1, lean - 2, z, 8, 6, 1, 1, false);
      for (let dy = 0; dy < 6; dy++) {
        const h = dy < 2 ? 2 : dy < 4 ? 3 : 2;
        for (let dz = 1; dz <= h; dz++) {
          const c = dz === h ? t.hairLight : t.hairMain;
          v.push({ x: 2, y: lean - 2 + dy, z: z + dz, c, mat: cloth });
          v.push({ x: 3, y: lean - 2 + dy, z: z + dz, c, mat: cloth });
        }
      }
      break;
    }
    case 'bowl': {
      hairSlab(v, t, -1, lean - 2, z, 8, 6, 2, 0, false);
      // Fringe hanging over the brow (front only — the back drops lower).
      const fringeY = back ? lean + 3 : lean - 2;
      for (let dx = 0; dx < 8; dx++) {
        if (voxelHash(dx, 7, z, 57) < 0.3) continue;
        v.push({ x: -1 + dx, y: fringeY, z: z - 1, c: t.hairDeep, mat: cloth });
      }
      break;
    }
    case 'tail': {
      hairSlab(v, t, -1, lean - 2, z, 8, 6, 1, 1, true);
      // Cable tail down the back of the head.
      const tailY = back ? lean + 3 : lean - 2;
      v.push(...cbox(2, tailY, 8 + lift, 2, 1, 6, t.hairMain, cloth));
      v.push({ x: 2, y: tailY, z: 7 + lift, c: t.hairDeep, mat: cloth });
      v.push({ x: 3, y: tailY, z: 7 + lift, c: t.hairDeep, mat: cloth });
      break;
    }
    case 'undercut': {
      // Shaved sides (skin shows), a proud slab on top leaning forward.
      hairSlab(v, t, 0, lean - 1, z, 6, 4, 1, 1, false);
      for (let dy = 0; dy < 4; dy++) {
        v.push({ x: 2, y: lean - 1 + dy, z: z + 2, c: t.hairLight, mat: cloth });
        v.push({ x: 3, y: lean - 1 + dy, z: z + 2, c: t.hairMain, mat: cloth });
      }
      break;
    }
    case 'braid': {
      hairSlab(v, t, -1, lean - 2, z, 8, 6, 1, 1, true);
      if (back) {
        // Down the back to the belt.
        for (let dz = 0; dz < 10; dz++) {
          const c = dz % 2 === 0 ? t.hairMain : t.hairDeep;
          v.push({ x: 2 + (dz % 2), y: lean + 3, z: 13 + lift - dz, c, mat: cloth });
        }
        v.push({ x: 2, y: lean + 3, z: 3 + lift, c: t.hairLight, mat: cloth });
      } else {
        // EBT5: FRONT view — the braid drapes OVER THE SHOULDER toward the
        // viewer, a clear over-shoulder tail in the silhouette (not a plain
        // crown like the mop). Falls down the right-front from crown to belt.
        const by = lean + 3; // lit front face, toward the camera
        for (let dz = 0; dz < 10; dz++) {
          const c = dz % 2 === 0 ? t.hairMain : t.hairDeep;
          const bx = dz < 3 ? 5 : 4; // tucks in a touch below the shoulder
          v.push({ x: bx, y: by, z: 12 + lift - dz, c, mat: cloth });
        }
        v.push({ x: 4, y: by, z: 2 + lift, c: t.hairLight, mat: cloth }); // tie
      }
      break;
    }
    case 'slick': {
      // Combed flat and back — low dome, a bright combline, no spill.
      hairSlab(v, t, -1, lean - 2, z, 8, 6, 1, 0, true);
      for (let dy = 0; dy < 5; dy++) {
        v.push({ x: 1, y: lean - 2 + dy, z: z + 1, c: t.hairLight, mat: cloth });
        v.push({ x: 4, y: lean - 2 + dy, z: z + 1, c: t.hairDeep, mat: cloth });
      }
      break;
    }
    case 'frizz': {
      // A storm cloud: wide, tall, ragged at every edge.
      hairSlab(v, t, -2, lean - 3, z, 10, 8, 2, 1, true);
      for (let dx = 0; dx < 10; dx++) {
        for (let dy = 0; dy < 8; dy++) {
          if (voxelHash(dx, dy, 91) < 0.3) {
            v.push({ x: -2 + dx, y: lean - 3 + dy, z: z + 2, c: t.hairMain, mat: cloth });
          }
          if (voxelHash(dx, dy, 93) < 0.14) {
            v.push({ x: -2 + dx, y: lean - 3 + dy, z: z + 3, c: t.hairLight, mat: cloth });
          }
        }
      }
      break;
    }
    default: {
      // THE MASCOT MOP (R4-REVISED): a big SOLID rounded dome that overhangs
      // the band on every side — one silhouette mass, not a jagged scatter.
      // Stacked shrinking layers read as the bust's rose mushroom; streaks
      // are colour-only (never holes) so the ink contour wraps one shape.
      hairSlab(v, t, -2, lean - 2, z, 10, 7, 2, 2, false); // wide brim
      hairSlab(v, t, -1, lean - 1, z + 2, 8, 5, 2, 2, false);
      hairSlab(v, t, 0, lean, z + 4, 6, 4, 1, 1, false);
      hairSlab(v, t, 1, lean + 1, z + 5, 4, 2, 1, 1, false); // crown
      // A couple of chunky front tufts breaking the brow line (front only).
      if (!back) {
        v.push({ x: 0, y: lean + 4, z: z - 1, c: t.hairDeep, mat: cloth });
        v.push({ x: 5, y: lean + 4, z: z - 1, c: t.hairDeep, mat: cloth });
      }
      if (back) hairSlab(v, t, 0, lean + 3, 13 + lift, 6, 1, 4, 0, false); // nape
      break;
    }
  }
}

/** Brassbound tool-skin body color (cosmetic, zero stats — §10.2 TOOL). */
const BRASS = blendInt(PALETTE_INT.neonAmber, MATERIAL_INT.paintOchre, 0.55);

/** Tool minis for the gather poses, as offsets past the raised hand.
 *  [dx, dyForward, dz, color] — dyForward is mapped through the view.
 *  The brass skin swaps the BODY metals; neon working tips stay. */
function toolCells(
  pose: GatherPoseId,
  brass: boolean,
): Array<[number, number, number, number]> {
  const rust = brass ? BRASS : BODY_COLORS.toolRust;
  const metal = brass ? BRASS : BODY_COLORS.toolMetal;
  const wood = BODY_COLORS.toolWood;
  const cells: Record<GatherPoseId, Array<[number, number, number, number]>> = {
    magclaw: [
      [0, 1, 0, rust],
      [-1, 2, 0, PALETTE_INT.neonTeal],
      [1, 2, 0, PALETTE_INT.neonTeal],
    ],
    drillhammer: [
      [0, 1, 0, wood],
      [-1, 2, 0, metal],
      [0, 2, 0, metal],
      [1, 2, 0, metal],
      [0, 2, 1, metal],
    ],
    skimnet: [
      [0, 1, 0, wood],
      [-1, 2, 0, PALETTE_INT.neonTeal],
      [1, 2, 0, PALETTE_INT.neonTeal],
      [-1, 3, 0, PALETTE_INT.neonTeal],
      [1, 3, 0, PALETTE_INT.neonTeal],
      [0, 3, 0, PALETTE_INT.neonTeal],
    ],
    tuner: [
      [0, 1, 0, metal],
      [0, 2, 0, PALETTE_INT.neonCyan],
      [0, 1, 1, metal],
    ],
    riveter: [
      [0, 1, 0, rust],
      [0, 2, 0, rust],
      [0, 3, 0, PALETTE_INT.neonAmber],
    ],
  };
  return cells[pose];
}

interface SparkBuild {
  view: 'front' | 'back';
  frame: SparkFrame;
  appearance: Appearance;
  pose?: SparkPoseId;
  /** Worn wardrobe cosmetics (visual slots: head/back/jacket/tool). */
  equipped?: EquippedMap;
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
  const t = resolveTints(b.appearance);
  const eq = b.equipped ?? {};
  const back = b.view === 'back';
  const fwd = back ? -1 : 1;
  const posed = b.pose !== undefined;
  const walking = !posed && b.frame !== 'idle';
  // City-life L3: the idle loops — sit folds the legs and drops the whole
  // torso two voxels (everything above the boots rides `lift`), lean tips
  // the body a second voxel with an ankle crossed, warm raises both palms.
  const idleSit = b.pose === 'sit';
  const idleLean = b.pose === 'lean';
  const idleWarm = b.pose === 'warm';
  const idlePose = idleSit || idleLean || idleWarm;
  // Stride: left leg forward on A, right on B; legs together on P/idle.
  const stride = b.frame === 'walkA' ? 1 : b.frame === 'walkB' ? -1 : 0;
  // Sit drops the torso HARD (-3) and hunches it forward (+2) — under the
  // oversized head a subtle fold reads as standing; lean slouches one (-1)
  // with a three-voxel tip into the wall.
  const lift = !posed && b.frame === 'walkP' ? 1 : idleSit ? -3 : idleLean ? -1 : 0;
  const lean = idleSit ? 2 * fwd : (walking ? 1 : posed ? 1 : 0) * fwd * (idleLean ? 3 : 1);

  // Legs (boots z0-1, trousers z2-3): two 2×3 columns.
  const leg = (x0: number, dy: number) => {
    v.push(...cbox(x0, dy, 0, 2, 3, 2, BODY_COLORS.boots, MATERIALS.gunmetal));
    v.push(...cbox(x0, dy, 2, 2, 3, 2, BODY_COLORS.trousers));
  };
  if (idleSit) {
    // Folded: knees THRUST forward past the hunched torso, boots ahead —
    // the read must survive the mascot head at street zoom.
    v.push(...cbox(1, 2 * fwd, 0, 4, 3, 2, BODY_COLORS.trousers));
    v.push(...cbox(1, 5 * fwd, 0, 4, 2, 1, BODY_COLORS.boots, MATERIALS.gunmetal));
  } else if (idleLean) {
    leg(1, 0);
    leg(3, 1 * fwd); // crossed ankle
  } else {
    leg(1, walking ? stride * fwd : 0);
    leg(3, walking ? -stride * fwd : 0);
  }

  // Tool-belt (z4): dark strap, amber buckle on the front, rust hip pouch.
  v.push(...cbox(1, lean, 4 + lift, 4, 3, 1, C.band, MATERIALS.gunmetal));
  if (!back) {
    v.push({ x: 2, y: 3 + lean, z: 4 + lift, c: C.tag }); // buckle
    v.push({ x: 4, y: 3 + lean, z: 4 + lift, c: BODY_COLORS.toolRust, mat: MATERIALS.rust });
  }

  // Layered jacket (z5-8): deep hem, plum body, deep collar; chest tag on
  // the front, small salvage pack on the back.
  v.push(...cbox(1, lean, 5 + lift, 4, 3, 1, t.jacketDeep));
  v.push(...cbox(1, lean, 6 + lift, 4, 3, 2, t.jacket));
  v.push(...cbox(1, lean, 8 + lift, 4, 3, 1, t.jacketDeep));
  if (!back) {
    v.push({ x: 3, y: 2 + lean, z: 7 + lift, c: C.tag });
    if (eq.back === 'salvagerSatchel') {
      // Shoulder strap reads the satchel from the front too.
      v.push({ x: 2, y: 2 + lean, z: 8 + lift, c: t.jacketDeep });
    } else if (eq.back === 'filamentWings') {
      // Wing tips poke past the shoulders so the wings read from the front.
      v.push({ x: -2, y: lean - 2, z: 10 + lift, c: PALETTE_INT.neonCyan });
      v.push({ x: 7, y: lean - 2, z: 10 + lift, c: PALETTE_INT.neonCyan });
    } else if (eq.back === 'duskBloomMantle' || eq.back === 'emberdriftCape') {
      // A petal collar rides the shoulders in front too.
      const collar =
        eq.back === 'duskBloomMantle' ? PALETTE_INT.violetNeon : PALETTE_INT.emberOrange;
      v.push(...cbox(0, lean - 1, 8 + lift, 6, 1, 1, collar, cloth));
    }
  } else if (eq.back === 'salvagerSatchel') {
    // The Salvager Satchel: a proper wood-ribbed bag with an amber clasp.
    v.push(...cbox(1, 2 + lean, 4 + lift, 4, 1, 3, BODY_COLORS.toolRust, MATERIALS.rust));
    v.push(...cbox(1, 2 + lean, 7 + lift, 4, 1, 1, BODY_COLORS.toolWood, MATERIALS.wood));
    v.push({ x: 2, y: 2 + lean, z: 5 + lift, c: C.tag });
  } else if (eq.back === 'circuitBanner') {
    // The Circuit Banner (weekly regalia): mast + teal pennant overhead.
    v.push(...cbox(3, 2 + lean, 5 + lift, 1, 1, 9, BODY_COLORS.toolMetal, MATERIALS.gunmetal));
    v.push(...cbox(2, 2 + lean, 11 + lift, 1, 1, 3, PALETTE_INT.neonTeal));
    v.push({ x: 1, y: 2 + lean, z: 13 + lift, c: PALETTE_INT.neonTeal });
    v.push({ x: 2, y: 2 + lean, z: 10 + lift, c: PALETTE_INT.neonCyan });
    v.push({ x: 3, y: 2 + lean, z: 14 + lift, c: PALETTE_INT.neonAmber }); // finial
  } else if (eq.back === 'filamentWings') {
    // FOUNDRY (Arc): two arcs of live filament sweeping UP and OUT from the
    // shoulders to lit tips above the head — cyan strands, amber sparks.
    const strand = PALETTE_INT.neonCyan;
    const spark = PALETTE_INT.neonAmber;
    for (const [sx, dir] of [[1, -1], [4, 1]] as const) {
      // Sweep up and OUT from the shoulder to a lit tip above the head.
      for (let i = 0; i < 11; i++) {
        const c = i % 3 === 2 ? spark : strand;
        const spread = Math.min(i, 5);
        v.push({ x: sx + dir * spread, y: 2 + lean, z: 6 + lift + i, c });
        // A second strand gives the wing body, not just an edge.
        if (i > 1 && i < 9) {
          v.push({ x: sx + dir * Math.max(0, spread - 1), y: 2 + lean, z: 6 + lift + i, c: strand });
        }
      }
      v.push({ x: sx + dir * 5, y: 2 + lean, z: 17 + lift, c: spark }); // wing tip
    }
  } else if (eq.back === 'duskBloomMantle' || eq.back === 'emberdriftCape') {
    // FOUNDRY (Arc, seasonal / vaulted): a mantle of petals draping the back.
    const dusk = eq.back === 'duskBloomMantle';
    const petal = dusk ? PALETTE_INT.violetNeon : PALETTE_INT.emberOrange;
    const petalDeep = dusk
      ? blendInt(PALETTE_INT.violetNeon, PALETTE_INT.ink, 0.4)
      : blendInt(PALETTE_INT.emberOrange, PALETTE_INT.ink, 0.4);
    v.push(...cbox(0, 2 + lean, 8 + lift, 6, 1, 1, petal, cloth)); // shoulder line
    for (let z = 2; z <= 7; z++) {
      const c = z % 2 === 0 ? petal : petalDeep;
      const w = z <= 3 ? 6 : 4; // flares wider toward the hem
      v.push(...cbox(z <= 3 ? 0 : 1, 2 + lean, z + lift, w, 1, 1, c, cloth));
    }
  } else {
    v.push(...cbox(2, 2 + lean, 5 + lift, 2, 1, 2, BODY_COLORS.toolRust, MATERIALS.rust));
  }

  // Arms: sleeves with VISIBLE skin hands; counter-swing while walking.
  const raisedRight = posed && !idleSit && !idleLean; // gather/brawl/warm
  const raisedLeft = b.pose === 'brawl' || idleWarm;
  const arm = (x0: number, raised: boolean, swing: number) => {
    if (raised) {
      v.push(...cbox(x0, lean, 6 + lift, 1, 2, 2, t.sleeve));
      v.push({ x: x0, y: lean + 2 * fwd, z: 7 + lift, c: t.skin, mat: skinMat });
    } else {
      v.push(...cbox(x0, lean + swing, 5 + lift, 1, 2, 3, t.sleeve));
      v.push({ x: x0, y: lean + swing, z: 4 + lift, c: t.skin, mat: skinMat });
    }
    v.push(...cbox(x0, lean, 8 + lift, 1, 2, 1, t.jacketDeep)); // shoulder
  };
  arm(0, raisedLeft, walking ? -stride * fwd : 0);
  arm(5, raisedRight, walking ? stride * fwd : 0);

  // The coilroll (lean loop): a paper twist with a live amperite tip at
  // the lowered left hand — stylized, in-world, nothing else.
  if (idleLean && !back) {
    v.push({ x: 0, y: lean + 1, z: 4 + lift, c: BODY_COLORS.toolWood, mat: MATERIALS.wood });
    v.push({ x: 0, y: lean + 2, z: 4 + lift, c: PALETTE_INT.emberOrange });
  }

  // Tool past the raised right hand (gather poses only).
  if (posed && b.pose !== 'brawl' && !idlePose) {
    const handX = 5;
    const handY = lean + 2 * fwd;
    const cells = toolCells(
      b.pose as GatherPoseId,
      eq.tool === 'brassToolSkin',
    );
    for (const [dx, dyF, dz, c] of cells) {
      v.push({ x: handX + dx, y: handY + dyF * fwd, z: 7 + lift + dz, c });
    }
  }

  // Starter scarf (JACKET slot): a rose wrap proud of the collar with a
  // trailing tail down the chest (front) / back (back view).
  if (eq.jacket === 'starterScarf') {
    v.push(...cbox(0, lean - 1, 8 + lift, 6, 5, 1, BODY_COLORS.scarf, cloth));
    const tailY = lean + (back ? -1 : 3);
    v.push({ x: back ? 1 : 0, y: tailY, z: 7 + lift, c: BODY_COLORS.scarfDeep, mat: cloth });
    v.push({ x: back ? 1 : 0, y: tailY, z: 6 + lift, c: BODY_COLORS.scarf, mat: cloth });
  } else if (eq.jacket === 'nightmarketCoat') {
    // FOUNDRY (Ember): a longer plum-violet coat over the jacket with warm
    // neon piping and an amber button — Nightstalls after-hours cut.
    const coat = blendInt(PALETTE_INT.violetNeon, PALETTE_INT.structureMid, 0.35);
    const coatDeep = blendInt(coat, PALETTE_INT.ink, 0.4);
    v.push(...cbox(1, lean, 5 + lift, 4, 3, 4, coatDeep, cloth)); // coat body
    v.push(...cbox(1, lean, 4 + lift, 4, 3, 1, coat, cloth)); // low hem
    if (!back) {
      v.push(...cbox(2, lean + 2, 5 + lift, 2, 1, 4, coat, cloth)); // front placket
      v.push({ x: 2, y: lean + 2, z: 7 + lift, c: PALETTE_INT.neonAmber }); // button
      v.push({ x: 3, y: lean + 2, z: 5 + lift, c: PALETTE_INT.neonAmber }); // button
    }
  }

  // THE OVERSIZED HEAD (R4-REVISED — "the bust is the Spark"): a big skin
  // block that runs WIDER than the shoulders so the head reads as ~half the
  // silhouette, exactly like the mascot bust. Face on the lit +y side.
  v.push(...cbox(-1, lean - 1, 9 + lift, 8, 5, 5, t.skin, skinMat));
  if (!back) {
    // Mouth: a wide dark dip low on the proud face plane.
    for (const mx of [3, 4] as const) {
      v.push({ x: mx, y: lean + 4, z: 9 + lift, c: shade(t.skin, -0.45) });
    }
    // Two big teal lenses (3×3 — no feature under 3 voxels), proud of the
    // face under the band, with a black nose-bridge gap between them.
    v.push(...cbox(-1, lean + 4, 10 + lift, 3, 1, 3, C.lens));
    v.push(...cbox(4, lean + 4, 10 + lift, 3, 1, 3, C.lens));
    v.push(...cbox(2, lean + 4, 10 + lift, 2, 1, 3, C.band));
  }
  // Goggle band: a PROUD wrap that comes down over the brow (one voxel out
  // all round), 10 wide — the signature black strip under the mop, low like
  // the bust so only the lenses + jaw show beneath the hair.
  v.push(...cbox(-2, lean - 2, 13 + lift, 10, 7, 1, C.band));

  // Hair per the chosen style, in the chosen color (the beanie covers it).
  buildHair(v, t, b.appearance.hair, lean, lift, back, eq.head);

  // THE BULB HAT (final Dispatcher-chain reward): screw base sunk into the
  // hair, warm glass above — the emissive glow attaches at placement.
  if (eq.head === 'bulbHat') {
    const zh = 17 + lift;
    v.push(...cbox(2, lean, zh, 2, 2, 2, SPARK_COLORS.screw, MATERIALS.gunmetal));
    for (let dx = 0; dx < 4; dx++) {
      for (let dy = 0; dy < 4; dy++) {
        for (let dz = 0; dz < 4; dz++) {
          const corner =
            (dx === 0 || dx === 3) && (dy === 0 || dy === 3) && (dz === 0 || dz === 3);
          if (corner) continue;
          const inner = dx > 0 && dx < 3 && dy > 0 && dy < 3 && dz < 3;
          v.push({
            x: 1 + dx,
            y: lean - 1 + dy,
            z: zh + 2 + dz,
            c: inner ? shade(SPARK_COLORS.bulbGlass, 0.35) : SPARK_COLORS.bulbGlass,
          });
        }
      }
    }
  }

  // FOUNDRY head crowns (Aurora): a ring of tall neon prongs proud of the
  // brow with a floating gem — auroraCrown runs violet/cyan cold, the vaulted
  // firstLightCrown runs amber/warm. Pure regalia, sits over the mop.
  if (eq.head === 'auroraCrown' || eq.head === 'firstLightCrown') {
    const aurora = eq.head === 'auroraCrown';
    const main = aurora ? PALETTE_INT.violetNeon : PALETTE_INT.neonAmber;
    const accent = aurora ? PALETTE_INT.neonCyan : PALETTE_INT.warmGlow;
    const zc = 13 + lift;
    // A prong ring across the whole brow, alternating heights (tips=accent),
    // tallest at centre — a clear regal crown from the front.
    const prongs: ReadonlyArray<readonly [number, number]> = [
      [-2, 4],
      [-1, 5],
      [1, 6],
      [3, 7],
      [5, 6],
      [6, 5],
      [7, 4],
    ];
    for (const [px, h] of prongs) {
      for (let i = 0; i < h; i++) {
        v.push({ x: px, y: lean + 4, z: zc + i, c: i >= h - 2 ? accent : main });
      }
    }
    // A floating gem above centre.
    for (const [gx, gz] of [[2, 8], [3, 8], [2, 9], [3, 9]] as const) {
      v.push({ x: gx, y: lean + 4, z: zc + gz, c: gz === 8 ? accent : main });
    }
  }

  // Accessory flair (front views only — all tiny, all presentation).
  if (!back) {
    const acc = b.appearance.accessory;
    if (acc === 1) {
      v.push({ x: 4, y: lean + 3, z: 12 + lift, c: C.tag }); // amber stud on the band
    } else if (acc === 2) {
      v.push({ x: 1, y: lean + 2, z: 7 + lift, c: BODY_COLORS.toolMetal }); // antenna pin
      v.push({ x: 1, y: lean + 2, z: 8 + lift, c: PALETTE_INT.neonCyan });
    } else if (acc === 3) {
      v.push({ x: 1, y: lean + 2, z: 6 + lift, c: MATERIAL_INT.paintTeal }); // teal patch
      v.push({ x: 2, y: lean + 2, z: 6 + lift, c: MATERIAL_INT.paintTeal });
    } else if (acc === 4) {
      // Ear cuff: two brass glints stacked on the ear line.
      v.push({ x: 6, y: lean + 2, z: 11 + lift, c: PALETTE_INT.neonAmber });
      v.push({ x: 6, y: lean + 2, z: 10 + lift, c: BODY_COLORS.toolMetal });
    } else if (acc === 5) {
      // Cheek smudge: a working day's grease, off-center.
      v.push({ x: 5, y: lean + 2, z: 9 + lift, c: blendInt(PALETTE_INT.ink, MATERIAL_INT.skin, 0.35) });
      v.push({ x: 5, y: lean + 2, z: 8 + lift, c: blendInt(PALETTE_INT.ink, MATERIAL_INT.skin, 0.5) });
    } else if (acc === 6) {
      // Brow scar: a pale notch through the brow line.
      v.push({ x: 2, y: lean + 2, z: 12 + lift, c: blendInt(MATERIAL_INT.skin, PALETTE_INT.warmGlow, 0.75) });
      v.push({ x: 2, y: lean + 2, z: 11 + lift, c: blendInt(MATERIAL_INT.skin, PALETTE_INT.warmGlow, 0.6) });
    }
  }
  return v;
}

const SPARK_DIRS = ['se', 'sw', 'ne', 'nw'] as const;
export type SparkDir = (typeof SPARK_DIRS)[number];

/**
 * Shared animation anchor (R4b): the ground centre under the Spark's feet
 * (legs span x1-4 → centre 2.5, rest depth y≈1). Fixed for every frame/pose
 * so the walk cycle and tool poses never jitter — the anchor no longer
 * chases each frame's changing bounding box. Transposed dirs swap x/y.
 */
const SPARK_ANCHOR = { x: 2.5, y: 1 };
function dirAnchor(dir: SparkDir): { x: number; y: number } {
  return dir === 'se' || dir === 'nw'
    ? { x: SPARK_ANCHOR.y, y: SPARK_ANCHOR.x }
    : SPARK_ANCHOR;
}

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
  'brawl', 'sit', 'lean', 'warm'];

/** Visual-slot part of an equipped map, as a stable texture-key chunk. */
export function equipKey(eq: EquippedMap): string {
  const visual = encodeEquipped({
    head: eq.head,
    back: eq.back,
    jacket: eq.jacket,
    tool: eq.tool,
  });
  return visual === '' ? 'none' : visual;
}

/**
 * Bake one (appearance, worn-cosmetics) combination's full sprite set.
 * Names: `spark@<code>#<equipKey>-<dir>[-frame|-pose-x]`. Idempotent per
 * name (bakeVoxelModel checks its registry), so re-baking a live combo is
 * free — combos only bake for Sparks actually wearing them.
 *
 * previewOnly bakes just the SW idle — the creator/wardrobe re-bakes on
 * every option click and only needs the pedestal view.
 */
export function bakeSparkAppearance(
  scene: Phaser.Scene,
  code: string,
  opts: { previewOnly?: boolean; equipped?: string } = {},
): void {
  const appearance = decodeAppearance(code) ?? DEFAULT_APPEARANCE;
  const equipped = decodeEquipped(opts.equipped ?? '');
  const key = `spark@${code}#${equipKey(equipped)}`;
  if (opts.previewOnly === true) {
    // U2a: the creator can rotate — bake all four idle facings.
    for (const dir of SPARK_DIRS) {
      bakeVoxelModel(scene, {
        name: `${key}-${dir}`,
        voxels: dirVoxels(dir, { frame: 'idle', appearance, equipped }),
        warmRim: true,
        shadow: false,
        anchor: dirAnchor(dir),
      });
    }
    return;
  }
  for (const dir of SPARK_DIRS) {
    for (const frame of SPARK_FRAMES) {
      const frameSuffix = frame === 'idle' ? '' : `-${frame}`;
      bakeVoxelModel(scene, {
        name: `${key}-${dir}${frameSuffix}`,
        voxels: dirVoxels(dir, { frame, appearance, equipped }),
        warmRim: true,
        shadow: false,
        anchor: dirAnchor(dir),
      });
    }
    for (const pose of SPARK_POSES) {
      bakeVoxelModel(scene, {
        name: `${key}-${dir}-pose-${pose}`,
        voxels: dirVoxels(dir, { frame: 'idle', pose, appearance, equipped }),
        warmRim: true,
        shadow: false,
        anchor: dirAnchor(dir),
      });
    }
  }
}

/** Bake the boot-time character set: the brand bust + the mascot default. */
export function bakeSparkModels(scene: Phaser.Scene): void {
  bakeVoxelModel(scene, {
    name: 'spark-mascot-bust',
    voxels: mascotBustModel(),
    warmRim: true,
    shadow: false,
    grounding: false,
  });
  bakeSparkAppearance(scene, DEFAULT_APPEARANCE_CODE);
}
