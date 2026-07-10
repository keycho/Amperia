import Phaser from 'phaser';
import { mixPalette, PALETTE_INT } from '@shared/palette';
import { bakeVoxelModel, box, type Voxel } from './voxel';

/**
 * Mass-convert set: resource nodes (hero-budget per §12A.8), containers,
 * salvage shacks, the antenna shrine, and the Great Dynamo hero model.
 */

// ── Junk heap ─────────────────────────────────────────────────────────────

function junkHeapModel(depleted: boolean): Voxel[] {
  const scrapA = mixPalette('structureMid', 'groundAccent', 0.4);
  const scrapB = mixPalette('structureMid', 'ink', 0.15);
  const scrapC = mixPalette('groundAccent', 'ink', 0.2);
  const v: Voxel[] = [];
  const lumps: Array<[number, number, number, number, number, number, number]> = depleted
    ? [
        [0, 2, 0, 4, 4, 2, scrapB],
        [3, 0, 0, 4, 4, 2, scrapA],
        [5, 3, 0, 3, 3, 1, scrapC],
      ]
    : [
        [0, 2, 0, 5, 5, 3, scrapB],
        [3, 0, 0, 5, 5, 4, scrapA],
        [5, 4, 0, 4, 4, 2, scrapC],
        [2, 3, 3, 3, 3, 2, scrapC],
        [4, 2, 4, 2, 2, 2, scrapB],
      ];
  for (const [x, y, z, w, d, h, c] of lumps) v.push(...box(x, y, z, w, d, h, c));
  if (!depleted) {
    // Sticking-out bits: a strut, a pipe, a plate — junk should bristle.
    v.push(...box(1, 1, 3, 1, 1, 4, scrapC)); // strut
    v.push(...box(6, 2, 2, 3, 1, 1, scrapB)); // pipe
    v.push(...box(0, 5, 2, 2, 3, 1, scrapA)); // plate
    v.push({ x: 4, y: 1, z: 6, c: PALETTE_INT.neonAmber }); // sign chip accent
  }
  return v;
}

// ── Brass seam: a rock hump with live veins ───────────────────────────────

function brassNodeModel(depleted: boolean): Voxel[] {
  const rock = mixPalette('structureMid', 'duskSky', 0.35);
  const rockDark = mixPalette('structureMid', 'ink', 0.3);
  const vein = depleted
    ? mixPalette('groundAccent', 'structureMid', 0.5)
    : mixPalette('neonAmber', 'groundAccent', 0.25);
  const v: Voxel[] = [];
  v.push(...box(0, 1, 0, 6, 5, 3, rock));
  v.push(...box(1, 0, 0, 4, 3, 4, rockDark));
  v.push(...box(2, 2, 3, 3, 3, 2, rock));
  // The seam: a vein crawling over the hump.
  const veinPath: Array<[number, number, number]> = [
    [0, 3, 2],
    [1, 3, 3],
    [2, 3, 4],
    [3, 3, 4],
    [3, 2, 4],
    [4, 2, 3],
    [5, 2, 2],
    [5, 3, 1],
  ];
  for (const [x, y, z] of veinPath) v.push({ x, y, z, c: vein });
  if (!depleted) v.push({ x: 2, y: 4, z: 5, c: PALETTE_INT.neonAmber }); // hot pocket
  return v;
}

// ── Amperite: crystal cluster jutting from a base ─────────────────────────

function amperiteNodeModel(depleted: boolean): Voxel[] {
  const base = mixPalette('structureMid', 'ink', 0.35);
  const crystal = mixPalette('neonTeal', 'structureMid', 0.25);
  const crystalLit = PALETTE_INT.neonTeal;
  const v: Voxel[] = [];
  v.push(...box(0, 0, 0, 6, 6, 2, base));
  const spire = (x: number, y: number, h: number, lit: boolean) => {
    const c = lit ? crystalLit : crystal;
    v.push(...box(x, y, 2, 2, 2, Math.max(1, h - 2), c));
    if (!depleted) v.push({ x, y: y + 1, z: h, c }); // tapering tip
  };
  if (depleted) {
    spire(1, 1, 3, false);
    spire(3, 3, 2, false);
  } else {
    spire(1, 1, 7, false);
    spire(3, 2, 9, true);
    spire(2, 4, 5, false);
    v.push({ x: 4, y: 3, z: 10, c: crystalLit });
  }
  return v;
}

// ── Antenna shrine ────────────────────────────────────────────────────────

function antennaModel(): Voxel[] {
  const frame = mixPalette('structureMid', 'ink', 0.2);
  const frameLight = mixPalette('structureMid', 'groundAccent', 0.35);
  const v: Voxel[] = [];
  // Plinth with a kneeling-height shrine box.
  v.push(...box(0, 0, 0, 6, 6, 2, frame));
  v.push(...box(1, 1, 2, 4, 4, 2, frameLight));
  // Lattice mast.
  for (let z = 4; z < 26; z++) {
    v.push({ x: 2, y: 2, z, c: z % 4 === 0 ? frameLight : frame });
    v.push({ x: 3, y: 3, z, c: z % 4 === 2 ? frameLight : frame });
  }
  // Cross braces.
  v.push(...box(1, 2, 10, 4, 1, 1, frameLight));
  v.push(...box(2, 1, 18, 1, 4, 1, frameLight));
  // Dish.
  v.push(...box(3, 3, 20, 3, 1, 3, frameLight));
  v.push({ x: 5, y: 3, z: 21, c: mixPalette('structureMid', 'ink', 0.05) });
  // Beacon — the cool accent.
  v.push(...box(2, 2, 26, 2, 2, 2, PALETTE_INT.neonTeal));
  return v;
}

// ── Containers & drums (the block replacements) ───────────────────────────

function containerModel(variant: number): Voxel[] {
  const bodies = [
    mixPalette('structureMid', 'duskSky', 0.25),
    mixPalette('structureMid', 'groundAccent', 0.3),
    mixPalette('duskSky', 'groundBase', 0.5),
  ];
  const body = bodies[variant % 3] as number;
  const ridge = mixPalette('structureMid', 'ink', 0.3);
  const v: Voxel[] = [];
  for (const vox of box(0, 0, 0, 6, 4, 5, body)) {
    // Corrugation: alternating darker columns on long faces.
    const ridged = vox.x % 2 === 1 && (vox.y === 0 || vox.y === 3);
    v.push({ ...vox, c: ridged ? ridge : body });
  }
  // Stencil chip accent.
  v.push({ x: 5, y: 2, z: 3, c: PALETTE_INT.neonAmber });
  return v;
}

function drumsModel(): Voxel[] {
  const drumA = mixPalette('structureMid', 'groundAccent', 0.45);
  const drumB = mixPalette('groundAccent', 'ink', 0.3);
  const band = mixPalette('structureMid', 'ink', 0.25);
  const v: Voxel[] = [];
  const drum = (x: number, y: number, c: number) => {
    for (const vox of box(x, y, 0, 3, 3, 5, c)) {
      v.push({ ...vox, c: vox.z === 2 ? band : c });
    }
  };
  drum(0, 0, drumA);
  drum(3, 2, drumB);
  drum(1, 3, drumA);
  return v;
}

// ── Salvage shacks (modular, with lit windows + neon sign) ────────────────

function shackModel(variant: number): Voxel[] {
  const walls = [
    mixPalette('structureMid', 'groundAccent', 0.25),
    mixPalette('structureMid', 'duskSky', 0.2),
    mixPalette('groundAccent', 'structureMid', 0.5),
  ][variant % 3] as number;
  const wallsDark = mixPalette('structureMid', 'ink', 0.25);
  const roof = mixPalette('duskSky', 'ink', 0.25);
  const roofLip = mixPalette('structureMid', 'ink', 0.1);
  const door = mixPalette('groundAccent', 'ink', 0.35);
  const window = PALETTE_INT.warmGlow;
  const signC = [PALETTE_INT.neonRose, PALETTE_INT.neonAmber, PALETTE_INT.neonTeal][
    variant % 3
  ] as number;
  const v: Voxel[] = [];
  // Body 14×12, 12 tall with a patched second tone.
  for (const vox of box(0, 0, 0, 14, 12, 12, walls)) {
    const patched = vox.z > 7 && vox.x < 5 && vox.y > 5;
    v.push({ ...vox, c: patched ? wallsDark : walls });
  }
  // Roof slab with overhang + lip.
  v.push(...box(-1, -1, 12, 16, 14, 1, roof));
  v.push(...box(-1, 12, 11, 16, 1, 1, roofLip));
  // Door (front face, +y side) and two lit windows.
  v.push(...box(3, 11, 0, 3, 1, 6, door));
  v.push(...box(8, 11, 4, 3, 1, 3, window));
  v.push(...box(13, 5, 5, 1, 3, 3, window)); // side window (+x face)
  // Neon sign board above the door.
  v.push(...box(2, 11, 8, 5, 1, 2, mixPalette('ink', 'structureMid', 0.2)));
  v.push({ x: 3, y: 11, z: 9, c: signC });
  v.push({ x: 5, y: 11, z: 8, c: signC });
  // Rooftop junk: pipe + vent.
  v.push(...box(2, 3, 13, 1, 1, 3, wallsDark));
  v.push(...box(10, 6, 13, 2, 2, 1, roofLip));
  return v;
}

// ── Scuttlebots (little junk critters; accent = eye/antenna light) ────────

export function scuttlebotModel(accent: number): Voxel[] {
  const shell = mixPalette('structureMid', 'ink', 0.15);
  const shellLight = mixPalette('structureMid', 'groundAccent', 0.35);
  const leg = mixPalette('structureMid', 'ink', 0.4);
  const v: Voxel[] = [];
  // Four stub legs.
  for (const [lx, ly] of [
    [0, 0],
    [4, 0],
    [0, 3],
    [4, 3],
  ] as const) {
    v.push({ x: lx, y: ly, z: 0, c: leg });
  }
  // Dented shell with a lighter hatch.
  v.push(...box(0, 0, 1, 5, 4, 2, shell));
  v.push(...box(1, 1, 3, 3, 2, 1, shellLight));
  // One glowing eye on the front face + antenna tip — the accent.
  v.push({ x: 3, y: 3, z: 2, c: accent });
  v.push({ x: 1, y: 1, z: 4, c: leg });
  v.push({ x: 1, y: 1, z: 5, c: accent });
  return v;
}

// ── The Great Dynamo (hero model — the biggest light in the city) ─────────

function dynamoModel(): Voxel[] {
  const housing = mixPalette('structureMid', 'ink', 0.3);
  const housingLight = mixPalette('structureMid', 'duskSky', 0.15);
  const core = mixPalette('duskSky', 'ink', 0.3);
  const ringHot = PALETTE_INT.neonAmber;
  const ringGlow = mixPalette('neonAmber', 'warmGlow', 0.55);
  const v: Voxel[] = [];

  // Base skirt 30×30×4 (hollow) with vent slots.
  for (const vox of box(0, 0, 0, 30, 30, 4, housing)) {
    const inner = vox.x > 2 && vox.x < 27 && vox.y > 2 && vox.y < 27 && vox.z < 3;
    if (inner) continue;
    const vent = vox.z === 1 && (vox.x + vox.y) % 3 === 0 && (vox.y === 0 || vox.x === 29);
    v.push({ ...vox, c: vent ? core : housing });
  }
  // Cable stubs at the corners.
  for (const [cx, cy] of [
    [1, 1],
    [26, 1],
    [1, 26],
    [26, 26],
  ] as const) {
    v.push(...box(cx, cy, 4, 3, 3, 2, core));
  }

  // Housing pillars (4), leaving big open sightlines to the core.
  for (const [px, py] of [
    [2, 2],
    [24, 2],
    [2, 24],
    [24, 24],
  ] as const) {
    v.push(...box(px, py, 4, 4, 4, 34, housing));
    v.push(...box(px, py, 38, 4, 4, 2, housingLight));
  }
  // Top ring beam connecting the pillars.
  for (const vox of box(2, 2, 40, 26, 26, 3, housing)) {
    const inner = vox.x > 5 && vox.x < 24 && vox.y > 5 && vox.y < 24;
    if (!inner) v.push(vox);
  }

  // Turbine core: hollow column.
  for (const vox of box(10, 10, 2, 10, 10, 44, core)) {
    const inner = vox.x > 11 && vox.x < 18 && vox.y > 11 && vox.y < 18;
    if (!inner) v.push({ ...vox, c: vox.z % 8 === 0 ? mixPalette('duskSky', 'ink', 0.15) : core });
  }

  // Three glowing coil rings around the core (the hero light).
  for (const rz of [12, 22, 32]) {
    for (const vox of box(7, 7, rz, 16, 16, 2, ringHot)) {
      const inner = vox.x > 8 && vox.x < 21 && vox.y > 8 && vox.y < 21;
      if (!inner) {
        v.push({ ...vox, c: vox.z === rz + 1 ? ringGlow : ringHot });
      }
    }
  }

  // Cap + teal beacon.
  v.push(...box(9, 9, 46, 12, 12, 2, housingLight));
  v.push(...box(13, 13, 48, 4, 4, 2, housing));
  v.push(...box(14, 14, 50, 2, 2, 4, PALETTE_INT.neonTeal));

  return v;
}

/** Bake the world-conversion set (call from BootScene after the core set). */
export function bakeWorldVoxelModels(scene: Phaser.Scene): void {
  bakeVoxelModel(scene, { name: 'junk-heap', voxels: junkHeapModel(false) });
  bakeVoxelModel(scene, { name: 'junk-heap-depleted', voxels: junkHeapModel(true) });
  bakeVoxelModel(scene, { name: 'brass-node', voxels: brassNodeModel(false) });
  bakeVoxelModel(scene, { name: 'brass-node-depleted', voxels: brassNodeModel(true) });
  bakeVoxelModel(scene, { name: 'amperite-node', voxels: amperiteNodeModel(false) });
  bakeVoxelModel(scene, { name: 'amperite-node-depleted', voxels: amperiteNodeModel(true) });
  bakeVoxelModel(scene, { name: 'antenna', voxels: antennaModel() });
  for (let i = 0; i < 3; i++) {
    bakeVoxelModel(scene, { name: `container-${i}`, voxels: containerModel(i) });
    bakeVoxelModel(scene, { name: `shack-${i}`, voxels: shackModel(i) });
  }
  bakeVoxelModel(scene, { name: 'drums', voxels: drumsModel() });
  bakeVoxelModel(scene, { name: 'dynamo', voxels: dynamoModel() });
  bakeVoxelModel(scene, { name: 'scuttlebot', voxels: scuttlebotModel(PALETTE_INT.neonTeal) });
  bakeVoxelModel(scene, {
    name: 'scuttlebot-feral',
    voxels: scuttlebotModel(PALETTE_INT.neonRose),
  });
}
