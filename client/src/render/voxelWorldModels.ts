import Phaser from 'phaser';
import { hexToInt, mixPalette, PALETTE, PALETTE_INT } from '@shared/palette';
import { MATERIALS, voxelHash, type Material } from './materials';
import { bakeVoxelModel, box, mbox, shade, type Voxel } from './voxel';

/**
 * Mass-convert set: resource nodes (hero-budget per §12A.8), containers,
 * salvage shacks, the antenna shrine, and the Great Dynamo hero model.
 */

// ── Junk heap ─────────────────────────────────────────────────────────────

function junkHeapModel(depleted: boolean, variant: number): Voxel[] {
  // Rusted scrap through and through, with a gunmetal pipe poking out.
  // V1 variants change the SILHOUETTE, not just the skin: 0 the classic
  // mound · 1 low and spread, a plate leaning on it · 2 tall and spiky.
  const A = MATERIALS.rust;
  const B = MATERIALS.rustDeep;
  const C = MATERIALS.wood; // splintered pallet wood in the pile
  const v: Voxel[] = [];
  type Lump = [number, number, number, number, number, number, typeof A];
  const full: Lump[][] = [
    [
      [0, 2, 0, 5, 5, 3, B],
      [3, 0, 0, 5, 5, 4, A],
      [5, 4, 0, 4, 4, 2, C],
      [2, 3, 3, 3, 3, 2, A],
      [4, 2, 4, 2, 2, 2, B],
    ],
    [
      [0, 0, 0, 6, 4, 2, A],
      [4, 3, 0, 5, 5, 3, B],
      [0, 4, 0, 4, 4, 2, C],
      [6, 1, 2, 3, 3, 1, A],
      [1, 1, 2, 3, 2, 1, B],
    ],
    [
      [1, 2, 0, 5, 5, 2, B],
      [2, 1, 2, 4, 4, 3, A],
      [3, 2, 5, 3, 3, 2, B],
      [5, 5, 0, 3, 3, 3, C],
      [0, 0, 0, 3, 3, 2, A],
    ],
  ];
  const gone: Lump[][] = [
    [
      [0, 2, 0, 4, 4, 2, B],
      [3, 0, 0, 4, 4, 2, A],
      [5, 3, 0, 3, 3, 1, C],
    ],
    [
      [0, 0, 0, 5, 3, 1, A],
      [4, 3, 0, 4, 4, 2, B],
      [1, 4, 0, 3, 3, 1, C],
    ],
    [
      [1, 2, 0, 4, 4, 2, B],
      [3, 2, 2, 2, 2, 1, A],
      [5, 5, 0, 3, 2, 1, C],
    ],
  ];
  const lumps = (depleted ? gone : full)[variant % 3] as Lump[];
  for (const [x, y, z, w, d, h, m] of lumps) v.push(...mbox(x, y, z, w, d, h, m));
  if (!depleted) {
    // Sticking-out bits: a strut, a pipe, a plate — junk should bristle
    // (each variant bristles differently, so the skyline never repeats).
    if (variant % 3 === 1) {
      v.push(...mbox(7, 4, 3, 1, 1, 3, MATERIALS.gunmetal)); // bent rod
      v.push(...mbox(0, 1, 2, 1, 3, 3, MATERIALS.rust)); // leaning plate
      v.push(...mbox(3, 6, 2, 3, 1, 1, MATERIALS.gunmetalDeep)); // pipe
      v.push({ x: 5, y: 4, z: 3, c: PALETTE_INT.neonAmber }); // sign chip accent
    } else if (variant % 3 === 2) {
      v.push(...mbox(4, 3, 7, 1, 1, 3, MATERIALS.rustDeep)); // tall strut
      v.push(...mbox(3, 4, 6, 1, 2, 2, MATERIALS.gunmetal)); // fin plate
      v.push(...mbox(0, 6, 1, 2, 2, 1, MATERIALS.rust)); // spilled scrap
      v.push({ x: 4, y: 3, z: 10, c: PALETTE_INT.neonAmber }); // sign chip accent
    } else {
      v.push(...mbox(1, 1, 3, 1, 1, 4, MATERIALS.rustDeep)); // strut
      v.push(...mbox(6, 2, 2, 3, 1, 1, MATERIALS.gunmetal)); // pipe
      v.push(...mbox(0, 5, 2, 2, 3, 1, MATERIALS.rust)); // plate
      v.push({ x: 4, y: 1, z: 6, c: PALETTE_INT.neonAmber }); // sign chip accent
    }
  }
  return v;
}

// ── Brass seam: a rock hump with live veins ───────────────────────────────

function brassNodeModel(depleted: boolean): Voxel[] {
  const vein = depleted
    ? mixPalette('groundAccent', 'structureMid', 0.5)
    : mixPalette('neonAmber', 'groundAccent', 0.25);
  const v: Voxel[] = [];
  v.push(...mbox(0, 1, 0, 6, 5, 3, MATERIALS.concrete));
  v.push(...mbox(1, 0, 0, 4, 3, 4, MATERIALS.concreteDeep));
  v.push(...mbox(2, 2, 3, 3, 3, 2, MATERIALS.concrete));
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
  const crystal = mixPalette('neonTeal', 'structureMid', 0.25);
  const crystalLit = PALETTE_INT.neonTeal;
  const v: Voxel[] = [];
  v.push(...mbox(0, 0, 0, 6, 6, 2, MATERIALS.concreteDeep));
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
  const gm = MATERIALS.gunmetal;
  const gmd = MATERIALS.gunmetalDeep;
  const v: Voxel[] = [];
  // Concrete plinth with a rusted shrine box.
  v.push(...mbox(0, 0, 0, 6, 6, 2, MATERIALS.concrete));
  v.push(...mbox(1, 1, 2, 4, 4, 2, MATERIALS.rust));
  // Gunmetal lattice mast.
  for (let z = 4; z < 26; z++) {
    v.push({ x: 2, y: 2, z, c: z % 4 === 0 ? shade(gm.base, 0.12) : gm.base, mat: gm });
    v.push({ x: 3, y: 3, z, c: z % 4 === 2 ? shade(gm.base, 0.12) : gmd.base, mat: gmd });
  }
  // Cross braces.
  v.push(...mbox(1, 2, 10, 4, 1, 1, gm));
  v.push(...mbox(2, 1, 18, 1, 4, 1, gm));
  // Dish.
  v.push(...mbox(3, 3, 20, 3, 1, 3, gm));
  v.push({ x: 5, y: 3, z: 21, c: gmd.base, mat: gmd });
  // Beacon — the cool accent.
  v.push(...box(2, 2, 26, 2, 2, 2, PALETTE_INT.neonTeal));
  return v;
}

// ── Containers & drums (the block replacements) ───────────────────────────

function containerModel(variant: number, worn: boolean): Voxel[] {
  // Weathered painted-panel shipping boxes: teal-grey, ochre, dusty rose.
  // The worn twin (V1) took its knocks: caved corner, rust bloom, doors ajar.
  const mat = [MATERIALS.paintTeal, MATERIALS.paintOchre, MATERIALS.paintRose][
    variant % 3
  ] as (typeof MATERIALS)['paintTeal'];
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 6, 4, 5, mat)) {
    // Worn: the near top corner is caved clean in.
    if (worn && vox.z >= 3 && vox.x >= 4 && vox.y >= 2) continue;
    // Corrugation: alternating darker columns on long faces.
    const ridged = vox.x % 2 === 1 && (vox.y === 0 || vox.y === 3);
    // Worn: rust blooming up from the skids on the low panels.
    const rusted = worn && vox.z === 0 && vox.x <= 2 && (vox.x + vox.y) % 2 === 0;
    if (rusted) v.push({ ...vox, c: MATERIALS.rust.base, mat: MATERIALS.rust });
    else v.push(ridged ? { ...vox, c: shade(mat.base, -0.16) } : vox);
  }
  // Rusted top rail + stencil chip accent.
  for (const vox of mbox(0, 0, 4, worn ? 4 : 6, 1, 1, MATERIALS.rustDeep)) v.push(vox);
  if (worn) {
    // The sprung door leaning off its hinge.
    v.push(...mbox(6, 0, 0, 1, 1, 4, shadeMat(mat)));
    v.push({ x: 0, y: 2, z: 2, c: PALETTE_INT.neonAmber });
  } else {
    v.push({ x: 5, y: 2, z: 3, c: PALETTE_INT.neonAmber });
  }
  return v;
}

/** Worn-panel color helper: the door leans darker than the walls. */
function shadeMat(mat: (typeof MATERIALS)['paintTeal']): (typeof MATERIALS)['paintTeal'] {
  return { ...mat, base: shade(mat.base, -0.2) };
}

/** Weathered-steel container (the Tangle's rust/gunmetal family). */
function containerRustModel(variant: number, worn: boolean): Voxel[] {
  const mat = [MATERIALS.rust, MATERIALS.gunmetalDeep, MATERIALS.rustDeep][
    variant % 3
  ] as (typeof MATERIALS)['rust'];
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 6, 4, 5, mat)) {
    // Worn: a bite torn out of the far top corner + a salvaged repaint panel.
    if (worn && vox.z >= 4 && vox.x <= 1 && vox.y <= 1) continue;
    const ridged = vox.x % 2 === 1 && (vox.y === 0 || vox.y === 3);
    const repaint = worn && vox.y === 3 && vox.x >= 3 && vox.x <= 4 && vox.z <= 2;
    if (repaint) v.push({ ...vox, c: MATERIALS.paintOchre.base, mat: MATERIALS.paintOchre });
    else v.push(ridged ? { ...vox, c: shade(mat.base, -0.16) } : vox);
  }
  for (const vox of mbox(worn ? 2 : 0, 0, 4, worn ? 4 : 6, 1, 1, MATERIALS.gunmetalDeep)) v.push(vox);
  if (worn) v.push(...mbox(0, 0, 0, 1, 1, 2, MATERIALS.rustDeep)); // fallen scrap at the torn corner
  return v;
}

/**
 * Canyon wall segment (Tangle brief): containers stacked `levels` high
 * with per-level jitter and material drift; one level in three carries
 * ember-orange hazard stripes — the sanctioned accent, never a fill.
 */
function stackModel(levels: number, striped: boolean, alt: boolean): Voxel[] {
  const mats = [MATERIALS.rust, MATERIALS.gunmetalDeep, MATERIALS.rustDeep, MATERIALS.gunmetal];
  const v: Voxel[] = [];
  for (let level = 0; level < levels; level++) {
    // The alt twin (V1) shifts the material rotation and jitter phase so
    // two same-height wall segments never read as clones side by side.
    const mat = mats[(level * 2 + levels + (alt ? 1 : 0)) % mats.length] as (typeof MATERIALS)['rust'];
    const ox = (level * 3 + levels + (alt ? 1 : 0)) % 2; // slight overhang jitter
    const oy = (level * 5 + levels * 3 + (alt ? 1 : 0)) % 2;
    const z0 = level * 5;
    for (const vox of mbox(ox, oy, z0, 6, 4, 5, mat)) {
      const ridged = vox.x % 2 === 1 && (vox.y === oy || vox.y === oy + 3);
      v.push(ridged ? { ...vox, c: shade(mat.base, -0.16) } : vox);
    }
    // Hazard stripe band on ONE level of the OCCASIONAL container only
    // (§12B accent discipline) — a diagonal warning band, not windows.
    if (striped && level === Math.min(1, levels - 1)) {
      for (let x = ox; x < ox + 6; x++) {
        v.push({ x, y: oy + 3, z: z0 + 1 + (x % 2), c: PALETTE_INT.emberOrange });
      }
    }
    // Rusted top rail on the crown level.
    if (level === levels - 1) {
      for (const vox of mbox(ox, oy, z0 + 4, 6, 1, 1, MATERIALS.rustDeep)) v.push(vox);
    }
  }
  return v;
}

/**
 * The dead Craneking (the Tangle's XL landmark): tracked base, gunmetal
 * cab on legs, a long boom rising over the container walls with a claw
 * dangling on chain — and its old beacon at the boom tip (rose glow added
 * at placement, blinking slow).
 */
function craneHulkModel(): Voxel[] {
  const gm = MATERIALS.gunmetal;
  const gmd = MATERIALS.gunmetalDeep;
  const v: Voxel[] = [];
  // Two rusted track bases (footprint 48×32 voxels = 6×4 tiles).
  v.push(...mbox(2, 2, 0, 40, 8, 4, MATERIALS.rustDeep));
  v.push(...mbox(2, 22, 0, 40, 8, 4, MATERIALS.rustDeep));
  // Axle deck bridging the tracks.
  v.push(...mbox(8, 8, 4, 26, 16, 3, gmd));
  // The cab: a battered gunmetal head with one dead window.
  v.push(...mbox(10, 11, 7, 12, 10, 8, gm));
  v.push(...box(20, 13, 10, 2, 4, 3, mixPalette('ink', 'structureMid', 0.35))); // dead glass
  for (const vox of mbox(10, 11, 15, 12, 10, 1, MATERIALS.rust)) v.push(vox); // rusted roof
  // The TOWER: a hollow lattice column climbing over the walls — the
  // Craneking's spine, readable from anywhere in the maze.
  for (let z = 7; z < 42; z++) {
    for (const [lx, ly] of [
      [24, 13],
      [28, 13],
      [24, 18],
      [28, 18],
    ] as const) {
      const mat = z % 9 < 2 ? MATERIALS.rust : z % 2 === 0 ? gm : gmd;
      v.push({ x: lx, y: ly, z, c: mat.base, mat });
    }
    // Cross-braces every few courses.
    if (z % 6 === 3) {
      v.push(...mbox(25, 13, z, 3, 1, 1, gmd));
      v.push(...mbox(25, 18, z, 3, 1, 1, gmd));
      v.push(...mbox(24, 14, z, 1, 4, 1, gmd));
      v.push(...mbox(28, 14, z, 1, 4, 1, gmd));
    }
  }
  // The JIB: a long horizontal lattice arm at the top (+x), with the
  // shorter counter-jib and its dead counterweight behind (−x).
  v.push(...mbox(12, 14, 42, 34, 4, 2, gm));
  for (let x = 14; x < 44; x += 5) {
    v.push(...mbox(x, 15, 40, 1, 2, 2, gmd)); // lattice struts under
  }
  v.push(...mbox(8, 13, 40, 6, 6, 4, MATERIALS.rustDeep)); // counterweight
  // Apex pylon + tie bars sketched as raised courses.
  v.push(...mbox(25, 15, 44, 3, 2, 3, gm));
  // Hook chain from the jib + the dead claw dangling mid-air.
  for (let z = 24; z < 42; z += 2) v.push({ x: 41, y: 16, z, c: gmd.base, mat: gmd });
  v.push(...mbox(39, 14, 20, 5, 4, 3, MATERIALS.rustDeep));
  v.push(...mbox(39, 13, 17, 2, 2, 3, MATERIALS.rustDeep));
  v.push(...mbox(42, 17, 17, 2, 2, 3, MATERIALS.rustDeep));
  // The old beacon housing on the apex (rose glow at placement).
  v.push({ x: 26, y: 15, z: 47, c: PALETTE_INT.neonRose });
  v.push({ x: 26, y: 16, z: 47, c: PALETTE_INT.neonRose });
  return v;
}

/** A machine carcass (2×2 tiles): gunmetal hulk gone half to rust. */
function deadMachineModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  v.push(...mbox(0, 0, 0, 14, 12, 6, MATERIALS.gunmetalDeep));
  for (const vox of mbox(1, 1, 6, 12, 10, 4, MATERIALS.gunmetal)) {
    // Rust eats one corner differently per variant.
    const eaten =
      variant % 2 === 0 ? vox.x < 5 && vox.y < 5 : vox.x > 8 && vox.y > 6;
    v.push(eaten ? { ...vox, c: MATERIALS.rust.base, mat: MATERIALS.rust } : vox);
  }
  // Burst pipe + spilled plate + one dead indicator (ink, not neon: dead).
  v.push(...mbox(3 + (variant % 3), 4, 10, 2, 2, 3 + (variant % 2), MATERIALS.rustDeep));
  v.push(...mbox(10, 2, 6, 4, 3, 1, MATERIALS.rust));
  v.push({ x: 6, y: 10, z: 8, c: mixPalette('ink', 'structureMid', 0.5) });
  return v;
}

/** Cable pylon: tall thin gunmetal post with an amber marker cap. */
function pylonModel(): Voxel[] {
  const v: Voxel[] = [];
  v.push(...mbox(2, 2, 0, 4, 4, 2, MATERIALS.concreteDeep));
  v.push(...mbox(3, 3, 2, 2, 2, 18, MATERIALS.gunmetal));
  v.push(...mbox(2, 3, 20, 4, 2, 1, MATERIALS.gunmetalDeep)); // crossarm
  v.push({ x: 3, y: 3, z: 21, c: PALETTE_INT.neonAmber });
  return v;
}

function drumsModel(variant: number): Voxel[] {
  // Rusted fuel drums with gunmetal bands; one repainted ochre.
  // V1 variant 1: one drum tipped on its side, lid rolled loose.
  const v: Voxel[] = [];
  const drum = (x: number, y: number, mat: (typeof MATERIALS)['rust']) => {
    for (const vox of mbox(x, y, 0, 3, 3, 5, mat)) {
      if (vox.z === 2) {
        v.push({ ...vox, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
      } else {
        v.push(vox);
      }
    }
  };
  if (variant % 2 === 1) {
    drum(0, 0, MATERIALS.rustDeep);
    drum(2, 3, MATERIALS.paintOchre);
    // The tipped one: lying along x, band running vertically now.
    for (const vox of mbox(3, 0, 0, 5, 3, 3, MATERIALS.rust)) {
      if (vox.x === 5) v.push({ ...vox, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
      else v.push(vox);
    }
    v.push({ x: 8, y: 1, z: 0, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep }); // the loose lid
    return v;
  }
  drum(0, 0, MATERIALS.rust);
  drum(3, 2, MATERIALS.paintOchre);
  drum(1, 3, MATERIALS.rustDeep);
  return v;
}

// ── Salvage shacks (modular, with lit windows + neon sign) ────────────────

/**
 * V3 building set: EIGHT distinct designs on the 2×2-tile footprint —
 * silhouette first, and NO bare roofs (rooftops are 40% of a building's
 * read in iso; every one carries its own furniture). Doors face +y, one
 * neon sign chip pair near each door (color rotates per design), lit
 * windows in warmGlow. The old single-shack is design 0.
 */
function buildingModel(design: number): Voxel[] {
  const window = PALETTE_INT.warmGlow;
  const signC = [
    PALETTE_INT.neonRose,
    PALETTE_INT.neonAmber,
    PALETTE_INT.neonTeal,
    PALETTE_INT.neonCyan,
  ][design % 4] as number;
  const inkBoard = mixPalette('ink', 'structureMid', 0.2);
  const v: Voxel[] = [];
  const rustPatch = (vox: Voxel, cond: boolean): Voxel =>
    cond ? { ...vox, c: MATERIALS.rust.base, mat: MATERIALS.rust } : vox;
  const sign = (x: number, y: number, z: number) => {
    v.push(...box(x, y, z, 5, 1, 2, inkBoard));
    v.push({ x: x + 1, y, z: z + 1, c: signC });
    v.push({ x: x + 3, y, z, c: signC });
  };
  const door = (x: number, y: number) => v.push(...mbox(x, y, 0, 3, 1, 6, MATERIALS.woodDeep));

  switch (design % 8) {
    case 0: {
      // The classic parapet shack (teal), roof pipe + vent + spare spool.
      for (const vox of mbox(0, 0, 0, 14, 12, 12, MATERIALS.paintTeal)) {
        v.push(rustPatch(vox, vox.z > 7 && vox.x < 5 && vox.y > 5));
      }
      v.push(...mbox(-1, -1, 12, 16, 14, 1, MATERIALS.gunmetalDeep));
      v.push(...mbox(-1, 12, 11, 16, 1, 1, MATERIALS.gunmetal));
      door(3, 11);
      v.push(...box(8, 11, 4, 3, 1, 3, window));
      v.push(...box(13, 5, 5, 1, 3, 3, window));
      sign(2, 11, 8);
      v.push(...mbox(2, 3, 13, 1, 1, 3, MATERIALS.gunmetal)); // pipe
      v.push(...mbox(10, 6, 13, 2, 2, 1, MATERIALS.gunmetalDeep)); // vent
      v.push(...mbox(5, 4, 13, 3, 3, 2, MATERIALS.wood)); // spare spool up top
      break;
    }
    case 1: {
      // Two-storey: ochre base, wood upper floor overhanging the door side.
      for (const vox of mbox(1, 1, 0, 12, 10, 9, MATERIALS.paintOchre)) {
        v.push(rustPatch(vox, vox.z < 3 && vox.x > 9));
      }
      v.push(...mbox(0, 0, 9, 14, 12, 8, MATERIALS.wood)); // upper juts out
      v.push(...mbox(0, 0, 17, 14, 12, 1, MATERIALS.gunmetalDeep)); // roof
      door(4, 10);
      v.push(...box(9, 10, 3, 2, 1, 3, window)); // ground window
      v.push(...box(3, 11, 12, 3, 1, 3, window)); // upper window (front face)
      v.push(...box(10, 11, 12, 2, 1, 3, window));
      sign(3, 10, 7);
      // Roofline: rain barrel + whip antenna with its marker.
      v.push(...mbox(2, 2, 18, 3, 3, 4, MATERIALS.rustDeep));
      for (let z = 18; z < 26; z++) v.push({ x: 11, y: 4, z, c: MATERIALS.gunmetal.base, mat: MATERIALS.gunmetal });
      v.push({ x: 11, y: 4, z: 26, c: PALETTE_INT.neonTeal });
      break;
    }
    case 2: {
      // L-shape: rose main + gunmetal annex at half height.
      for (const vox of mbox(0, 0, 0, 8, 12, 12, MATERIALS.paintRose)) {
        v.push(rustPatch(vox, vox.z > 8 && vox.y < 3));
      }
      v.push(...mbox(8, 5, 0, 7, 7, 7, MATERIALS.gunmetal)); // the annex
      v.push(...mbox(-1, -1, 12, 10, 14, 1, MATERIALS.gunmetalDeep)); // main roof
      v.push(...mbox(8, 4, 7, 8, 9, 1, MATERIALS.rustDeep)); // annex roof
      door(2, 11);
      v.push(...box(5, 11, 4, 2, 1, 3, window));
      v.push(...box(10, 11, 3, 3, 1, 2, window)); // annex window
      sign(1, 11, 8);
      // Rooflines: skylight strip on the annex, stovepipe on the main.
      v.push(...box(9, 6, 8, 5, 2, 1, mixPalette('warmGlow', 'structureMid', 0.35)));
      v.push(...mbox(3, 3, 13, 2, 2, 5, MATERIALS.gunmetal));
      v.push(...mbox(2, 2, 18, 4, 4, 1, MATERIALS.gunmetalDeep));
      break;
    }
    case 3: {
      // Quonset hut: stepped barrel vault IS the roof — gunmetal courses.
      const profile: Array<[number, number]> = [
        [0, 8], [1, 10], [2, 11], [4, 12], [10, 12], [12, 11], [13, 10], [14, 8],
      ];
      // End walls + vault courses along y.
      for (const vox of mbox(0, 0, 0, 14, 12, 8, MATERIALS.gunmetalDeep)) {
        v.push(rustPatch(vox, vox.x < 2 && vox.z < 4));
      }
      for (const [x, top] of profile) {
        for (let y = 0; y < 12; y++) {
          for (let z = 8; z < top; z++) {
            const seam = y % 4 === 3;
            v.push({
              x, y, z,
              c: seam ? MATERIALS.rust.base : MATERIALS.gunmetal.base,
              mat: seam ? MATERIALS.rust : MATERIALS.gunmetal,
            });
          }
        }
      }
      door(5, 11);
      v.push(...box(2, 11, 3, 2, 1, 2, window)); // porthole-ish
      v.push(...box(10, 11, 3, 2, 1, 2, window));
      sign(4, 11, 7);
      // End chimney off the vault crown.
      v.push(...mbox(6, 1, 12, 2, 2, 4, MATERIALS.rustDeep));
      break;
    }
    case 4: {
      // Lean-to: wood walls, single corrugated slope, clerestory light.
      for (const vox of mbox(0, 0, 0, 14, 12, 8, MATERIALS.wood)) {
        v.push(rustPatch(vox, vox.x > 10 && vox.z > 4));
      }
      v.push(...mbox(0, 0, 8, 14, 4, 4, MATERIALS.wood)); // high back wall
      // The slope: stepped gunmetal sheets falling front-ward, patched.
      for (let y = 0; y < 13; y++) {
        const z = 12 - Math.floor(y / 3);
        for (let x = -1; x < 15; x++) {
          const patch = (x > 9 && y > 6) || (x < 3 && y < 3);
          v.push({
            x, y, z,
            c: patch ? MATERIALS.rust.base : MATERIALS.gunmetalDeep.base,
            mat: patch ? MATERIALS.rust : MATERIALS.gunmetalDeep,
          });
        }
      }
      door(9, 11);
      v.push(...box(3, 11, 3, 3, 1, 3, window));
      v.push(...box(2, 4, 9, 4, 1, 2, window)); // clerestory under the high edge
      sign(8, 11, 7);
      break;
    }
    case 5: {
      // Stacked setback: teal base, ochre top, terrace with railing.
      for (const vox of mbox(0, 0, 0, 14, 12, 9, MATERIALS.paintTeal)) {
        v.push(rustPatch(vox, vox.z < 3 && vox.y > 9 && vox.x > 10));
      }
      v.push(...mbox(0, 0, 9, 8, 12, 8, MATERIALS.paintOchre)); // set-back top
      v.push(...mbox(0, 0, 17, 8, 12, 1, MATERIALS.gunmetalDeep));
      v.push(...mbox(8, 0, 9, 6, 12, 1, MATERIALS.wood)); // the terrace deck
      // Terrace railing + potted bush + the awning strip over the door.
      for (let x = 8; x < 14; x++) {
        if (x % 2 === 0) v.push({ x, y: 11, z: 10, c: MATERIALS.woodDeep.base, mat: MATERIALS.woodDeep });
        v.push({ x, y: 11, z: 11, c: MATERIALS.woodDeep.base, mat: MATERIALS.woodDeep });
      }
      v.push(...mbox(10, 3, 10, 2, 2, 2, MATERIALS.wood));
      v.push({ x: 10, y: 3, z: 12, c: PALETTE_INT.solarGreen });
      v.push({ x: 11, y: 4, z: 12, c: mixPalette('solarGreen', 'ink', 0.3) });
      const stripeHot = mixPalette('neonRose', 'structureMid', 0.12);
      const stripePale = mixPalette('warmGlow', 'groundAccent', 0.25);
      for (let x = 1; x < 8; x++) v.push({ x, y: 12, z: 7, c: x % 2 === 0 ? stripeHot : stripePale });
      door(2, 11);
      v.push(...box(5, 11, 3, 2, 1, 3, window));
      v.push(...box(2, 11, 12, 3, 1, 3, window)); // upper window
      sign(1, 11, 8);
      // Roof: wash line strung across the top.
      for (let x = 1; x < 7; x++) v.push({ x, y: 6, z: 19, c: MATERIALS.gunmetalDeep.base });
      v.push(...box(2, 6, 17, 2, 1, 2, mixPalette('warmGlow', 'groundAccent', 0.3)));
      v.push(...box(5, 6, 17, 1, 1, 2, stripeHot));
      break;
    }
    case 6: {
      // The watch kiosk: small footprint, tall, crow's nest + weather vane.
      for (const vox of mbox(3, 2, 0, 8, 8, 16, MATERIALS.rust)) {
        v.push(rustPatch(vox, false));
      }
      v.push(...mbox(2, 1, 16, 10, 10, 1, MATERIALS.wood)); // nest deck
      for (let i = 0; i < 10; i += 2) {
        v.push({ x: 2 + i, y: 1, z: 17, c: MATERIALS.woodDeep.base, mat: MATERIALS.woodDeep });
        v.push({ x: 2 + i, y: 10, z: 17, c: MATERIALS.woodDeep.base, mat: MATERIALS.woodDeep });
      }
      v.push(...mbox(4, 3, 17, 6, 6, 5, MATERIALS.wood)); // the cabin
      v.push(...mbox(3, 2, 22, 8, 8, 1, MATERIALS.gunmetalDeep)); // cap roof
      v.push(...box(5, 8, 18, 3, 1, 3, window)); // lit lookout window
      door(5, 9);
      sign(4, 9, 7);
      // Mast + weather vane (the V2 tall/thin family's crown piece).
      for (let z = 23; z < 28; z++) v.push({ x: 7, y: 5, z, c: MATERIALS.gunmetal.base, mat: MATERIALS.gunmetal });
      v.push(...mbox(5, 5, 26, 5, 1, 1, MATERIALS.gunmetalDeep)); // the arrow
      v.push({ x: 4, y: 5, z: 26, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
      v.push({ x: 5, y: 5, z: 27, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
      v.push({ x: 7, y: 5, z: 28, c: PALETTE_INT.neonAmber }); // masthead lamp
      break;
    }
    default: {
      // Gabled cottage: ochre walls, stepped wood gable, dormer + chimney.
      for (const vox of mbox(0, 0, 0, 14, 12, 10, MATERIALS.paintOchre)) {
        v.push(rustPatch(vox, vox.z > 6 && vox.x > 10 && vox.y < 4));
      }
      // The gable: stepped courses closing toward the ridge (along x).
      for (let step = 0; step < 4; step++) {
        const inset = step * 2;
        v.push(...mbox(-1 + inset, -1, 10 + step, 16 - inset * 2, 14, 1, MATERIALS.woodDeep));
      }
      v.push(...mbox(5, -1, 14, 4, 14, 1, MATERIALS.wood)); // ridge cap
      door(4, 11);
      v.push(...box(9, 11, 3, 2, 1, 3, window));
      v.push(...box(1, 11, 3, 2, 1, 3, window));
      sign(3, 11, 7);
      // Dormer vent on the south slope + chimney punching the ridge.
      v.push(...mbox(9, 9, 11, 3, 3, 2, MATERIALS.wood));
      v.push(...box(10, 11, 11, 1, 1, 1, window));
      v.push(...mbox(2, 3, 12, 2, 2, 6, MATERIALS.rustDeep));
      v.push(...mbox(1, 2, 18, 4, 4, 1, MATERIALS.rust));
      break;
    }
  }
  return v;
}

// ── Scuttlebots (little junk critters; accent = eye/antenna light) ────────

export function scuttlebotModel(accent: number): Voxel[] {
  const v: Voxel[] = [];
  // Four gunmetal stub legs.
  for (const [lx, ly] of [
    [0, 0],
    [4, 0],
    [0, 3],
    [4, 3],
  ] as const) {
    v.push({ x: lx, y: ly, z: 0, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  }
  // Dented rusty shell with a salvaged gunmetal hatch.
  v.push(...mbox(0, 0, 1, 5, 4, 2, MATERIALS.rust));
  v.push(...mbox(1, 1, 3, 3, 2, 1, MATERIALS.gunmetal));
  // One glowing eye on the front face + antenna tip — the accent.
  v.push({ x: 3, y: 3, z: 2, c: accent });
  v.push({ x: 1, y: 1, z: 4, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  v.push({ x: 1, y: 1, z: 5, c: accent });
  return v;
}

// ── Heatlamp (placeable consumable — its own little light pool) ───────────

function heatlampModel(): Voxel[] {
  const v: Voxel[] = [];
  v.push(...mbox(0, 0, 0, 3, 3, 1, MATERIALS.rust));
  v.push(...mbox(1, 1, 1, 1, 1, 6, MATERIALS.gunmetal));
  // Lamp head: hot core with a gunmetal hood.
  v.push(...box(0, 0, 7, 3, 3, 2, PALETTE_INT.warmGlow));
  v.push(...mbox(0, 0, 9, 3, 3, 1, MATERIALS.gunmetalDeep));
  return v;
}

// ── Tramgate (arrival arch at the market lane's east end) ─────────────────

function tramgateModel(): Voxel[] {
  const gm = MATERIALS.gunmetal;
  const gmd = MATERIALS.gunmetalDeep;
  const v: Voxel[] = [];
  // Two pillars at the lane's shoulders (footprint 2×5 tiles = 16×40 vox).
  for (const py of [0, 34] as const) {
    v.push(...mbox(4, py, 0, 8, 6, 2, MATERIALS.concrete)); // plinth
    v.push(...mbox(5, py + 1, 2, 6, 4, 20, gm));
    v.push(...mbox(5, py + 1, 22, 6, 4, 2, MATERIALS.rust)); // rust cap
  }
  // Arch beam spanning the lane.
  v.push(...mbox(5, 0, 24, 6, 40, 3, gmd));
  v.push(...mbox(5, 0, 27, 6, 40, 1, MATERIALS.rust));
  // Hanging sign board under the beam, over the lane: amber glyph row.
  v.push(...box(7, 14, 19, 2, 12, 3, mixPalette('ink', 'structureMid', 0.2)));
  for (let gy = 15; gy <= 24; gy += 3) {
    v.push({ x: 7, y: gy, z: 20, c: PALETTE_INT.neonAmber });
  }
  // Teal beacon on the beam's center.
  v.push(...box(7, 19, 28, 2, 2, 2, PALETTE_INT.neonTeal));
  return v;
}

// ── Rope post (the scrap-yard boundary) ───────────────────────────────────

function ropepostModel(): Voxel[] {
  const v: Voxel[] = [];
  v.push(...mbox(2, 2, 0, 2, 2, 1, MATERIALS.concrete));
  v.push(...mbox(2, 2, 1, 2, 2, 5, MATERIALS.wood));
  v.push(...mbox(2, 2, 6, 2, 2, 1, MATERIALS.rust));
  v.push({ x: 2, y: 2, z: 7, c: PALETTE_INT.neonAmber }); // marker chip
  return v;
}

// ── The Tinkerbench (crafting + repairs; teal interactable glow) ──────────

function tinkerbenchModel(): Voxel[] {
  const v: Voxel[] = [];
  // Bench top on gunmetal legs.
  v.push(...mbox(1, 1, 0, 1, 1, 4, MATERIALS.gunmetalDeep));
  v.push(...mbox(6, 1, 0, 1, 1, 4, MATERIALS.gunmetalDeep));
  v.push(...mbox(1, 6, 0, 1, 1, 4, MATERIALS.gunmetalDeep));
  v.push(...mbox(6, 6, 0, 1, 1, 4, MATERIALS.gunmetalDeep));
  v.push(...mbox(0, 0, 4, 8, 8, 2, MATERIALS.wood));
  // Vice + parts tray + the teal work-screen (the earned accent).
  v.push(...mbox(1, 2, 6, 2, 2, 2, MATERIALS.gunmetal));
  v.push(...mbox(5, 4, 6, 2, 2, 1, MATERIALS.rust));
  v.push(...box(3, 6, 6, 3, 1, 3, PALETTE_INT.neonTeal));
  return v;
}

// ── The Nightstalls merchant's stand (1×1 tile, figure behind counter) ────

function merchantModel(): Voxel[] {
  const skin = mixPalette('warmGlow', 'groundAccent', 0.25);
  const hair = mixPalette('structureMid', 'ink', 0.3);
  const v: Voxel[] = [];
  // Counter along the front (+y face toward the lane).
  v.push(...mbox(0, 5, 0, 8, 3, 5, MATERIALS.wood));
  for (const vox of mbox(0, 5, 5, 8, 3, 1, MATERIALS.wood)) {
    v.push({ ...vox, c: shade(MATERIALS.wood.base, 0.14) });
  }
  // Goods on the counter: little resource crates + a jar.
  v.push(...mbox(1, 5, 6, 2, 2, 2, MATERIALS.rust));
  v.push(...mbox(5, 5, 6, 2, 2, 1, MATERIALS.paintTeal));
  v.push({ x: 4, y: 6, z: 6, c: PALETTE_INT.neonAmber }); // price chip
  // The merchant: chunky figure behind the counter (ochre apron).
  v.push(...mbox(3, 1, 0, 3, 2, 4, MATERIALS.paintOchre)); // apron/body
  v.push(...box(3, 1, 4, 3, 2, 2, skin)); // head
  v.push(...box(3, 1, 6, 3, 2, 1, hair)); // cap
  // Hanging lantern post at the side.
  v.push(...mbox(7, 1, 0, 1, 1, 9, MATERIALS.gunmetal));
  v.push({ x: 7, y: 1, z: 9, c: PALETTE_INT.warmGlow });
  return v;
}

// ── The Dispatcher (quest-giver by the Tramgate; amber glow) ──────────────

function dispatcherModel(): Voxel[] {
  const skin = mixPalette('warmGlow', 'groundAccent', 0.25);
  const hair = mixPalette('structureMid', 'ink', 0.45);
  const v: Voxel[] = [];
  // Lectern with a job board.
  v.push(...mbox(0, 5, 0, 6, 2, 6, MATERIALS.wood));
  v.push(...box(1, 6, 6, 4, 1, 3, mixPalette('ink', 'structureMid', 0.25)));
  v.push({ x: 2, y: 6, z: 8, c: PALETTE_INT.neonAmber });
  v.push({ x: 4, y: 6, z: 7, c: PALETTE_INT.neonAmber });
  // The Dispatcher: teal-coated figure with a cap.
  v.push(...mbox(2, 1, 0, 3, 2, 4, MATERIALS.paintTeal));
  v.push(...box(2, 1, 4, 3, 2, 2, skin));
  v.push(...box(2, 1, 6, 3, 2, 1, hair));
  return v;
}

// ── The Charge Warden (donation stub at the Dynamo; future Citywide Charge)

function wardenModel(): Voxel[] {
  const skin = mixPalette('warmGlow', 'groundAccent', 0.25);
  const v: Voxel[] = [];
  // Collection kiosk with a charge gauge.
  v.push(...mbox(0, 4, 0, 6, 3, 5, MATERIALS.gunmetal));
  v.push(...box(1, 4, 5, 1, 1, 2, PALETTE_INT.neonTeal)); // gauge stub
  v.push({ x: 4, y: 4, z: 5, c: PALETTE_INT.neonAmber });
  // The Warden: ochre-robed figure with a teal-tipped staff.
  v.push(...mbox(2, 0, 0, 3, 2, 4, MATERIALS.paintOchre));
  v.push(...box(2, 0, 4, 3, 2, 2, skin));
  v.push(...mbox(6, 1, 0, 1, 1, 8, MATERIALS.wood));
  v.push({ x: 6, y: 1, z: 8, c: PALETTE_INT.neonTeal });
  return v;
}

// ── Junkhound (the Tangle's fast biter) + Scrapcache ──────────────────────

function junkhoundModel(): Voxel[] {
  const v: Voxel[] = [];
  // Four gunmetal legs.
  for (const [lx, ly] of [
    [1, 0],
    [1, 3],
    [6, 0],
    [6, 3],
  ] as const) {
    v.push(...mbox(lx, ly, 0, 1, 1, 2, MATERIALS.gunmetalDeep));
  }
  // Long rusty body with a salvaged plate saddle.
  v.push(...mbox(0, 0, 2, 8, 4, 3, MATERIALS.rust));
  v.push(...mbox(2, 1, 5, 4, 2, 1, MATERIALS.gunmetal));
  // Head forward (+x) with jaw + rose eye; stub tail behind.
  v.push(...mbox(8, 1, 3, 2, 2, 2, MATERIALS.rustDeep));
  v.push({ x: 9, y: 2, z: 4, c: PALETTE_INT.neonRose });
  v.push(...mbox(8, 1, 2, 2, 2, 1, MATERIALS.gunmetalDeep)); // jaw
  v.push({ x: 0, y: 2, z: 5, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
  return v;
}

function scrapcacheModel(): Voxel[] {
  const v: Voxel[] = [];
  // A dropped pack: rusty chest with a rose claim-marker.
  v.push(...mbox(0, 0, 0, 5, 4, 3, MATERIALS.rustDeep));
  v.push(...mbox(0, 0, 3, 5, 4, 1, MATERIALS.rust));
  v.push({ x: 2, y: 3, z: 2, c: PALETTE_INT.neonRose });
  v.push(...mbox(4, 0, 4, 1, 1, 2, MATERIALS.gunmetal)); // marker post
  v.push({ x: 4, y: 0, z: 6, c: PALETTE_INT.neonRose });
  return v;
}

// ── The Great Dynamo (hero model — the biggest light in the city) ─────────

function dynamoModel(): Voxel[] {
  const housing = MATERIALS.gunmetal;
  const housingDeep = MATERIALS.gunmetalDeep;
  const ringHot = PALETTE_INT.neonAmber;
  const ringGlow = mixPalette('neonAmber', 'warmGlow', 0.55);
  const v: Voxel[] = [];

  // Base skirt 30×30×4 (hollow) with vent slots.
  for (const vox of mbox(0, 0, 0, 30, 30, 4, housing)) {
    const inner = vox.x > 2 && vox.x < 27 && vox.y > 2 && vox.y < 27 && vox.z < 3;
    if (inner) continue;
    const vent = vox.z === 1 && (vox.x + vox.y) % 3 === 0 && (vox.y === 0 || vox.x === 29);
    v.push(vent ? { ...vox, c: housingDeep.base, mat: housingDeep } : vox);
  }
  // Cable stubs at the corners.
  for (const [cx, cy] of [
    [1, 1],
    [26, 1],
    [1, 26],
    [26, 26],
  ] as const) {
    v.push(...mbox(cx, cy, 4, 3, 3, 2, housingDeep));
  }

  // Housing pillars (4), leaving big open sightlines to the core.
  for (const [px, py] of [
    [2, 2],
    [24, 2],
    [2, 24],
    [24, 24],
  ] as const) {
    v.push(...mbox(px, py, 4, 4, 4, 34, housing));
    for (const vox of mbox(px, py, 38, 4, 4, 2, housing)) {
      v.push({ ...vox, c: shade(housing.base, 0.14) });
    }
  }
  // Top ring beam connecting the pillars.
  for (const vox of mbox(2, 2, 40, 26, 26, 3, housing)) {
    const inner = vox.x > 5 && vox.x < 24 && vox.y > 5 && vox.y < 24;
    if (!inner) v.push(vox);
  }

  // Turbine core: hollow deep-gunmetal column with lighter service bands.
  for (const vox of mbox(10, 10, 2, 10, 10, 44, housingDeep)) {
    const inner = vox.x > 11 && vox.x < 18 && vox.y > 11 && vox.y < 18;
    if (!inner) {
      v.push(vox.z % 8 === 0 ? { ...vox, c: shade(housingDeep.base, 0.12) } : vox);
    }
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
  for (const vox of mbox(9, 9, 46, 12, 12, 2, housing)) {
    v.push({ ...vox, c: shade(housing.base, 0.14) });
  }
  v.push(...mbox(13, 13, 48, 4, 4, 2, housing));
  v.push(...box(14, 14, 50, 2, 2, 4, PALETTE_INT.neonTeal));

  return v;
}


// ── Curated salvage-punk props (I6) ───────────────────────────────────────
//
// The kenney_voxel-pack ships no .vox sources (PNG renders only), so these
// vignette props are BUILT, not imported — through the real material
// system, which is what the import path was for anyway.

/** A wooden cable spool with gunmetal windings and a live amber tail. */
function cablespoolModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  const disc = (z: number) => {
    for (const vox of mbox(0, 0, z, 5, 5, 1, MATERIALS.wood)) {
      const corner =
        (vox.x === 0 || vox.x === 4) && (vox.y === 0 || vox.y === 4);
      if (!corner) v.push(vox);
    }
  };
  disc(0);
  v.push(...mbox(1, 1, 1, 3, 3, 2, MATERIALS.gunmetalDeep)); // windings
  disc(3);
  if (variant % 2 === 1) {
    // A loose cable snaking off the spool, tipped live.
    v.push({ x: 4, y: 2, z: 1, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
    v.push({ x: 5, y: 2, z: 0, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
    v.push({ x: 6, y: 2, z: 0, c: PALETTE_INT.neonAmber });
  }
  return v;
}

/** Wooden barrels with rusted hoops, huddled like regulars. */
function barrelsModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  const barrel = (x: number, y: number, h: number) => {
    for (const vox of mbox(x, y, 0, 2, 2, h, MATERIALS.wood)) {
      const hoop = vox.z === 1 || vox.z === h - 1;
      if (hoop) v.push({ ...vox, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
      else v.push(vox);
    }
  };
  barrel(0, 0, 5);
  barrel(3, 1, 4);
  if (variant % 2 === 1) barrel(1, 3, 3); // the short one, lid ajar
  return v;
}

/** A stack of slatted pallets; the tall variant carries a stray crate. */
function palletsModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  const pallet = (z: number) => {
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        if (y % 2 === 1 && x > 0 && x < 4) continue; // slat gaps
        v.push({ x, y, z, c: MATERIALS.wood.base, mat: MATERIALS.wood });
      }
    }
  };
  pallet(0);
  pallet(1);
  if (variant % 2 === 1) {
    pallet(2);
    v.push(...mbox(1, 1, 3, 3, 3, 3, MATERIALS.rust)); // stray crate
    v.push({ x: 3, y: 2, z: 5, c: PALETTE_INT.neonAmber }); // routing tag
  }
  return v;
}

/** A gunmetal vent unit — dark slits, teal status lamp, always humming. */
function ventboxModel(): Voxel[] {
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 4, 4, 3, MATERIALS.gunmetal)) {
    const slit = vox.z === 1 && (vox.x === 0 || vox.y === 3) && (vox.y + vox.x) % 2 === 0;
    if (slit) v.push({ ...vox, c: shade(MATERIALS.gunmetalDeep.base, -0.25) });
    else v.push(vox);
  }
  v.push(...mbox(1, 1, 3, 2, 2, 1, MATERIALS.gunmetalDeep)); // fan cowl
  v.push({ x: 3, y: 3, z: 3, c: PALETTE_INT.neonTeal }); // status lamp
  return v;
}

/** Rusted gas canisters with the ember hazard band. */
function gascansModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  const can = (x: number, y: number, h: number) => {
    for (const vox of mbox(x, y, 0, 1, 1, h, MATERIALS.rust)) {
      if (vox.z === 2) {
        v.push({ ...vox, c: mixPalette('emberOrange', 'structureMid', 0.25) });
      } else v.push(vox);
    }
    v.push({ x, y, z: h, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  };
  can(0, 0, 4);
  can(1, 1, 3);
  if (variant % 2 === 1) can(2, 0, 4);
  return v;
}

/** A weathered tarp roped over somebody's stash. */
function tarpModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  const cloth = variant % 2 === 0 ? MATERIALS.paintTeal : MATERIALS.paintRose;
  v.push(...mbox(1, 1, 0, 3, 3, 2, MATERIALS.rust)); // the stash beneath
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      const edge = x === 0 || y === 0 || x === 4 || y === 4;
      const z = edge ? 1 : 2;
      if (edge && (x + y) % 3 === 0) continue; // ragged hem
      v.push({ x, y, z, c: cloth.base, mat: cloth });
    }
  }
  v.push({ x: 4, y: 2, z: 0, c: MATERIALS.wood.base, mat: MATERIALS.wood }); // rope stake
  return v;
}

/** A concrete scrap bin, junk cresting over the rim. */
function scrapbinModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 4, 4, 3, MATERIALS.concrete)) {
    const hollow = vox.z === 2 && vox.x > 0 && vox.x < 3 && vox.y > 0 && vox.y < 3;
    if (!hollow) v.push(vox);
  }
  // Junk cresting out.
  v.push({ x: 1, y: 1, z: 2, c: MATERIALS.rust.base, mat: MATERIALS.rust });
  v.push({ x: 2, y: 2, z: 2, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
  v.push({ x: 2, y: 1, z: 3, c: MATERIALS.rust.base, mat: MATERIALS.rust });
  if (variant % 2 === 1) {
    v.push({ x: 1, y: 2, z: 3, c: MATERIALS.wood.base, mat: MATERIALS.wood }); // plank
    v.push({ x: 1, y: 2, z: 4, c: PALETTE_INT.neonRose }); // torn banner scrap
  }
  return v;
}

/**
 * The Ledgerhouse (S5): the bank hall — gunmetal vault walls, a wood
 * counter, shelf stacks, and an open south face so the hall reads (and
 * walks) from the lane. Warm light lands at placement.
 */
function ledgerhouseModel(): Voxel[] {
  const v: Voxel[] = [];
  const W = 32; // 4×4 tiles
  // Floor slab: concrete with a wood runner to the door.
  v.push(...mbox(0, 0, 0, W, W, 1, MATERIALS.concrete));
  for (let y = 8; y < W; y++) {
    v.push({ x: 14, y, z: 1, c: MATERIALS.wood.base, mat: MATERIALS.wood });
    v.push({ x: 15, y, z: 1, c: MATERIALS.wood.base, mat: MATERIALS.wood });
  }
  // North + west vault walls, tall.
  v.push(...mbox(0, 0, 1, W, 3, 14, MATERIALS.gunmetal));
  v.push(...mbox(0, 0, 1, 3, W, 14, MATERIALS.gunmetalDeep));
  // East wall: mid-height.
  v.push(...mbox(W - 3, 0, 1, 3, W - 8, 9, MATERIALS.gunmetal));
  // South rail: knee-high, split by the door gap on the wood runner.
  v.push(...mbox(3, W - 3, 1, 9, 3, 3, MATERIALS.rust));
  v.push(...mbox(18, W - 3, 1, 11, 3, 3, MATERIALS.rust));
  // The counter across the hall.
  v.push(...mbox(6, 10, 1, 14, 3, 4, MATERIALS.wood));
  for (const vox of mbox(6, 10, 5, 14, 3, 1, MATERIALS.wood)) {
    v.push({ ...vox, c: shade(MATERIALS.wood.base, 0.14) });
  }
  // Shelf stacks along the north wall (ledgers + lockboxes).
  for (let i = 0; i < 4; i++) {
    v.push(...mbox(5 + i * 6, 3, 1, 4, 3, 8, MATERIALS.wood));
    v.push(...mbox(6 + i * 6, 4, 9, 2, 2, 2, MATERIALS.rustDeep));
    v.push({ x: 6 + i * 6, y: 5, z: 6, c: PALETTE_INT.neonAmber }); // ledger lamp
  }
  // Sign over the door: the Ledgerhouse mark (amber book).
  v.push(...mbox(12, W - 3, 10, 6, 1, 3, MATERIALS.gunmetalDeep));
  v.push({ x: 14, y: W - 3, z: 11, c: PALETTE_INT.neonAmber });
  v.push({ x: 15, y: W - 3, z: 11, c: PALETTE_INT.neonAmber });
  return v;
}

/**
 * The Fortune Coil's housing (S4): a carnival-sized ring on a rusted
 * kiosk, lamps up the sides. The spinning face itself is a live layer the
 * scene lays over this frame (a machined disk reads cleaner than voxels).
 */
function fortunecoilModel(): Voxel[] {
  const v: Voxel[] = [];
  // Kiosk base: rusted counter with a wood lip.
  v.push(...mbox(2, 2, 0, 12, 12, 3, MATERIALS.rust));
  v.push(...mbox(1, 1, 3, 14, 14, 1, MATERIALS.wood));
  // Twin masts holding the ring.
  v.push(...mbox(3, 7, 4, 2, 2, 12, MATERIALS.gunmetalDeep));
  v.push(...mbox(11, 7, 4, 2, 2, 12, MATERIALS.gunmetalDeep));
  // Crossbar + hub stub the wheel face mounts on.
  v.push(...mbox(3, 7, 16, 10, 2, 2, MATERIALS.gunmetal));
  v.push(...mbox(7, 6, 10, 2, 2, 2, MATERIALS.gunmetalDeep));
  // Lamps up the masts (glow layers land at placement).
  for (const z of [6, 10, 14]) {
    v.push({ x: 2, y: 7, z, c: PALETTE_INT.neonAmber });
    v.push({ x: 13, y: 7, z, c: PALETTE_INT.neonAmber });
  }
  // The pointer perch on top.
  v.push(...mbox(7, 7, 18, 2, 1, 1, MATERIALS.rustDeep));
  v.push({ x: 7, y: 7, z: 19, c: PALETTE_INT.neonRose });
  v.push({ x: 8, y: 7, z: 19, c: PALETTE_INT.neonRose });
  return v;
}

/** A leaning tool rack — the work corner's silhouette. */
function toolrackModel(): Voxel[] {
  const v: Voxel[] = [];
  v.push(...mbox(0, 0, 0, 5, 1, 1, MATERIALS.wood)); // base rail
  v.push(...mbox(0, 0, 4, 5, 1, 1, MATERIALS.wood)); // top rail
  v.push(...mbox(0, 0, 1, 1, 1, 3, MATERIALS.wood)); // uprights
  v.push(...mbox(4, 0, 1, 1, 1, 3, MATERIALS.wood));
  // Hanging tools: gunmetal, rust, and one prized teal-tipped claw.
  v.push({ x: 1, y: 0, z: 3, c: MATERIALS.gunmetal.base, mat: MATERIALS.gunmetal });
  v.push({ x: 1, y: 0, z: 2, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  v.push({ x: 2, y: 0, z: 3, c: MATERIALS.rust.base, mat: MATERIALS.rust });
  v.push({ x: 3, y: 0, z: 3, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
  v.push({ x: 3, y: 0, z: 2, c: PALETTE_INT.neonTeal });
  return v;
}

// ── V2 shape vocabulary: fabric · organic · tall/thin · round-ish ─────────
// The city was all boxes; these four families break the silhouette monotony
// (§12A: silhouette first, materials honest, one accent per prop).

/** FABRIC: a sloped market canopy on timber posts, stash huddled beneath. */
function canopyModel(variant: number): Voxel[] {
  const hot = [
    mixPalette('neonRose', 'structureMid', 0.12),
    mixPalette('neonTeal', 'structureMid', 0.18),
    mixPalette('neonAmber', 'structureMid', 0.1),
  ][variant % 3] as number;
  const pale = mixPalette('warmGlow', 'groundAccent', 0.25);
  const v: Voxel[] = [];
  // Timber posts: tall front pair, short back pair — the cloth slopes.
  for (const [px, py, h] of [
    [1, 1, 9],
    [13, 1, 9],
    [1, 13, 12],
    [13, 13, 12],
  ] as const) {
    v.push(...mbox(px, py, 0, 1, 1, h, MATERIALS.woodDeep));
  }
  // The cloth: striped sheet sagging front-to-back with a ragged hem.
  for (let x = 0; x < 15; x++) {
    for (let y = 0; y < 15; y++) {
      const z = 12 - Math.floor((14 - y) / 6) - (x > 4 && x < 10 && y > 4 && y < 10 ? 1 : 0);
      const edge = x === 0 || y === 0 || x === 14 || y === 14;
      if (edge && (x * 3 + y) % 4 === 0) continue; // ragged hem
      v.push({ x, y, z, c: x % 3 === 0 ? pale : hot });
    }
  }
  // Drip edge hanging off the front bar.
  for (let x = 1; x < 14; x += 2) v.push({ x, y: 0, z: 10, c: hot });
  // The stash beneath: a crate + barrel, half in shade.
  v.push(...mbox(4, 4, 0, 4, 4, 4, MATERIALS.rust));
  v.push(...mbox(9, 6, 0, 3, 3, 4, MATERIALS.wood));
  v.push({ x: 7, y: 4, z: 4, c: PALETTE_INT.neonAmber }); // routing tag
  return v;
}

/** FABRIC + TALL/THIN: a vertical banner hanging from a mast crossarm. */
function bannerModel(variant: number): Voxel[] {
  const cloth = [MATERIALS.paintRose, MATERIALS.paintTeal, MATERIALS.paintOchre][
    variant % 3
  ] as (typeof MATERIALS)['paintRose'];
  const emblem = [PALETTE_INT.neonAmber, PALETTE_INT.neonRose, PALETTE_INT.neonTeal][
    variant % 3
  ] as number;
  const v: Voxel[] = [];
  v.push(...mbox(2, 2, 0, 3, 3, 2, MATERIALS.concreteDeep)); // plinth
  v.push(...mbox(3, 3, 2, 1, 1, 20, MATERIALS.gunmetal)); // mast
  v.push(...mbox(1, 3, 21, 6, 1, 1, MATERIALS.gunmetalDeep)); // crossarm
  // The banner: hangs from the crossarm, swallowtail cut at the foot.
  for (let z = 9; z <= 20; z++) {
    for (let x = 1; x <= 4; x++) {
      if (z === 9 && (x === 2 || x === 3)) continue; // swallowtail
      if (z === 10 && x === 3) continue; // ragged
      const weath = (x + z) % 5 === 0;
      v.push({ x, y: 4, z, c: weath ? shade(cloth.base, -0.14) : cloth.base, mat: weath ? undefined : cloth });
    }
  }
  // The emblem: a two-voxel glyph mid-banner (its one light).
  v.push({ x: 2, y: 5, z: 16, c: emblem });
  v.push({ x: 3, y: 5, z: 15, c: emblem });
  return v;
}

/** FABRIC: a laundry line — two posts, sagging rope, cloth drying. */
function laundryModel(variant: number): Voxel[] {
  const pale = mixPalette('warmGlow', 'groundAccent', 0.3);
  const pieces =
    variant % 2 === 0
      ? [
          { x0: 3, w: 4, drop: 4, mat: MATERIALS.paintTeal },
          { x0: 9, w: 3, drop: 3, mat: null }, // the pale towel
          { x0: 14, w: 4, drop: 5, mat: MATERIALS.paintRose },
          { x0: 19, w: 2, drop: 3, mat: MATERIALS.paintOchre },
        ]
      : [
          { x0: 2, w: 3, drop: 5, mat: MATERIALS.paintRose },
          { x0: 7, w: 4, drop: 3, mat: null },
          { x0: 13, w: 3, drop: 4, mat: MATERIALS.paintOchre },
          { x0: 18, w: 4, drop: 4, mat: MATERIALS.paintTeal },
        ];
  const v: Voxel[] = [];
  v.push(...mbox(0, 3, 0, 1, 1, 10, MATERIALS.woodDeep)); // west post
  v.push(...mbox(23, 3, 0, 1, 1, 10, MATERIALS.woodDeep)); // east post
  // The rope, sagging one voxel mid-span.
  for (let x = 1; x < 23; x++) {
    const z = x > 7 && x < 17 ? 8 : 9;
    v.push({ x, y: 3, z, c: MATERIALS.gunmetalDeep.base });
  }
  // The wash: pieces pinned over the line, hems ragged.
  for (const p of pieces) {
    for (let x = p.x0; x < p.x0 + p.w; x++) {
      const ropeZ = x > 7 && x < 17 ? 8 : 9;
      for (let dz = 1; dz <= p.drop; dz++) {
        if (dz === p.drop && (x + dz) % 3 === 0) continue; // ragged hem
        const c = p.mat === null ? pale : p.mat.base;
        v.push({ x, y: 4, z: ropeZ - dz, c, mat: p.mat ?? undefined });
      }
    }
  }
  return v;
}

/** ORGANIC: a wild bush shouldering up through cracked pavement. */
function wildbushModel(variant: number): Voxel[] {
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.35);
  const v: Voxel[] = [];
  // Broken slab collar.
  for (const vox of mbox(0, 0, 0, 6, 6, 1, MATERIALS.concreteDeep)) {
    if ((vox.x === 2 || vox.x === 3) && (vox.y === 2 || vox.y === 3)) continue; // the crack
    if ((vox.x * 5 + vox.y * 3) % 7 === 0) continue; // crumbled bits
    v.push(vox);
  }
  const puff = (cx: number, cy: number, z: number, r: number) => {
    for (let x = cx - r; x <= cx + r; x++) {
      for (let y = cy - r; y <= cy + r; y++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) > r) continue;
        v.push({ x, y, z, c: (x + y + z) % 2 === 0 ? leafA : leafB });
      }
    }
  };
  if (variant % 3 === 0) {
    // Round and healthy.
    puff(2, 3, 1, 2);
    puff(3, 2, 2, 2);
    puff(2, 3, 3, 1);
    v.push({ x: 3, y: 2, z: 4, c: leafB });
  } else if (variant % 3 === 1) {
    // Leaning into the light, one tall shoot.
    puff(2, 2, 1, 2);
    puff(3, 3, 2, 1);
    for (let z = 3; z < 6; z++) v.push({ x: 4, y: 3, z, c: z % 2 === 0 ? leafA : leafB });
    v.push({ x: 4, y: 4, z: 5, c: leafB });
  } else {
    // Scraggly, grown through a rusted pipe.
    v.push(...mbox(1, 3, 0, 4, 1, 1, MATERIALS.rust)); // the pipe it ate
    puff(3, 3, 1, 1);
    puff(2, 2, 2, 1);
    v.push({ x: 2, y: 4, z: 3, c: leafA });
    v.push({ x: 1, y: 2, z: 3, c: leafB });
  }
  return v;
}

/** ORGANIC: a rusted trellis panel gone green — vines own it now. */
function vinewallModel(variant: number): Voxel[] {
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.35);
  const v: Voxel[] = [];
  // The lattice: uprights + rails, rust-eaten.
  for (const px of [0, 7]) v.push(...mbox(px, 3, 0, 1, 1, 12, MATERIALS.rustDeep));
  for (const z of [3, 7, 11]) {
    for (let x = 1; x < 7; x++) {
      if ((x + z) % 4 === 0) continue; // eaten through
      v.push({ x, y: 3, z, c: MATERIALS.rust.base, mat: MATERIALS.rust });
    }
  }
  // The vine: a diagonal climb with hanging tendrils.
  const mirror = variant % 2 === 1;
  const X = (x: number) => (mirror ? 7 - x : x);
  const climb: Array<[number, number]> = [
    [1, 1], [1, 2], [2, 3], [2, 4], [3, 5], [3, 6], [4, 7], [4, 8], [5, 9], [5, 10], [6, 11], [6, 12],
  ];
  for (const [x, z] of climb) {
    v.push({ x: X(x), y: 4, z, c: (x + z) % 2 === 0 ? leafA : leafB });
    if (z % 3 === 0) v.push({ x: X(x - 1), y: 4, z, c: leafB }); // side sprig
  }
  // Tendrils hanging off the top rail.
  for (const [tx, drop] of [
    [2, 3],
    [5, 2],
    [6, 4],
  ] as const) {
    for (let dz = 0; dz < drop; dz++) {
      v.push({ x: X(tx), y: 4, z: 11 - dz, c: dz % 2 === 0 ? leafB : leafA });
    }
  }
  return v;
}

/** TALL/THIN: a junction signpost, fingerboards pointing three ways. */
function signpostModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  v.push(...mbox(2, 2, 0, 2, 2, 1, MATERIALS.concreteDeep)); // stub base
  v.push(...mbox(2, 2, 1, 1, 1, 17, MATERIALS.woodDeep)); // the pole
  const arm = (z: number, dir: 'px' | 'nx' | 'py', len: number) => {
    if (dir === 'px') v.push(...mbox(3, 2, z, len, 1, 2, MATERIALS.wood));
    else if (dir === 'nx') v.push(...mbox(2 - len, 2, z, len, 1, 2, MATERIALS.wood));
    else v.push(...mbox(2, 3, z, 1, len, 2, MATERIALS.wood));
  };
  if (variant % 2 === 0) {
    arm(14, 'px', 5);
    arm(11, 'nx', 4);
    arm(8, 'py', 4);
  } else {
    arm(14, 'nx', 5);
    arm(11, 'py', 4);
    arm(8, 'px', 4);
  }
  // Painted destination chips on two boards (worn lettering, not neon).
  v.push({ x: variant % 2 === 0 ? 6 : -1, y: 2, z: 15, c: shade(MATERIALS.wood.base, 0.3) });
  v.push({ x: 2, y: 5, z: variant % 2 === 0 ? 9 : 12, c: shade(MATERIALS.wood.base, 0.3) });
  // The junction lamp on top — its one light.
  v.push({ x: 2, y: 2, z: 18, c: PALETTE_INT.neonAmber });
  return v;
}

/** TALL/THIN: a squatter's stovepipe — firebox, flue, rain cap. */
function stovepipeModel(variant: number): Voxel[] {
  const tall = variant % 2 === 0 ? 16 : 13;
  const v: Voxel[] = [];
  // The firebox with an ember slit (emberOrange = the sanctioned accent).
  v.push(...mbox(0, 0, 0, 5, 5, 4, MATERIALS.rustDeep));
  v.push({ x: 2, y: 4, z: 1, c: PALETTE_INT.emberOrange });
  v.push({ x: 3, y: 4, z: 1, c: mixPalette('emberOrange', 'ink', 0.3) });
  // The flue, banded where sections join.
  for (const vox of mbox(1, 1, 4, 2, 2, tall - 4, MATERIALS.gunmetal)) {
    const band = (vox.z - 4) % 5 === 4;
    v.push(band ? { ...vox, c: MATERIALS.rust.base, mat: MATERIALS.rust } : vox);
  }
  // Rain cap.
  v.push(...mbox(0, 0, tall, 4, 4, 1, MATERIALS.gunmetalDeep));
  return v;
}

/** ROUND-ISH: the neighbourhood water tank up on legs (2×2 tiles). */
function watertankModel(): Voxel[] {
  const v: Voxel[] = [];
  const cx = 7.5;
  const cy = 7.5;
  const disc = (z: number, r: number, mat: (typeof MATERIALS)['gunmetal'], hollow = false) => {
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 > r * r) continue;
        if (hollow && d2 < (r - 1.4) * (r - 1.4)) continue;
        v.push({ x, y, z, c: mat.base, mat });
      }
    }
  };
  // Legs on the diagonals + cross-brace.
  for (const [lx, ly] of [
    [3, 3],
    [11, 3],
    [3, 11],
    [11, 11],
  ] as const) {
    v.push(...mbox(lx, ly, 0, 2, 2, 6, MATERIALS.gunmetalDeep));
  }
  v.push(...mbox(4, 7, 3, 8, 1, 1, MATERIALS.gunmetalDeep));
  // The tank: a fat drum with hoop bands and an ochre repaint patch.
  disc(6, 6.4, MATERIALS.gunmetalDeep);
  for (let z = 7; z <= 16; z++) {
    const band = z === 9 || z === 14;
    disc(z, 6.4, band ? MATERIALS.rustDeep : MATERIALS.gunmetal, true);
  }
  // Repaint patch across three courses on the south face.
  for (let z = 10; z <= 12; z++) {
    for (let x = 5; x <= 9; x++) {
      v.push({ x, y: 14, z, c: MATERIALS.paintOchre.base, mat: MATERIALS.paintOchre });
    }
  }
  // Domed cap.
  disc(17, 6.4, MATERIALS.gunmetal);
  disc(18, 4.5, MATERIALS.gunmetal);
  disc(19, 2.5, MATERIALS.gunmetalDeep);
  // Ladder up the east side.
  for (let z = 1; z < 17; z++) {
    if (z % 2 === 0) v.push({ x: 14, y: 7, z, c: MATERIALS.rust.base, mat: MATERIALS.rust });
    v.push({ x: 15, y: 7, z, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  }
  // The level-marker lamp on the cap — its one light.
  v.push({ x: 7, y: 7, z: 20, c: PALETTE_INT.neonAmber });
  return v;
}

// ── V4 unique set pieces: one-offs that make a district THE district ──────

/**
 * The Griddle noodle corner (3×2 tiles): an L-counter, the big round
 * broth pot over a firebox, stools, and a lantern bar. Steam + warm glow
 * land at placement. First thing you smell off the tram.
 */
function griddleModel(): Voxel[] {
  const v: Voxel[] = [];
  // L-counter in worn timber with a lighter top.
  v.push(...mbox(2, 2, 0, 20, 4, 6, MATERIALS.wood));
  v.push(...mbox(2, 6, 0, 5, 8, 6, MATERIALS.wood));
  for (const vox of mbox(2, 2, 6, 20, 4, 1, MATERIALS.wood)) v.push({ ...vox, c: shade(MATERIALS.wood.base, 0.14) });
  for (const vox of mbox(2, 6, 6, 5, 8, 1, MATERIALS.wood)) v.push({ ...vox, c: shade(MATERIALS.wood.base, 0.14) });
  // The POT: fat round drum (corner-cut discs) on a rustDeep firebox.
  v.push(...mbox(14, 6, 0, 6, 6, 3, MATERIALS.rustDeep));
  v.push({ x: 16, y: 11, z: 1, c: PALETTE_INT.emberOrange }); // fire slit
  const potDisc = (z: number, r: number, mat: (typeof MATERIALS)['gunmetal']) => {
    for (let x = 12; x < 23; x++) {
      for (let y = 4; y < 15; y++) {
        const d2 = (x - 17) * (x - 17) + (y - 9) * (y - 9);
        if (d2 <= r * r) v.push({ x, y, z, c: mat.base, mat });
      }
    }
  };
  potDisc(3, 4.4, MATERIALS.gunmetal);
  potDisc(4, 4.4, MATERIALS.gunmetal);
  potDisc(5, 4.4, MATERIALS.gunmetalDeep);
  potDisc(6, 4.2, MATERIALS.gunmetal);
  // Broth glimmer at the rim + the ladle.
  v.push({ x: 15, y: 8, z: 7, c: mixPalette('warmGlow', 'neonAmber', 0.3) });
  v.push({ x: 17, y: 10, z: 7, c: mixPalette('warmGlow', 'neonAmber', 0.4) });
  v.push(...mbox(20, 6, 7, 1, 1, 3, MATERIALS.woodDeep)); // ladle handle
  // Stools along the counter's front.
  for (const sx of [4, 10, 16]) {
    v.push(...mbox(sx, 0, 0, 2, 1, 3, MATERIALS.woodDeep));
  }
  // Lantern bar overhead: two posts, a beam, three warm lantern voxels.
  v.push(...mbox(1, 5, 0, 1, 1, 12, MATERIALS.woodDeep));
  v.push(...mbox(22, 5, 0, 1, 1, 12, MATERIALS.woodDeep));
  v.push(...mbox(1, 5, 12, 22, 1, 1, MATERIALS.woodDeep));
  for (const lx of [5, 12, 19]) {
    v.push({ x: lx, y: 5, z: 11, c: PALETTE_INT.warmGlow });
    v.push({ x: lx, y: 5, z: 10, c: mixPalette('warmGlow', 'neonAmber', 0.5) });
  }
  // The menu board — ink with two neon strokes.
  v.push(...box(3, 6, 8, 3, 1, 3, mixPalette('ink', 'structureMid', 0.2)));
  v.push({ x: 4, y: 6, z: 10, c: PALETTE_INT.neonRose });
  v.push({ x: 4, y: 6, z: 9, c: PALETTE_INT.neonAmber });
  return v;
}

/**
 * The retired tram car (4×2 tiles): a carriage on a stub of siding —
 * gunmetal shell, ochre stripe, dead pantograph, one squatter-lit window.
 */
function tramcarModel(): Voxel[] {
  const v: Voxel[] = [];
  // The siding: two rails on sleepers.
  for (let x = 0; x < 32; x += 3) v.push(...mbox(x, 4, 0, 2, 8, 1, MATERIALS.woodDeep));
  for (const ry of [5, 10]) {
    for (let x = 0; x < 32; x++) v.push({ x, y: ry, z: 1, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  }
  // Bogies + shell.
  v.push(...mbox(4, 6, 1, 5, 4, 2, MATERIALS.gunmetalDeep));
  v.push(...mbox(23, 6, 1, 5, 4, 2, MATERIALS.gunmetalDeep));
  for (const vox of mbox(2, 4, 3, 28, 8, 9, MATERIALS.gunmetal)) {
    // The ochre waistline stripe + rust blooming on the skirt.
    if (vox.z === 5) v.push({ ...vox, c: MATERIALS.paintOchre.base, mat: MATERIALS.paintOchre });
    else if (vox.z === 3 && vox.x % 5 < 2) v.push({ ...vox, c: MATERIALS.rust.base, mat: MATERIALS.rust });
    else v.push(vox);
  }
  // Rounded cab ends (stepped).
  v.push(...mbox(0, 5, 4, 2, 6, 7, MATERIALS.gunmetal));
  v.push(...mbox(30, 5, 4, 2, 6, 7, MATERIALS.gunmetal));
  // Window band: dark glass, ONE lit from inside (somebody lives here).
  for (let x = 4; x < 28; x += 4) {
    const lit = x === 16;
    v.push(...box(x, 12, 7, 3, 0, 3, lit ? PALETTE_INT.warmGlow : mixPalette('ink', 'structureMid', 0.35)));
  }
  // Roof: conduit spine, vents, and the dead pantograph folded down.
  v.push(...mbox(2, 4, 12, 28, 8, 1, MATERIALS.gunmetalDeep));
  v.push(...mbox(6, 7, 13, 20, 2, 1, MATERIALS.gunmetal));
  v.push(...mbox(10, 6, 13, 2, 4, 1, MATERIALS.rustDeep));
  v.push(...mbox(14, 7, 14, 6, 1, 1, MATERIALS.gunmetalDeep)); // folded pantograph
  v.push(...mbox(16, 7, 13, 2, 1, 1, MATERIALS.gunmetalDeep));
  // Door (aft, +y face) + route chip still glowing faintly.
  v.push(...mbox(26, 12, 3, 3, 0, 6, MATERIALS.gunmetalDeep));
  v.push({ x: 3, y: 12, z: 9, c: PALETTE_INT.neonCyan }); // route number chip
  return v;
}

/**
 * The scrap fountain (2×2 tiles): a concrete basin with a welded-scrap
 * spire, coolant trickling teal. The city's oddest little monument.
 */
function fountainModel(): Voxel[] {
  const v: Voxel[] = [];
  const basin = (z: number, r: number, hollow: boolean) => {
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        const d2 = (x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5);
        if (d2 > r * r) continue;
        if (hollow && d2 < (r - 1.6) * (r - 1.6)) continue;
        v.push({ x, y, z, c: MATERIALS.concrete.base, mat: MATERIALS.concrete });
      }
    }
  };
  basin(0, 7.4, false);
  basin(1, 7.4, true);
  basin(2, 7.4, true);
  // The coolant pool surface inside the rim.
  const pool = mixPalette('neonTeal', 'ink', 0.55);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      const d2 = (x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5);
      if (d2 <= 5.8 * 5.8) v.push({ x, y, z: 1, c: (x + y) % 3 === 0 ? mixPalette('neonTeal', 'ink', 0.35) : pool });
    }
  }
  // The welded spire: scrap odds stacked into a monument.
  v.push(...mbox(6, 6, 2, 4, 4, 3, MATERIALS.rustDeep));
  v.push(...mbox(7, 6, 5, 3, 3, 3, MATERIALS.gunmetal));
  v.push(...mbox(7, 7, 8, 2, 2, 3, MATERIALS.rust));
  v.push(...mbox(6, 7, 6, 1, 1, 4, MATERIALS.gunmetalDeep)); // a welded strut
  v.push(...mbox(9, 8, 10, 1, 1, 2, MATERIALS.rustDeep));
  // The spout stream: teal falling from the crown to the pool.
  v.push({ x: 8, y: 8, z: 12, c: PALETTE_INT.neonTeal });
  v.push({ x: 8, y: 9, z: 11, c: mixPalette('neonTeal', 'ink', 0.2) });
  v.push({ x: 8, y: 10, z: 9, c: mixPalette('neonTeal', 'ink', 0.3) });
  v.push({ x: 8, y: 11, z: 6, c: mixPalette('neonTeal', 'ink', 0.35) });
  v.push({ x: 8, y: 11, z: 3, c: mixPalette('neonTeal', 'ink', 0.3) });
  return v;
}

/**
 * A Draymule up on blocks (2×2 tiles, Tangle): somebody's pack-hauler
 * mid-repair — legs off, panels open, work light rigged on a pole.
 */
function draymuleModel(): Voxel[] {
  const v: Voxel[] = [];
  // The blocks it sits on.
  v.push(...mbox(3, 4, 0, 3, 3, 4, MATERIALS.concreteDeep));
  v.push(...mbox(11, 4, 0, 3, 3, 4, MATERIALS.concreteDeep));
  v.push(...mbox(3, 10, 0, 3, 3, 4, MATERIALS.concreteDeep));
  v.push(...mbox(11, 10, 0, 3, 3, 4, MATERIALS.concreteDeep));
  // The body: a rust barrel-chest with an open gunmetal panel.
  for (const vox of mbox(2, 4, 4, 13, 9, 7, MATERIALS.rust)) {
    const openPanel = vox.x > 7 && vox.x < 12 && vox.y === 4 && vox.z > 5;
    if (openPanel) continue; // panel removed — you see the dark innards
    v.push(vox);
  }
  v.push(...box(8, 5, 6, 4, 0, 4, mixPalette('ink', 'structureMid', 0.25))); // innards
  v.push(...mbox(8, 5, 7, 1, 1, 1, MATERIALS.gunmetalDeep)); // a loose coil
  // The head: drooped, dead eyes (ink — rose stays reserved for mobs).
  v.push(...mbox(0, 6, 6, 3, 5, 4, MATERIALS.rustDeep));
  v.push(...mbox(-1, 7, 5, 2, 3, 2, MATERIALS.rustDeep)); // the muzzle, drooped
  v.push({ x: 0, y: 6, z: 8, c: mixPalette('ink', 'structureMid', 0.4) });
  v.push({ x: 0, y: 10, z: 8, c: mixPalette('ink', 'structureMid', 0.4) });
  // Ears/antennae flopped.
  v.push({ x: 1, y: 6, z: 10, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  v.push({ x: 1, y: 10, z: 10, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  // One leg still bolted on, three stubs; the removed leg leans on a block.
  v.push(...mbox(4, 5, 2, 2, 2, 2, MATERIALS.gunmetalDeep));
  v.push(...mbox(13, 11, 1, 2, 2, 3, MATERIALS.gunmetalDeep)); // leaning leg
  // The cargo saddle rails still mounted.
  v.push(...mbox(4, 6, 11, 9, 1, 1, MATERIALS.woodDeep));
  v.push(...mbox(4, 10, 11, 9, 1, 1, MATERIALS.woodDeep));
  // Work light on a pole + tool tray (amber lamp voxel; glow at placement).
  v.push(...mbox(15, 13, 0, 1, 1, 9, MATERIALS.gunmetal));
  v.push({ x: 15, y: 13, z: 9, c: PALETTE_INT.neonAmber });
  v.push(...mbox(0, 13, 0, 4, 2, 1, MATERIALS.wood));
  v.push({ x: 1, y: 13, z: 1, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
  v.push({ x: 3, y: 14, z: 1, c: MATERIALS.rustDeep.base, mat: MATERIALS.rustDeep });
  return v;
}

/**
 * The container spill (3×2 tiles, Tangle): a wall gave way — one box
 * nose-down against another, cargo thrown across the lane.
 */
function spillModel(): Voxel[] {
  const v: Voxel[] = [];
  // The upright survivor.
  for (const vox of mbox(0, 2, 0, 6, 4, 5, MATERIALS.gunmetalDeep)) {
    const ridged = vox.x % 2 === 1 && (vox.y === 2 || vox.y === 5);
    v.push(ridged ? { ...vox, c: shade(MATERIALS.gunmetalDeep.base, -0.16) } : vox);
  }
  // The faller: nose-down at a diagonal — stepped voxel courses.
  for (let i = 0; i < 7; i++) {
    const z = Math.max(0, 6 - i);
    v.push(...mbox(6 + i * 2, 3, z, 2, 4, 3, i % 3 === 0 ? MATERIALS.rustDeep : MATERIALS.rust));
  }
  // Burst door + thrown cargo.
  v.push(...mbox(19, 2, 0, 1, 3, 2, MATERIALS.rustDeep)); // the door, flat
  v.push(...mbox(20, 6, 0, 3, 3, 3, MATERIALS.wood)); // crate thrown clear
  v.push(...mbox(17, 9, 0, 2, 2, 2, MATERIALS.rust));
  v.push(...mbox(21, 10, 0, 2, 2, 1, MATERIALS.gunmetalDeep)); // spilled plate
  v.push({ x: 20, y: 6, z: 3, c: PALETTE_INT.neonAmber }); // cargo tag
  // Hazard chevrons on the survivor's top rail (the warning came late).
  for (let x = 0; x < 6; x += 2) v.push({ x, y: 2, z: 5, c: PALETTE_INT.emberOrange });
  return v;
}

/**
 * V5: a low guard rail for drops — rusted double bar on gunmetal posts,
 * one tile long. Variant 0 runs along x, 1 along y (transposed).
 */
function guardrailModel(alongY: boolean): Voxel[] {
  const v: Voxel[] = [];
  const put = (x: number, y: number, z: number, mat: (typeof MATERIALS)['rust']) => {
    v.push(
      alongY
        ? { x: y, y: x, z, c: mat.base, mat }
        : { x, y, z, c: mat.base, mat },
    );
  };
  for (const px of [0, 7]) {
    for (let z = 0; z < 5; z++) put(px, 3, z, MATERIALS.gunmetalDeep);
  }
  for (let x = 0; x < 8; x++) {
    put(x, 3, 4, MATERIALS.rust); // top bar
    if (x % 2 === 0) put(x, 3, 2, MATERIALS.rustDeep); // mid bar, gappy
  }
  return v;
}

// ── D1 THE STACKS: towers, the Spire, and the street furniture ────────────
// Towers are BLOCKING WORLD OBJECTS, never interiors (§5 amendment). Their
// windows bake dark-or-lit deterministically; the client overlays a slow
// light/dim shimmer on the lit ones (and the Charge meter scales it, D3).

const TOWER_DESIGNS = 4;
const TOWER_PAINTS = [MATERIALS.paintTeal, MATERIALS.paintOchre, MATERIALS.paintRose] as const;
/** Stories per design — every design a different height band. */
const TOWER_STORIES = [5, 7, 6, 9] as const;
const STORY_H = 6;
const PLINTH_H = 3;
/** The special one-per-city rooftop-garden tower (map variant 12). */
export const TOWER_GARDEN_VARIANT = 12;

export interface TowerWindow {
  /** Screen-px offset from the placed sprite's anchor (display scale). */
  dx: number;
  dy: number;
  lit: boolean;
}

interface TowerSpec {
  voxels: Voxel[];
  windows: TowerWindow[];
}

/**
 * One tower: body, skin, windows, and its DISTINCT roofline (§12B: tanks,
 * antenna clusters, tarp shanties, one garden). Returns the voxels and the
 * window list (same generator = model and glow overlay always agree).
 */
function towerSpec(variant: number): TowerSpec {
  const garden = variant === TOWER_GARDEN_VARIANT;
  const design = garden ? 0 : Math.floor(variant / 3) % TOWER_DESIGNS;
  const paint = TOWER_PAINTS[variant % 3] as (typeof MATERIALS)['paintTeal'];
  const stories = TOWER_STORIES[design] as number;
  // Footprint: 4×4 tiles = 32 voxels; bodies inset for silhouette variety.
  const W = design === 3 ? 24 : 30;
  const D = design === 3 ? 24 : 30;
  const off = Math.floor((32 - W) / 2);
  const v: Voxel[] = [];
  const windows: TowerWindow[] = [];
  const cx = 31 / 2; // anchor center of the full 32-voxel footprint
  const cy = 31 / 2;
  const toScreen = (vx: number, vy: number, vz: number): [number, number] => [
    (vx - vy - (cx - cy)) * 4,
    (vx + vy - (cx + cy)) * 2 - vz * 4 - 6,
  ];

  // Plinth: concrete, full footprint feel.
  v.push(...mbox(off, off, 0, W, D, PLINTH_H, MATERIALS.concreteDeep));
  const topZ = PLINTH_H + stories * STORY_H;

  // Body walls (hollow — only shells render anyway, but keep voxel count sane).
  const skinAt = (vx: number, vy: number, vz: number): Material => {
    const story = Math.floor((vz - PLINTH_H) / STORY_H);
    switch (design) {
      case 0: // painted panel stories over gunmetal
        return story % 2 === 0 ? paint : MATERIALS.gunmetal;
      case 1: // gunmetal shaft with a painted waist band
        return story === 2 || story === 3 ? paint : MATERIALS.gunmetal;
      case 2: // painted base floors, concrete above
        return story < 2 ? paint : MATERIALS.concrete;
      default: // slender: gunmetal with painted corner columns
        return (vx < off + 2 || vx >= off + W - 2) && (vy < off + 2 || vy >= off + D - 2)
          ? paint
          : MATERIALS.gunmetalDeep;
    }
  };
  const setback = design === 2 ? 2 : 0; // top floors step back on design 2
  for (let vz = PLINTH_H; vz < topZ; vz++) {
    const story = Math.floor((vz - PLINTH_H) / STORY_H);
    const inset = setback > 0 && story >= stories - 2 ? 3 : 0;
    const x0 = off + inset;
    const y0 = off + inset;
    const x1 = off + W - 1 - inset;
    const y1 = off + D - 1 - inset;
    for (let vx = x0; vx <= x1; vx++) {
      for (let vy = y0; vy <= y1; vy++) {
        const shell = vx === x0 || vx === x1 || vy === y0 || vy === y1;
        if (!shell) continue;
        const mat = skinAt(vx, vy, vz);
        v.push({ x: vx, y: vy, z: vz, c: mat.base, mat });
      }
    }
    // Window rows: mid-story, on the two camera-facing faces (+y and +x).
    const inStoryZ = (vz - PLINTH_H) % STORY_H;
    if (inStoryZ === 2 || inStoryZ === 3) {
      for (let vx = x0 + 3; vx <= x1 - 3; vx += 4) {
        for (const wx of [vx, vx + 1]) {
          const lit = voxelHash(vx, story, variant * 7 + 1) < 0.42;
          const c = lit
            ? mixPalette('warmGlow', 'neonAmber', 0.25)
            : mixPalette('ink', 'structureMid', 0.4);
          v.push({ x: wx, y: y1, z: vz, c });
          if (inStoryZ === 2 && wx === vx) {
            const [dx, dy] = toScreen(wx + 0.5, y1, vz + 0.5);
            windows.push({ dx, dy, lit });
          }
        }
      }
      for (let vy = y0 + 3; vy <= y1 - 3; vy += 4) {
        for (const wy of [vy, vy + 1]) {
          const lit = voxelHash(story, vy, variant * 7 + 2) < 0.42;
          const c = lit
            ? mixPalette('warmGlow', 'neonAmber', 0.25)
            : mixPalette('ink', 'structureMid', 0.4);
          v.push({ x: x1, y: wy, z: vz, c });
          if (inStoryZ === 2 && wy === vy) {
            const [dx, dy] = toScreen(x1, wy + 0.5, vz + 0.5);
            windows.push({ dx, dy, lit });
          }
        }
      }
    }
  }

  // Roof slab.
  const rInset = setback > 0 ? 3 : 0;
  v.push(...mbox(off + rInset, off + rInset, topZ, W - rInset * 2, D - rInset * 2, 1, MATERIALS.gunmetalDeep));
  const rz = topZ + 1;

  // ── the DISTINCT rooflines ──────────────────────────────────────────────
  if (garden) {
    // THE rooftop garden (one per city): planter rows, green, glow-fruit.
    for (const gy of [off + 4, off + 12, off + 20]) {
      v.push(...mbox(off + 3, gy, rz, W - 6, 3, 2, MATERIALS.wood));
      for (let gx = off + 4; gx < off + W - 4; gx += 2) {
        const leaf = (gx + gy) % 4 === 0 ? PALETTE_INT.solarGreen : mixPalette('solarGreen', 'ink', 0.3);
        v.push({ x: gx, y: gy + 1, z: rz + 2, c: leaf });
        if ((gx * 3 + gy) % 7 === 0) v.push({ x: gx, y: gy + 1, z: rz + 3, c: mixPalette('neonAmber', 'solarGreen', 0.4) });
      }
    }
    v.push(...mbox(off + 2, off + 7, rz, 1, 1, 6, MATERIALS.woodDeep)); // trellis post
    v.push(...mbox(off + W - 3, off + 7, rz, 1, 1, 6, MATERIALS.woodDeep));
    for (let gx = off + 2; gx <= off + W - 3; gx++) v.push({ x: gx, y: off + 7, z: rz + 6, c: MATERIALS.woodDeep.base });
  } else if (design === 0) {
    // Parapet + the water tank + a pipe.
    for (let px = off; px < off + W; px += 2) {
      v.push({ x: px, y: off, z: rz, c: MATERIALS.concrete.base, mat: MATERIALS.concrete });
      v.push({ x: px, y: off + D - 1, z: rz, c: MATERIALS.concrete.base, mat: MATERIALS.concrete });
    }
    for (let z2 = rz; z2 < rz + 6; z2++) {
      for (let tx = off + 4; tx < off + 11; tx++) {
        for (let ty = off + 4; ty < off + 11; ty++) {
          const d2 = (tx - off - 7) ** 2 + (ty - off - 7) ** 2;
          if (d2 <= 10 && d2 >= (z2 > rz && z2 < rz + 5 ? 5 : 0)) {
            const band = z2 === rz + 2;
            v.push({ x: tx, y: ty, z: z2, c: band ? MATERIALS.rustDeep.base : MATERIALS.gunmetal.base, mat: band ? MATERIALS.rustDeep : MATERIALS.gunmetal });
          }
        }
      }
    }
    v.push(...mbox(off + 20, off + 6, rz, 2, 2, 4, MATERIALS.gunmetal)); // pipe
  } else if (design === 1) {
    // The antenna cluster: three whips + a dish.
    for (const [ax, ay, h] of [
      [off + 5, off + 5, 12],
      [off + 14, off + 8, 9],
      [off + 22, off + 4, 14],
    ] as const) {
      for (let z2 = rz; z2 < rz + h; z2++) v.push({ x: ax, y: ay, z: z2, c: MATERIALS.gunmetal.base, mat: MATERIALS.gunmetal });
      v.push({ x: ax, y: ay, z: rz + h, c: PALETTE_INT.neonAmber });
    }
    v.push(...mbox(off + 10, off + 18, rz, 5, 1, 5, MATERIALS.gunmetalDeep));
    v.push(...mbox(off + 9, off + 18, rz + 5, 7, 1, 2, MATERIALS.gunmetal)); // the dish
  } else if (design === 2) {
    // The setback terrace carries a tarp shanty + a crate + a wash line.
    const cloth = mixPalette('neonRose', 'structureMid', 0.3);
    v.push(...mbox(off + 4, off + 4, rz, 3, 3, 3, MATERIALS.rust)); // crate stack
    for (let sx = off + 10; sx < off + 18; sx++) {
      v.push({ x: sx, y: off + 6, z: rz + 4 - (sx % 2), c: cloth });
      v.push({ x: sx, y: off + 9, z: rz + 3, c: cloth });
    }
    v.push(...mbox(off + 10, off + 6, rz, 1, 1, 4, MATERIALS.woodDeep));
    v.push(...mbox(off + 17, off + 6, rz, 1, 1, 4, MATERIALS.woodDeep));
  } else {
    // The slender crown: railing + stair hut + cable stubs.
    for (let px = off; px < off + W; px += 2) {
      v.push({ x: px, y: off, z: rz, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
      v.push({ x: px, y: off + D - 1, z: rz, c: MATERIALS.gunmetalDeep.base, mat: MATERIALS.gunmetalDeep });
    }
    v.push(...mbox(off + 3, off + 3, rz, 6, 6, 5, MATERIALS.concrete)); // stair hut
    v.push(...mbox(off + 14, off + 14, rz, 2, 2, 7, MATERIALS.gunmetal)); // mast stub
    v.push({ x: off + 14, y: off + 14, z: rz + 7, c: PALETTE_INT.neonAmber });
  }
  return { voxels: v, windows };
}

/** The lit-window overlay anchors for a tower variant (client shimmer). */
export function towerWindows(variant: number): TowerWindow[] {
  return towerSpec(variant).windows;
}

/** THE SIGNAL SPIRE — the city's tallest mast, slow red crown beacon. */
function spireModel(): Voxel[] {
  const gm = MATERIALS.gunmetal;
  const gmd = MATERIALS.gunmetalDeep;
  const v: Voxel[] = [];
  v.push(...mbox(2, 2, 0, 20, 20, 3, MATERIALS.concreteDeep)); // plinth
  v.push(...mbox(6, 6, 3, 12, 12, 3, MATERIALS.concrete)); // machine base
  // Four lattice legs tapering to a single column.
  for (let z = 6; z < 34; z++) {
    const pinch = Math.floor((z - 6) / 8); // legs lean inward with height
    for (const [lx, ly] of [
      [8 + pinch, 8 + pinch],
      [15 - pinch, 8 + pinch],
      [8 + pinch, 15 - pinch],
      [15 - pinch, 15 - pinch],
    ] as const) {
      v.push({ x: lx, y: ly, z, c: z % 2 === 0 ? gm.base : gmd.base, mat: z % 2 === 0 ? gm : gmd });
    }
    if (z % 7 === 3) {
      v.push(...mbox(9 + pinch, 8 + pinch, z, 5 - pinch * 2 < 1 ? 1 : 6 - pinch * 2, 1, 1, gmd));
      v.push(...mbox(8 + pinch, 9 + pinch, z, 1, 5 - pinch * 2 < 1 ? 1 : 6 - pinch * 2, 1, gmd));
    }
  }
  // The single spine above the legs.
  for (let z = 34; z < 62; z++) {
    v.push(...mbox(11, 11, z, 2, 2, 1, z % 9 < 2 ? MATERIALS.rust : gm));
  }
  // Dishes + boxes on the way up.
  v.push(...mbox(9, 10, 40, 2, 4, 3, gmd));
  v.push(...mbox(13, 11, 50, 3, 2, 2, gmd));
  // The crown: platform + the slow red beacon (glow added at placement).
  v.push(...mbox(9, 9, 62, 6, 6, 1, gmd));
  v.push(...mbox(11, 11, 63, 2, 2, 3, gm));
  v.push({ x: 11, y: 11, z: 66, c: hexToInt(PALETTE.signalRed) });
  v.push({ x: 12, y: 11, z: 66, c: hexToInt(PALETTE.signalRed) });
  return v;
}

/** The vanity registry office — the street's one licensed violet sign. */
function registryModel(): Voxel[] {
  const v: Voxel[] = [];
  // Formal two-storey shopfront: gunmetal frame, glazed front, brass door.
  for (const vox of mbox(0, 0, 0, 30, 22, 16, MATERIALS.gunmetal)) {
    const band = vox.z === 8 || vox.z === 9;
    v.push(band ? { ...vox, c: MATERIALS.paintOchre.base, mat: MATERIALS.paintOchre } : vox);
  }
  v.push(...mbox(-1, -1, 16, 32, 24, 1, MATERIALS.gunmetalDeep)); // roof slab
  v.push(...mbox(4, 4, 17, 4, 4, 3, MATERIALS.concrete)); // roof hut
  // The glazed front (lit — somebody is always on shift).
  for (let gx = 4; gx <= 24; gx += 1) {
    for (let gz = 3; gz <= 6; gz++) {
      if (gx % 6 === 0) continue; // mullions
      v.push({ x: gx, y: 21, z: gz, c: gx % 3 === 0 ? mixPalette('warmGlow', 'neonAmber', 0.35) : mixPalette('ink', 'structureMid', 0.45) });
    }
  }
  v.push(...mbox(12, 21, 0, 4, 1, 7, MATERIALS.woodDeep)); // the door
  v.push({ x: 13, y: 21, z: 4, c: PALETTE_INT.neonAmber }); // brass plate
  // The violet sign board over the door — one per street, licensed.
  v.push(...box(9, 21, 10, 11, 1, 3, mixPalette('ink', 'structureMid', 0.2)));
  for (const sx of [11, 13, 15, 17]) {
    v.push({ x: sx, y: 21, z: 11 + (sx % 2), c: PALETTE_INT.violetNeon });
  }
  return v;
}

/** The junction noodle cart — a griddle on wheels, steam at placement. */
function noodlecartModel(): Voxel[] {
  const v: Voxel[] = [];
  v.push(...mbox(1, 1, 2, 14, 6, 5, MATERIALS.wood)); // cart body
  for (const vox of mbox(1, 1, 7, 14, 6, 1, MATERIALS.wood)) v.push({ ...vox, c: shade(MATERIALS.wood.base, 0.14) });
  // Wheels.
  for (const wx of [2, 12]) {
    v.push(...mbox(wx, 0, 0, 3, 1, 3, MATERIALS.gunmetalDeep));
    v.push(...mbox(wx, 7, 0, 3, 1, 3, MATERIALS.gunmetalDeep));
  }
  // The pot + the ember box.
  v.push(...mbox(3, 2, 8, 4, 4, 3, MATERIALS.gunmetal));
  v.push({ x: 4, y: 3, z: 11, c: mixPalette('warmGlow', 'neonAmber', 0.3) }); // broth
  v.push({ x: 5, y: 6, z: 3, c: PALETTE_INT.emberOrange });
  // Canopy on poles: a small striped hood.
  v.push(...mbox(0, 3, 2, 1, 1, 12, MATERIALS.woodDeep));
  v.push(...mbox(15, 3, 2, 1, 1, 12, MATERIALS.woodDeep));
  const hot = mixPalette('neonRose', 'structureMid', 0.12);
  const pale = mixPalette('warmGlow', 'groundAccent', 0.25);
  for (let hx = 0; hx < 16; hx++) {
    for (let hy = 1; hy < 8; hy++) v.push({ x: hx, y: hy, z: 14, c: hx % 2 === 0 ? hot : pale });
  }
  v.push({ x: 14, y: 6, z: 12, c: PALETTE_INT.warmGlow }); // lantern
  return v;
}

/** The junction's one tree: a real canopy in a concrete ring. */
function treeplanterModel(): Voxel[] {
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.3);
  const v: Voxel[] = [];
  for (const vox of mbox(2, 2, 0, 12, 12, 3, MATERIALS.concrete)) {
    const hollow = vox.z === 2 && vox.x > 3 && vox.x < 12 && vox.y > 3 && vox.y < 12;
    if (!hollow) v.push(vox);
  }
  v.push(...mbox(6, 6, 2, 3, 3, 2, MATERIALS.woodDeep)); // root ball
  for (let z = 4; z < 12; z++) v.push(...mbox(7, 7, z, 2, 2, 1, MATERIALS.woodDeep)); // trunk
  // Canopy puffs (three lobes — a TREE silhouette, the district's only one).
  const puff = (cx2: number, cy2: number, cz: number, r: number) => {
    for (let px = cx2 - r; px <= cx2 + r; px++) {
      for (let py = cy2 - r; py <= cy2 + r; py++) {
        for (let pz = cz - 1; pz <= cz + 1; pz++) {
          if (Math.abs(px - cx2) + Math.abs(py - cy2) + Math.abs(pz - cz) > r + 1) continue;
          v.push({ x: px, y: py, z: pz, c: (px + py + pz) % 2 === 0 ? leafA : leafB });
        }
      }
    }
  };
  puff(8, 8, 13, 4);
  puff(5, 9, 11, 3);
  puff(11, 6, 12, 3);
  v.push({ x: 8, y: 10, z: 15, c: PALETTE_INT.warmGlow }); // one string-light bulb
  return v;
}

/** A rooftop tarp shanty — somebody lives up here too. */
function shantyModel(): Voxel[] {
  const cloth = mixPalette('neonTeal', 'structureMid', 0.35);
  const v: Voxel[] = [];
  v.push(...mbox(1, 1, 0, 6, 5, 4, MATERIALS.rust)); // crate wall
  v.push(...mbox(9, 2, 0, 4, 3, 2, MATERIALS.wood)); // the bedroll base
  for (let sx = 0; sx < 14; sx++) {
    const z = 6 - Math.floor(sx / 5);
    v.push({ x: sx, y: 1, z, c: cloth });
    v.push({ x: sx, y: 4, z: z - 1, c: cloth });
    v.push({ x: sx, y: 7, z: z - 2, c: cloth });
  }
  v.push(...mbox(0, 3, 0, 1, 1, 6, MATERIALS.woodDeep));
  v.push(...mbox(13, 3, 0, 1, 1, 5, MATERIALS.woodDeep));
  v.push({ x: 11, y: 3, z: 2, c: PALETTE_INT.warmGlow }); // their lamp
  return v;
}

// ── D2 THE TERRARIUM: the Mother Trellis, crop beds, sheds, compost ──────

/**
 * The MOTHER TRELLIS — a towering vine-wrapped irrigation frame with
 * glow-fruit strung through the lattice. The district's heart and lamp.
 */
function mothertrellisModel(): Voxel[] {
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.35);
  const fruit = mixPalette('neonAmber', 'solarGreen', 0.35);
  const v: Voxel[] = [];
  // Deck plinth + four heavy timber legs.
  v.push(...mbox(2, 2, 0, 28, 28, 2, MATERIALS.wood));
  for (const [lx, ly] of [
    [4, 4], [25, 4], [4, 25], [25, 25],
  ] as const) {
    v.push(...mbox(lx, ly, 2, 3, 3, 42, MATERIALS.woodDeep));
  }
  // Cross-beams every eight courses + the crown cistern.
  for (const bz of [12, 22, 32, 42]) {
    v.push(...mbox(4, 4, bz, 24, 3, 2, MATERIALS.woodDeep));
    v.push(...mbox(4, 25, bz, 24, 3, 2, MATERIALS.woodDeep));
    v.push(...mbox(4, 7, bz, 3, 18, 2, MATERIALS.woodDeep));
    v.push(...mbox(25, 7, bz, 3, 18, 2, MATERIALS.woodDeep));
  }
  v.push(...mbox(10, 10, 44, 12, 12, 5, MATERIALS.gunmetal)); // the cistern
  v.push(...mbox(9, 9, 49, 14, 14, 1, MATERIALS.gunmetalDeep));
  // Drip lines falling from the cistern to the beds below.
  for (const [dx2, dy2] of [
    [12, 14], [19, 14], [14, 19], [17, 17],
  ] as const) {
    for (let z = 12; z < 44; z += 2) v.push({ x: dx2, y: dy2, z, c: MATERIALS.gunmetalDeep.base });
  }
  // THE VINES: climbing every leg and beam, hash-scattered.
  for (const [lx, ly] of [
    [4, 4], [25, 4], [4, 25], [25, 25],
  ] as const) {
    for (let z = 2; z < 44; z++) {
      const h = voxelHash(lx + z, ly, 51);
      if (h < 0.6) {
        const side = h < 0.3 ? -1 : 3;
        v.push({ x: lx + (side === -1 ? -1 : 3), y: ly + (z % 3), z, c: z % 2 === 0 ? leafA : leafB });
      }
    }
  }
  for (const bz of [12, 22, 32, 42]) {
    for (let x = 5; x < 27; x += 2) {
      if (voxelHash(x, bz, 52) < 0.55) {
        v.push({ x, y: 4 + (x % 3), z: bz + 2, c: (x + bz) % 2 === 0 ? leafA : leafB });
        // Hanging tendrils off the beams.
        if (voxelHash(x, bz, 53) < 0.3) {
          for (let d = 1; d <= 2 + (x % 3); d++) v.push({ x, y: 5, z: bz - d, c: leafB });
        }
      }
    }
  }
  // GLOW-FRUIT clusters — the district's lamps (glows land at placement).
  for (const [fx2, fy2, fz2] of [
    [8, 5, 20], [24, 6, 30], [6, 24, 26], [22, 26, 38], [15, 5, 41], [10, 26, 14],
  ] as const) {
    v.push({ x: fx2, y: fy2, z: fz2, c: fruit });
    v.push({ x: fx2 + 1, y: fy2, z: fz2 - 1, c: fruit });
    v.push({ x: fx2, y: fy2 + 1, z: fz2 - 2, c: mixPalette('neonAmber', 'solarGreen', 0.15) });
  }
  return v;
}

/** A raised crop bed (2×1): wood frame, dark soil, rows per variant. */
function gardenbedModel(variant: number): Voxel[] {
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.3);
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 16, 8, 3, MATERIALS.wood)) {
    const soil = vox.z === 2 && vox.x > 0 && vox.x < 15 && vox.y > 0 && vox.y < 7;
    if (soil) v.push({ ...vox, c: shade(MATERIALS.woodDeep.base, -0.25) });
    else v.push(vox);
  }
  for (let x = 2; x < 15; x += 2) {
    for (const y of [2, 5]) {
      if (variant === 0) {
        v.push({ x, y, z: 3, c: (x + y) % 4 === 0 ? leafA : leafB }); // sprouts
      } else if (variant === 1) {
        v.push({ x, y, z: 3, c: leafB }); // leafy rows
        v.push({ x, y, z: 4, c: leafA });
      } else {
        v.push({ x, y, z: 3, c: leafA }); // flowering (one warm head each)
        if ((x + y) % 6 === 0) v.push({ x, y, z: 4, c: mixPalette('neonAmber', 'solarGreen', 0.3) });
      }
    }
  }
  return v;
}

/** The gardeners' tool shed (2×2): slant roof, door, pots at the side. */
function toolshedModel(variant: number): Voxel[] {
  const v: Voxel[] = [];
  for (const vox of mbox(1, 1, 0, 13, 11, 8, MATERIALS.wood)) {
    v.push(vox);
  }
  // Slant roof falling front-ward.
  for (let y = 0; y < 13; y++) {
    const z = 10 - Math.floor(y / 4);
    for (let x = 0; x < 15; x++) {
      v.push({
        x, y, z,
        c: variant === 0 ? MATERIALS.gunmetalDeep.base : MATERIALS.rustDeep.base,
        mat: variant === 0 ? MATERIALS.gunmetalDeep : MATERIALS.rustDeep,
      });
    }
  }
  v.push(...mbox(5, 11, 0, 3, 1, 6, MATERIALS.woodDeep)); // door
  v.push(...box(10, 11, 3, 2, 1, 2, mixPalette('warmGlow', 'structureMid', 0.35))); // small window
  // Pots + a watering can at the side.
  v.push(...mbox(0, 3, 0, 1, 2, 2, MATERIALS.rust));
  v.push({ x: 0, y: 3, z: 2, c: PALETTE_INT.solarGreen });
  v.push(...mbox(0, 7, 0, 1, 1, 1, MATERIALS.gunmetal)); // the can
  return v;
}

/** Loftpod dye palette (D2b): sanctioned paints keyed by dye id. */
export const LOFTPOD_DYES = ['plum', 'teal', 'ochre', 'rose'] as const;

/**
 * A LOFTPOD (D2b): the small personal home on a Terrarium berth. Three
 * tiers, four dyes — every step reads across the terrace (§10.8: housing
 * is a cosmetic canvas; the showroom district gets real silhouettes).
 */
function loftpodModel(tier: number, dye: string): Voxel[] {
  const skin =
    dye === 'teal'
      ? MATERIALS.paintTeal
      : dye === 'ochre'
        ? MATERIALS.paintOchre
        : dye === 'rose'
          ? MATERIALS.paintRose
          : { ...MATERIALS.concrete, base: mixPalette('duskSky', 'structureMid', 0.5) };
  const glass = mixPalette('warmGlow', 'neonAmber', 0.3);
  const v: Voxel[] = [];
  // Skids + the capsule body (corner-cut for the rounded read).
  v.push(...mbox(2, 3, 0, 10, 1, 2, MATERIALS.gunmetalDeep));
  v.push(...mbox(2, 10, 0, 10, 1, 2, MATERIALS.gunmetalDeep));
  for (const vox of mbox(1, 2, 2, 12, 10, 8, skin as Material)) {
    const corner =
      (vox.x <= 1 || vox.x >= 12) && (vox.y <= 2 || vox.y >= 11) && (vox.z <= 3 || vox.z >= 8);
    if (!corner) v.push(vox);
  }
  // The round window (lit — somebody's home) + the door + trophy board.
  for (const [wx, wz] of [
    [4, 6], [5, 6], [4, 5], [5, 5],
  ] as const) {
    v.push({ x: wx, y: 11, z: wz, c: glass });
  }
  v.push(...mbox(8, 11, 2, 3, 1, 5, MATERIALS.woodDeep)); // door
  v.push(...box(12, 11, 4, 1, 1, 2, mixPalette('ink', 'structureMid', 0.25))); // trophy board
  // Stove pipe.
  v.push(...mbox(3, 4, 10, 1, 1, 3, MATERIALS.gunmetal));

  if (tier >= 2) {
    // The porch: wood deck + striped awning + a planter box.
    v.push(...mbox(1, 12, 0, 12, 3, 2, MATERIALS.wood));
    const hot = mixPalette('neonRose', 'structureMid', 0.2);
    const pale = mixPalette('warmGlow', 'groundAccent', 0.25);
    for (let ax = 6; ax < 13; ax++) v.push({ x: ax, y: 12, z: 8, c: ax % 2 === 0 ? hot : pale });
    v.push(...mbox(1, 12, 2, 3, 2, 2, MATERIALS.wood)); // planter
    v.push({ x: 2, y: 12, z: 4, c: PALETTE_INT.solarGreen });
    v.push({ x: 1, y: 13, z: 4, c: mixPalette('solarGreen', 'ink', 0.3) });
  }
  if (tier >= 3) {
    // The upper bubble: a set-back second level with a skylight + whip.
    for (const vox of mbox(3, 4, 10, 8, 6, 5, skin as Material)) {
      const corner = (vox.x <= 3 || vox.x >= 10) && (vox.y <= 4 || vox.y >= 9) && vox.z >= 13;
      if (!corner) v.push(vox);
    }
    v.push(...box(5, 6, 15, 3, 2, 1, glass)); // skylight
    v.push(...mbox(11, 5, 15, 1, 1, 5, MATERIALS.gunmetal)); // whip
    v.push({ x: 11, y: 5, z: 20, c: PALETTE_INT.warmGlow }); // its bulb
  }
  return v;
}

/** A compost heap — the Terrarium's peaceful scavenge node look. */
function compostHeapModel(depleted: boolean): Voxel[] {
  const leafA = PALETTE_INT.solarGreen;
  const leafB = mixPalette('solarGreen', 'ink', 0.35);
  const v = junkHeapModel(depleted, 0);
  // Moss takes the pile; a sprout crowns it while it's full.
  for (const vox of v) {
    if (vox.z >= 2 && voxelHash(vox.x, vox.y, 54) < 0.4) {
      vox.c = (vox.x + vox.y) % 2 === 0 ? leafA : leafB;
      delete vox.mat;
    }
  }
  if (!depleted) {
    v.push({ x: 4, y: 3, z: 7, c: leafA });
    v.push({ x: 4, y: 4, z: 6, c: leafB });
  }
  return v;
}

/** Bake the world-conversion set (call from BootScene after the core set). */
export function bakeWorldVoxelModels(scene: Phaser.Scene): void {
  // V1 repetition breaking: the common props each bake a pool of looks;
  // VariantPicker (position hash + adjacency guard) chooses at placement.
  for (let i = 0; i < 3; i++) {
    bakeVoxelModel(scene, { name: `junk-heap-${i}`, voxels: junkHeapModel(false, i) });
    bakeVoxelModel(scene, { name: `junk-heap-${i}-depleted`, voxels: junkHeapModel(true, i) });
  }
  bakeVoxelModel(scene, { name: 'brass-node', voxels: brassNodeModel(false) });
  bakeVoxelModel(scene, { name: 'brass-node-depleted', voxels: brassNodeModel(true) });
  bakeVoxelModel(scene, { name: 'amperite-node', voxels: amperiteNodeModel(false) });
  bakeVoxelModel(scene, { name: 'amperite-node-depleted', voxels: amperiteNodeModel(true) });
  bakeVoxelModel(scene, { name: 'antenna', voxels: antennaModel() });
  for (let i = 0; i < 3; i++) {
    bakeVoxelModel(scene, { name: `container-${i}`, voxels: containerModel(i, false) });
    bakeVoxelModel(scene, { name: `container-d${i}`, voxels: containerModel(i, true) });
    bakeVoxelModel(scene, { name: `container-r${i}`, voxels: containerRustModel(i, false) });
    bakeVoxelModel(scene, { name: `container-rd${i}`, voxels: containerRustModel(i, true) });
    bakeVoxelModel(scene, { name: `deadmachine-${i}`, voxels: deadMachineModel(i) });
  }
  // V3 building set: eight silhouettes, every roof dressed.
  for (let d = 0; d < 8; d++) {
    bakeVoxelModel(scene, { name: `bldg-${d}`, voxels: buildingModel(d) });
  }
  for (const h of [2, 3, 4]) {
    bakeVoxelModel(scene, { name: `stack-${h}`, voxels: stackModel(h, false, false) });
    bakeVoxelModel(scene, { name: `stack-${h}s`, voxels: stackModel(h, true, false) });
    bakeVoxelModel(scene, { name: `stack-${h}b`, voxels: stackModel(h, false, true) });
    bakeVoxelModel(scene, { name: `stack-${h}sb`, voxels: stackModel(h, true, true) });
  }
  bakeVoxelModel(scene, { name: 'cranehulk', voxels: craneHulkModel() });
  bakeVoxelModel(scene, { name: 'pylon', voxels: pylonModel() });
  bakeVoxelModel(scene, { name: 'drums-0', voxels: drumsModel(0) });
  bakeVoxelModel(scene, { name: 'drums-1', voxels: drumsModel(1) });
  bakeVoxelModel(scene, { name: 'dynamo', voxels: dynamoModel() });
  bakeVoxelModel(scene, { name: 'scuttlebot', voxels: scuttlebotModel(PALETTE_INT.neonTeal) });
  bakeVoxelModel(scene, {
    name: 'scuttlebot-feral',
    voxels: scuttlebotModel(PALETTE_INT.neonRose),
  });
  bakeVoxelModel(scene, { name: 'heatlamp', voxels: heatlampModel() });
  bakeVoxelModel(scene, { name: 'tramgate', voxels: tramgateModel() });
  bakeVoxelModel(scene, { name: 'ropepost', voxels: ropepostModel() });
  bakeVoxelModel(scene, { name: 'merchant', voxels: merchantModel() });
  bakeVoxelModel(scene, { name: 'tinkerbench', voxels: tinkerbenchModel() });
  bakeVoxelModel(scene, { name: 'dispatcher', voxels: dispatcherModel() });
  bakeVoxelModel(scene, { name: 'warden', voxels: wardenModel() });
  bakeVoxelModel(scene, { name: 'junkhound', voxels: junkhoundModel() });
  // I6 vignette props (variants share a model fn; see PropKind docs).
  for (const i of [0, 1]) {
    bakeVoxelModel(scene, { name: `cablespool-${i}`, voxels: cablespoolModel(i) });
    bakeVoxelModel(scene, { name: `barrels-${i}`, voxels: barrelsModel(i) });
    bakeVoxelModel(scene, { name: `pallets-${i}`, voxels: palletsModel(i) });
    bakeVoxelModel(scene, { name: `gascans-${i}`, voxels: gascansModel(i) });
    bakeVoxelModel(scene, { name: `tarp-${i}`, voxels: tarpModel(i) });
    bakeVoxelModel(scene, { name: `scrapbin-${i}`, voxels: scrapbinModel(i) });
  }
  bakeVoxelModel(scene, { name: 'ventbox', voxels: ventboxModel() });
  // V2 shape vocabulary: fabric / organic / tall-thin / round-ish pools.
  for (const i of [0, 1, 2]) {
    bakeVoxelModel(scene, { name: `canopy-${i}`, voxels: canopyModel(i) });
    bakeVoxelModel(scene, { name: `banner-${i}`, voxels: bannerModel(i) });
    bakeVoxelModel(scene, { name: `wildbush-${i}`, voxels: wildbushModel(i) });
  }
  for (const i of [0, 1]) {
    bakeVoxelModel(scene, { name: `laundry-${i}`, voxels: laundryModel(i) });
    bakeVoxelModel(scene, { name: `vinewall-${i}`, voxels: vinewallModel(i) });
    bakeVoxelModel(scene, { name: `signpost-${i}`, voxels: signpostModel(i) });
    bakeVoxelModel(scene, { name: `stovepipe-${i}`, voxels: stovepipeModel(i) });
  }
  bakeVoxelModel(scene, { name: 'watertank', voxels: watertankModel() });
  // V4 unique set pieces (one bake each — they're one-offs by design).
  bakeVoxelModel(scene, { name: 'griddle', voxels: griddleModel() });
  bakeVoxelModel(scene, { name: 'tramcar', voxels: tramcarModel() });
  bakeVoxelModel(scene, { name: 'fountain', voxels: fountainModel() });
  bakeVoxelModel(scene, { name: 'draymule', voxels: draymuleModel() });
  bakeVoxelModel(scene, { name: 'spill', voxels: spillModel() });
  bakeVoxelModel(scene, { name: 'guardrail-0', voxels: guardrailModel(false) });
  bakeVoxelModel(scene, { name: 'guardrail-1', voxels: guardrailModel(true) });
  // D1 the Stacks: 12 tower looks + the one garden roof + the landmarks.
  for (let tv = 0; tv < 12; tv++) {
    bakeVoxelModel(scene, { name: `tower-${tv}`, voxels: towerSpec(tv).voxels });
  }
  bakeVoxelModel(scene, {
    name: `tower-${TOWER_GARDEN_VARIANT}`,
    voxels: towerSpec(TOWER_GARDEN_VARIANT).voxels,
  });
  bakeVoxelModel(scene, { name: 'spire', voxels: spireModel() });
  bakeVoxelModel(scene, { name: 'registry', voxels: registryModel() });
  bakeVoxelModel(scene, { name: 'noodlecart', voxels: noodlecartModel() });
  bakeVoxelModel(scene, { name: 'treeplanter', voxels: treeplanterModel() });
  bakeVoxelModel(scene, { name: 'shanty', voxels: shantyModel() });
  // D2 the Terrarium: the Trellis, beds, sheds, and the compost look.
  bakeVoxelModel(scene, { name: 'mothertrellis', voxels: mothertrellisModel() });
  for (const i of [0, 1, 2]) {
    bakeVoxelModel(scene, { name: `gardenbed-${i}`, voxels: gardenbedModel(i) });
  }
  bakeVoxelModel(scene, { name: 'toolshed-0', voxels: toolshedModel(0) });
  bakeVoxelModel(scene, { name: 'toolshed-1', voxels: toolshedModel(1) });
  bakeVoxelModel(scene, { name: 'junk-heap-c', voxels: compostHeapModel(false) });
  bakeVoxelModel(scene, { name: 'junk-heap-c-depleted', voxels: compostHeapModel(true) });
  // D2b Loftpods: three tiers × four dyes (housing reads across terraces).
  for (const tier of [1, 2, 3]) {
    for (const dye of LOFTPOD_DYES) {
      bakeVoxelModel(scene, { name: `loftpod-${tier}-${dye}`, voxels: loftpodModel(tier, dye) });
    }
  }
  bakeVoxelModel(scene, { name: 'fortunecoil', voxels: fortunecoilModel() });
  bakeVoxelModel(scene, { name: 'ledgerhouse', voxels: ledgerhouseModel() });
  bakeVoxelModel(scene, { name: 'toolrack', voxels: toolrackModel() });
  bakeVoxelModel(scene, { name: 'scrapcache', voxels: scrapcacheModel() });
}
