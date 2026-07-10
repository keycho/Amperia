import Phaser from 'phaser';
import { hexToInt, mixPalette, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { MATERIALS } from './materials';
import { bakeVoxelModel, box, mbox, shade, type Voxel } from './voxel';

/**
 * The core set: ground tile, crate, stall, planter, Spark. Built from real
 * MATERIALS (rust/gunmetal/wood/paint/concrete) — purple is not a material;
 * neon accents stay plain light voxels.
 */

function groundTileModel(): Voxel[] {
  return mbox(0, 0, 0, 8, 8, 1, MATERIALS.concrete);
}

function crateModel(): Voxel[] {
  // A rusted steel job crate: deep-rust corner posts, banded panels.
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 5, 5, 5, MATERIALS.rust)) {
    const isPost = (vox.x === 0 || vox.x === 4) && (vox.y === 0 || vox.y === 4);
    const isBand = (vox.z === 1 || vox.z === 3) && !isPost;
    if (isPost) v.push({ ...vox, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
    else if (isBand) v.push({ ...vox, c: shade(MATERIALS.rust.base, -0.14) });
    else v.push(vox);
  }
  // Routing tag — the one neon accent.
  v.push({ x: 4, y: 3, z: 4, c: PALETTE_INT.neonAmber });
  return v;
}

function planterModel(): Voxel[] {
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.3);
  const v: Voxel[] = [];
  // A wooden barrel with rusted hoop rings.
  for (const vox of mbox(0, 0, 0, 4, 4, 6, MATERIALS.wood)) {
    const hoop = vox.z === 2 || vox.z === 5;
    if (hoop) v.push({ ...vox, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
    else v.push(vox);
  }
  // Bush — irregular, two greens.
  const bush: Array<[number, number, number, number]> = [
    [0, 1, 6, leafB],
    [1, 0, 6, leafA],
    [1, 1, 6, leafA],
    [2, 1, 6, leafB],
    [1, 2, 6, leafA],
    [2, 2, 6, leafA],
    [3, 2, 6, leafB],
    [2, 3, 6, leafB],
    [1, 1, 7, leafA],
    [2, 1, 7, leafB],
    [1, 2, 7, leafB],
    [2, 2, 7, leafA],
    [2, 1, 8, leafA],
    [1, 2, 8, leafB],
  ];
  for (const [x, y, z, c] of bush) v.push({ x, y, z, c });
  return v;
}

function stallModel(variant: number): Voxel[] {
  // Awnings run VIVID (addendum c): the market's color lives here, so the
  // stripes barely lean grey — the face ramp supplies the shading.
  const stripeHot = [
    mixPalette('neonRose', 'structureMid', 0.1),
    mixPalette('neonAmber', 'structureMid', 0.08),
    mixPalette('neonTeal', 'structureMid', 0.16),
    mixPalette('neonRose', 'structureMid', 0.1),
  ][variant % 4] as number;
  const stripePale = mixPalette('warmGlow', 'groundAccent', 0.2);
  const v: Voxel[] = [];
  // Timber counter with a lighter worn top.
  v.push(...mbox(2, 1, 0, 8, 5, 7, MATERIALS.wood));
  for (const vox of mbox(2, 1, 7, 8, 5, 1, MATERIALS.wood)) {
    v.push({ ...vox, c: shade(MATERIALS.wood.base, 0.14) });
  }
  // Posts: deep timber.
  for (const [px, py] of [
    [1, 0],
    [10, 0],
    [1, 6],
    [10, 6],
  ] as const) {
    v.push(...mbox(px, py, 0, 1, 1, 20, MATERIALS.woodDeep));
  }
  // Awning: striped fabric slab with a front drip edge (fabric stays flat
  // and colorful — the market's color lives in awnings and signs).
  for (let x = 0; x < 12; x++) {
    for (let y = 0; y < 8; y++) {
      v.push({ x, y, z: 20, c: x % 2 === 0 ? stripeHot : stripePale });
    }
  }
  for (let x = 0; x < 12; x++) {
    v.push({ x, y: 7, z: 19, c: x % 2 === 0 ? stripeHot : stripePale });
    v.push({ x, y: 7, z: 18, c: x % 2 === 0 ? stripeHot : stripePale });
  }
  // Hanging sign (ink board, neon glyph) — §B9 signage variety: each stall
  // runs its own color and glyph shape along the lane.
  const signC = [
    PALETTE_INT.neonAmber,
    PALETTE_INT.neonRose,
    PALETTE_INT.neonCyan,
    hexToInt(UI_TEXT_WARM),
  ][variant % 4] as number;
  v.push(...box(4, 6, 13, 3, 1, 4, mixPalette('ink', 'structureMid', 0.25)));
  if (variant % 2 === 0) {
    v.push({ x: 5, y: 6, z: 15, c: signC });
    v.push({ x: 5, y: 6, z: 14, c: signC });
  } else {
    v.push({ x: 4, y: 6, z: 14, c: signC });
    v.push({ x: 5, y: 6, z: 15, c: signC });
    v.push({ x: 6, y: 6, z: 14, c: signC });
  }
  // Lantern voxel by the right post (glow sprite added at placement).
  v.push({ x: 10, y: 6, z: 14, c: PALETTE_INT.warmGlow });
  // Crates under the counter for life.
  v.push(...mbox(3, 6, 0, 2, 1, 4, MATERIALS.rust));
  return v;
}

/** Bake the checkpoint set (call from BootScene). */
export function bakeCoreVoxelModels(scene: Phaser.Scene): void {
  bakeVoxelModel(scene, {
    name: 'ground-tile',
    voxels: groundTileModel(),
    outline: false,
    grounding: false,
  });
  bakeVoxelModel(scene, { name: 'crate', voxels: crateModel() });
  bakeVoxelModel(scene, { name: 'planter', voxels: planterModel() });
  for (let i = 0; i < 4; i++) {
    bakeVoxelModel(scene, { name: `stall-${i}`, voxels: stallModel(i) });
  }
  // The Spark itself is baked in sparkModel.ts (bakeSparkModels).
}
