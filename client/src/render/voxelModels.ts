import Phaser from 'phaser';
import { mixPalette, PALETTE_INT } from '@shared/palette';
import { bakeVoxelModel, box, type Voxel } from './voxel';

/**
 * The checkpoint set: ground tile, crate, stall, planter, Spark.
 * Every color is a palette blend; one neon accent per asset where earned.
 */

function groundTileModel(): Voxel[] {
  const c = mixPalette('duskSky', 'groundBase', 0.5);
  return box(0, 0, 0, 8, 8, 1, c);
}

function crateModel(): Voxel[] {
  const wood = mixPalette('groundAccent', 'warmGlow', 0.2);
  const slat = mixPalette('groundAccent', 'structureMid', 0.35);
  const post = mixPalette('structureMid', 'ink', 0.15);
  const v: Voxel[] = [];
  for (const vox of box(0, 0, 0, 5, 5, 5, wood)) {
    const isPost =
      (vox.x === 0 || vox.x === 4) && (vox.y === 0 || vox.y === 4) ? true : false;
    const isSlat = (vox.z === 1 || vox.z === 3) && !isPost;
    v.push({ ...vox, c: isPost ? post : isSlat ? slat : wood });
  }
  // Routing tag — the one neon accent.
  v.push({ x: 4, y: 3, z: 4, c: PALETTE_INT.neonAmber });
  return v;
}

function planterModel(): Voxel[] {
  const barrel = mixPalette('groundAccent', 'ink', 0.3);
  const rim = mixPalette('groundAccent', 'warmGlow', 0.25);
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.3);
  const v: Voxel[] = [];
  for (const vox of box(0, 0, 0, 4, 4, 6, barrel)) {
    v.push({ ...vox, c: vox.z === 5 ? rim : vox.z === 2 ? rim : barrel });
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
  const counter = mixPalette('structureMid', 'groundAccent', 0.3);
  const counterTop = mixPalette('groundAccent', 'warmGlow', 0.3);
  const post = mixPalette('structureMid', 'ink', 0.25);
  const stripeHot = [
    mixPalette('neonRose', 'structureMid', 0.3),
    mixPalette('neonAmber', 'structureMid', 0.25),
    mixPalette('neonTeal', 'structureMid', 0.4),
    mixPalette('neonRose', 'structureMid', 0.3),
  ][variant % 4] as number;
  const stripePale = mixPalette('warmGlow', 'groundAccent', 0.35);
  const v: Voxel[] = [];
  // Counter with a lighter top.
  v.push(...box(2, 1, 0, 8, 5, 7, counter));
  v.push(...box(2, 1, 7, 8, 5, 1, counterTop));
  // Posts.
  for (const [px, py] of [
    [1, 0],
    [10, 0],
    [1, 6],
    [10, 6],
  ] as const) {
    v.push(...box(px, py, 0, 1, 1, 20, post));
  }
  // Awning: striped slab with a front drip edge.
  for (let x = 0; x < 12; x++) {
    for (let y = 0; y < 8; y++) {
      v.push({ x, y, z: 20, c: x % 2 === 0 ? stripeHot : stripePale });
    }
  }
  for (let x = 0; x < 12; x++) {
    v.push({ x, y: 7, z: 19, c: x % 2 === 0 ? stripeHot : stripePale });
    v.push({ x, y: 7, z: 18, c: x % 2 === 0 ? stripeHot : stripePale });
  }
  // Hanging sign (ink board, neon glyph) — the earned accent.
  v.push(...box(4, 6, 13, 3, 1, 4, mixPalette('ink', 'structureMid', 0.25)));
  v.push({ x: 5, y: 6, z: 15, c: PALETTE_INT.neonAmber });
  v.push({ x: 5, y: 6, z: 14, c: PALETTE_INT.neonAmber });
  // Lantern voxel by the right post (glow sprite added at placement).
  v.push({ x: 10, y: 6, z: 14, c: PALETTE_INT.warmGlow });
  // Crates under the counter for life.
  v.push(...box(3, 6, 0, 2, 1, 4, mixPalette('groundAccent', 'warmGlow', 0.15)));
  return v;
}

function sparkModel(facing: 'se' | 'ne'): Voxel[] {
  const trousers = mixPalette('structureMid', 'ink', 0.15);
  const jacket = mixPalette('groundAccent', 'warmGlow', 0.35);
  const jacketDark = mixPalette('groundAccent', 'structureMid', 0.35);
  const skin = mixPalette('warmGlow', 'groundAccent', 0.25);
  const hair = mixPalette('neonRose', 'ink', 0.55);
  const band = mixPalette('structureMid', 'ink', 0.35);
  const v: Voxel[] = [];
  // Legs (4 tall).
  v.push(...box(0, 0, 0, 1, 2, 4, trousers));
  v.push(...box(2, 0, 0, 1, 2, 4, trousers));
  // Belt + jacket torso (5 tall).
  v.push(...box(0, 0, 4, 3, 2, 1, jacketDark));
  v.push(...box(0, 0, 5, 3, 2, 4, jacket));
  if (facing === 'se') {
    v.push({ x: 1, y: 1, z: 4, c: PALETTE_INT.neonAmber }); // belt buckle
  } else {
    v.push(...box(1, 0, 5, 1, 1, 3, jacketDark)); // salvage pack on the back
  }
  // Arms.
  v.push(...box(-1, 0, 5, 1, 1, 4, jacketDark));
  v.push(...box(3, 1, 5, 1, 1, 4, jacketDark));
  // Head: jaw (skin), goggle band, hair — slightly big on purpose.
  v.push(...box(0, 0, 9, 3, 2, 2, skin));
  v.push(...box(0, 0, 11, 3, 2, 1, band));
  if (facing === 'se') {
    v.push({ x: 2, y: 1, z: 11, c: PALETTE_INT.neonTeal }); // goggle lens
  }
  v.push(...box(0, 0, 12, 3, 2, 2, hair));
  return v;
}

/** Bake the checkpoint set (call from BootScene). */
export function bakeCoreVoxelModels(scene: Phaser.Scene): void {
  bakeVoxelModel(scene, { name: 'ground-tile', voxels: groundTileModel(), outline: false });
  bakeVoxelModel(scene, { name: 'crate', voxels: crateModel() });
  bakeVoxelModel(scene, { name: 'planter', voxels: planterModel() });
  for (let i = 0; i < 4; i++) {
    bakeVoxelModel(scene, { name: `stall-${i}`, voxels: stallModel(i) });
  }
  bakeVoxelModel(scene, { name: 'spark-se', voxels: sparkModel('se'), warmRim: true });
  bakeVoxelModel(scene, { name: 'spark-ne', voxels: sparkModel('ne'), warmRim: true });
}
