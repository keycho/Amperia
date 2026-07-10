import Phaser from 'phaser';
import { mixPalette, PALETTE_INT } from '@shared/palette';
import { MATERIALS } from './materials';
import { bakeVoxelModel, box, mbox, shade, type Voxel } from './voxel';

/**
 * Mass-convert set: resource nodes (hero-budget per §12A.8), containers,
 * salvage shacks, the antenna shrine, and the Great Dynamo hero model.
 */

// ── Junk heap ─────────────────────────────────────────────────────────────

function junkHeapModel(depleted: boolean): Voxel[] {
  // Rusted scrap through and through, with a gunmetal pipe poking out.
  const A = MATERIALS.rust;
  const B = MATERIALS.rustDeep;
  const C = MATERIALS.wood; // splintered pallet wood in the pile
  const v: Voxel[] = [];
  const lumps: Array<[number, number, number, number, number, number, typeof A]> = depleted
    ? [
        [0, 2, 0, 4, 4, 2, B],
        [3, 0, 0, 4, 4, 2, A],
        [5, 3, 0, 3, 3, 1, C],
      ]
    : [
        [0, 2, 0, 5, 5, 3, B],
        [3, 0, 0, 5, 5, 4, A],
        [5, 4, 0, 4, 4, 2, C],
        [2, 3, 3, 3, 3, 2, A],
        [4, 2, 4, 2, 2, 2, B],
      ];
  for (const [x, y, z, w, d, h, m] of lumps) v.push(...mbox(x, y, z, w, d, h, m));
  if (!depleted) {
    // Sticking-out bits: a strut, a pipe, a plate — junk should bristle.
    v.push(...mbox(1, 1, 3, 1, 1, 4, MATERIALS.rustDeep)); // strut
    v.push(...mbox(6, 2, 2, 3, 1, 1, MATERIALS.gunmetal)); // pipe
    v.push(...mbox(0, 5, 2, 2, 3, 1, MATERIALS.rust)); // plate
    v.push({ x: 4, y: 1, z: 6, c: PALETTE_INT.neonAmber }); // sign chip accent
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

function containerModel(variant: number): Voxel[] {
  // Weathered painted-panel shipping boxes: teal-grey, ochre, dusty rose.
  const mat = [MATERIALS.paintTeal, MATERIALS.paintOchre, MATERIALS.paintRose][
    variant % 3
  ] as (typeof MATERIALS)['paintTeal'];
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 6, 4, 5, mat)) {
    // Corrugation: alternating darker columns on long faces.
    const ridged = vox.x % 2 === 1 && (vox.y === 0 || vox.y === 3);
    v.push(ridged ? { ...vox, c: shade(mat.base, -0.16) } : vox);
  }
  // Rusted top rail + stencil chip accent.
  for (const vox of mbox(0, 0, 4, 6, 1, 1, MATERIALS.rustDeep)) v.push(vox);
  v.push({ x: 5, y: 2, z: 3, c: PALETTE_INT.neonAmber });
  return v;
}

/** Weathered-steel container (the Tangle's rust/gunmetal family). */
function containerRustModel(variant: number): Voxel[] {
  const mat = [MATERIALS.rust, MATERIALS.gunmetalDeep, MATERIALS.rustDeep][
    variant % 3
  ] as (typeof MATERIALS)['rust'];
  const v: Voxel[] = [];
  for (const vox of mbox(0, 0, 0, 6, 4, 5, mat)) {
    const ridged = vox.x % 2 === 1 && (vox.y === 0 || vox.y === 3);
    v.push(ridged ? { ...vox, c: shade(mat.base, -0.16) } : vox);
  }
  for (const vox of mbox(0, 0, 4, 6, 1, 1, MATERIALS.gunmetalDeep)) v.push(vox);
  return v;
}

/**
 * Canyon wall segment (Tangle brief): containers stacked `levels` high
 * with per-level jitter and material drift; one level in three carries
 * ember-orange hazard stripes — the sanctioned accent, never a fill.
 */
function stackModel(levels: number, striped: boolean): Voxel[] {
  const mats = [MATERIALS.rust, MATERIALS.gunmetalDeep, MATERIALS.rustDeep, MATERIALS.gunmetal];
  const v: Voxel[] = [];
  for (let level = 0; level < levels; level++) {
    const mat = mats[(level * 2 + levels) % mats.length] as (typeof MATERIALS)['rust'];
    const ox = (level * 3 + levels) % 2; // slight overhang jitter
    const oy = (level * 5 + levels * 3) % 2;
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

function drumsModel(): Voxel[] {
  // Rusted fuel drums with gunmetal bands; one repainted ochre.
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
  drum(0, 0, MATERIALS.rust);
  drum(3, 2, MATERIALS.paintOchre);
  drum(1, 3, MATERIALS.rustDeep);
  return v;
}

// ── Salvage shacks (modular, with lit windows + neon sign) ────────────────

function shackModel(variant: number): Voxel[] {
  // Painted-panel walls (weathered), rust patches, gunmetal roof, wood door.
  const wallMat = [MATERIALS.paintTeal, MATERIALS.paintOchre, MATERIALS.paintRose][
    variant % 3
  ] as (typeof MATERIALS)['paintTeal'];
  const window = PALETTE_INT.warmGlow;
  const signC = [PALETTE_INT.neonRose, PALETTE_INT.neonAmber, PALETTE_INT.neonTeal][
    variant % 3
  ] as number;
  const v: Voxel[] = [];
  // Body 14×12, 12 tall with a rust-patched corner.
  for (const vox of mbox(0, 0, 0, 14, 12, 12, wallMat)) {
    const patched = vox.z > 7 && vox.x < 5 && vox.y > 5;
    if (patched) v.push({ ...vox, c: MATERIALS.rust.base, mat: MATERIALS.rust });
    else v.push(vox);
  }
  // Gunmetal roof slab with overhang + lip.
  v.push(...mbox(-1, -1, 12, 16, 14, 1, MATERIALS.gunmetalDeep));
  v.push(...mbox(-1, 12, 11, 16, 1, 1, MATERIALS.gunmetal));
  // Wood door (front face, +y side) and two lit windows.
  v.push(...mbox(3, 11, 0, 3, 1, 6, MATERIALS.woodDeep));
  v.push(...box(8, 11, 4, 3, 1, 3, window));
  v.push(...box(13, 5, 5, 1, 3, 3, window)); // side window (+x face)
  // Neon sign board above the door.
  v.push(...box(2, 11, 8, 5, 1, 2, mixPalette('ink', 'structureMid', 0.2)));
  v.push({ x: 3, y: 11, z: 9, c: signC });
  v.push({ x: 5, y: 11, z: 8, c: signC });
  // Rooftop junk: gunmetal pipe + vent.
  v.push(...mbox(2, 3, 13, 1, 1, 3, MATERIALS.gunmetal));
  v.push(...mbox(10, 6, 13, 2, 2, 1, MATERIALS.gunmetalDeep));
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
    bakeVoxelModel(scene, { name: `container-r${i}`, voxels: containerRustModel(i) });
    bakeVoxelModel(scene, { name: `shack-${i}`, voxels: shackModel(i) });
    bakeVoxelModel(scene, { name: `deadmachine-${i}`, voxels: deadMachineModel(i) });
  }
  for (const h of [2, 3, 4]) {
    bakeVoxelModel(scene, { name: `stack-${h}`, voxels: stackModel(h, false) });
    bakeVoxelModel(scene, { name: `stack-${h}s`, voxels: stackModel(h, true) });
  }
  bakeVoxelModel(scene, { name: 'cranehulk', voxels: craneHulkModel() });
  bakeVoxelModel(scene, { name: 'pylon', voxels: pylonModel() });
  bakeVoxelModel(scene, { name: 'drums', voxels: drumsModel() });
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
  bakeVoxelModel(scene, { name: 'toolrack', voxels: toolrackModel() });
  bakeVoxelModel(scene, { name: 'scrapcache', voxels: scrapcacheModel() });
}
