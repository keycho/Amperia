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

function crateModel(variant: number): Voxel[] {
  // A rusted steel job crate: deep-rust corner posts, banded panels.
  // V1 variants: 0 base · 1 dented (caved corner, burst band, lid slid)
  // · 2 repainted teal, squatter · 3 stacked pair with a strap.
  const panel = variant === 2 ? MATERIALS.paintTeal : MATERIALS.rust;
  const height = variant === 2 ? 4 : 5;
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 5, 5, height, panel)) {
    // Variant 1's caved top corner: the box took a forklift hit.
    if (variant === 1 && vox.z >= height - 2 && vox.x >= 3 && vox.y <= 1) continue;
    // Variant 1's burst band gap.
    if (variant === 1 && vox.z === 1 && vox.x === 2 && vox.y === 4) continue;
    const isPost = (vox.x === 0 || vox.x === 4) && (vox.y === 0 || vox.y === 4);
    const isBand = (vox.z === 1 || vox.z === 3) && !isPost;
    if (isPost) v.push({ ...vox, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
    else if (isBand) v.push({ ...vox, c: shade(panel.base, -0.14) });
    else v.push(vox);
  }
  if (variant === 1) {
    // The slid lid: top slab shoved one voxel off true.
    v.push(...mbox(1, 0, 5, 5, 5, 1, MATERIALS.rustDeep));
  }
  if (variant === 2) {
    // Stencil chips where the routing code wore off the paint.
    v.push({ x: 4, y: 2, z: 2, c: shade(MATERIALS.paintTeal.base, 0.3) });
    v.push({ x: 4, y: 3, z: 2, c: shade(MATERIALS.paintTeal.base, 0.3) });
  }
  if (variant === 3) {
    // A smaller wood crate riding on top, off-center, strapped down.
    v.push(...mbox(1, 2, 5, 3, 3, 3, MATERIALS.wood));
    for (let z = 0; z < 8; z++) v.push({ x: 2, y: 4, z, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  }
  // Routing tag — the one neon accent (moves with the damage).
  v.push(
    variant === 1
      ? { x: 0, y: 3, z: 4, c: PALETTE_INT.neonAmber }
      : variant === 3
        ? { x: 3, y: 3, z: 7, c: PALETTE_INT.neonAmber }
        : { x: 4, y: 3, z: height - 1, c: PALETTE_INT.neonAmber },
  );
  return v;
}

function planterModel(variant: number): Voxel[] {
  // V1 variants: 0 barrel bush · 1 sapling on a trunk · 2 chipped concrete
  // trough with a drooping vine · 3 overgrown barrel, spilling wide.
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.3);
  const v: Voxel[] = [];
  if (variant === 2) {
    // Concrete trough, one lip chipped.
    for (const vox of mbox(0, 0, 0, 4, 4, 4, MATERIALS.concrete)) {
      if (vox.z === 3 && vox.x === 0 && vox.y === 2) continue; // the chip
      v.push(vox);
    }
    // Low moss mat + a vine drooping over the chipped edge to the ground.
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2]] as const) {
      v.push({ x, y, z: 4, c: (x + y) % 2 === 0 ? leafA : leafB });
    }
    v.push({ x: 0, y: 2, z: 3, c: leafB });
    v.push({ x: 0, y: 2, z: 2, c: leafA });
    v.push({ x: -1, y: 2, z: 1, c: leafB });
    v.push({ x: -1, y: 2, z: 0, c: leafB });
    return v;
  }
  // Barrel base (variants 0/1/3): wood with rusted hoop rings.
  for (const vox of mbox(0, 0, 0, 4, 4, 6, MATERIALS.wood)) {
    const hoop = vox.z === 2 || vox.z === 5;
    if (hoop) v.push({ ...vox, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
    else v.push(vox);
  }
  if (variant === 1) {
    // A sapling: bare trunk, then a small canopy puff up high.
    for (let z = 6; z < 11; z++) v.push({ x: 1, y: 1, z, c: MATERIALS.woodDeep.base, mat: MATERIALS.woodDeep });
    for (const [x, y, z] of [
      [0, 1, 11], [1, 0, 11], [1, 1, 11], [2, 1, 11], [1, 2, 11], [2, 2, 11],
      [1, 1, 12], [2, 1, 12], [1, 2, 12],
    ] as const) {
      v.push({ x, y, z, c: (x + y + z) % 2 === 0 ? leafA : leafB });
    }
    return v;
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
  if (variant === 3) {
    // Overgrown: the bush spills past the staves and hangs down a side,
    // with one warm bloom — a single light voxel, not a fill.
    for (const [x, y, z, c] of [
      [-1, 1, 6, leafB], [-1, 2, 6, leafA], [4, 1, 6, leafB], [4, 2, 6, leafA],
      [1, 4, 6, leafB], [2, 4, 6, leafA], [4, 2, 5, leafB], [4, 2, 4, leafB],
      [1, 4, 5, leafA], [0, 0, 7, leafB], [3, 3, 7, leafA], [3, 0, 7, leafB],
    ] as Array<[number, number, number, number]>) {
      v.push({ x, y, z, c });
    }
    v.push({ x: 2, y: 3, z: 8, c: PALETTE_INT.warmGlow }); // the bloom
  }
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
  for (let i = 0; i < 4; i++) {
    bakeVoxelModel(scene, { name: `crate-${i}`, voxels: crateModel(i) });
    bakeVoxelModel(scene, { name: `planter-${i}`, voxels: planterModel(i) });
    bakeVoxelModel(scene, { name: `stall-${i}`, voxels: stallModel(i) });
  }
  // The Spark itself is baked in sparkModel.ts (bakeSparkModels).
}
