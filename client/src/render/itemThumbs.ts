import Phaser from 'phaser';
import { ITEMS, type ItemDef } from '@shared/items';
import { blendInt, MATERIAL_INT, mixPalette, PALETTE_INT, type PaletteKey } from '@shared/palette';
import { shade, type Voxel } from './voxel';

/**
 * Item thumbnails BAKED FROM THE VOXEL PIPELINE (I4): every concrete item
 * renders as a miniature voxel model on a plum card — the same construction
 * language as the world, so the pack always looks like the city. Kenney
 * game-icons remain ONLY for abstract UI glyphs (settings gear etc.).
 *
 * Tier/rare accents are REAL voxels in the model (prongs, bands, tips) —
 * never a tint wash over the whole sprite.
 */

// CLARITY: 44 = the exact display size of the hotbar/pack slots and the
// drag ghost, so thumbs render 1:1 — any non-integer resize wobbles the
// card border and diamond edges.
const CARD = 44;

/** Texture key for an item's thumbnail (icon + accent variant). */
export function itemThumbKey(def: ItemDef): string {
  return `thumb:${def.icon}${def.iconTint !== undefined ? `~${def.iconTint}` : ''}`;
}

const C = {
  rust: MATERIAL_INT.rust,
  rustDeep: MATERIAL_INT.rustDeep,
  metal: MATERIAL_INT.gunmetal,
  wood: MATERIAL_INT.wood,
  ochre: MATERIAL_INT.paintOchre,
  rose: MATERIAL_INT.paintRose,
  teal: PALETTE_INT.neonTeal,
  amber: PALETTE_INT.neonAmber,
  glow: PALETTE_INT.warmGlow,
  ink: PALETTE_INT.ink,
} as const;

function box(x: number, y: number, z: number, w: number, d: number, h: number, c: number): Voxel[] {
  const out: Voxel[] = [];
  for (let dx = 0; dx < w; dx++)
    for (let dy = 0; dy < d; dy++)
      for (let dz = 0; dz < h; dz++) out.push({ x: x + dx, y: y + dy, z: z + dz, c });
  return out;
}

// ── mini models (≤ ~4×4×5 voxels; accent = tier/variant color) ────────────

function salvageModel(gold: boolean): Voxel[] {
  const plate = gold ? blendInt(C.amber, C.ochre, 0.4) : C.rust;
  const v = box(0, 0, 0, 4, 3, 1, plate);
  v.push(...box(1, 1, 1, 2, 1, 1, gold ? C.glow : C.rustDeep)); // bent rib
  v.push({ x: 3, y: 2, z: 1, c: gold ? C.amber : C.metal }); // the bolt
  return v;
}

function ingotModel(hotTop: number): Voxel[] {
  const v = box(0, 0, 0, 2, 1, 1, C.ochre);
  v.push(...box(2, 1, 0, 2, 1, 1, C.ochre));
  v.push(...box(1, 0, 1, 2, 1, 1, blendInt(C.ochre, hotTop, 0.45)));
  v.push({ x: 1, y: 0, z: 2, c: hotTop });
  return v;
}

function crystalModel(): Voxel[] {
  const a = blendInt(C.amber, C.glow, 0.35);
  const v = box(0, 0, 0, 3, 2, 1, C.rustDeep); // rocky base
  v.push(...box(0, 0, 1, 1, 1, 2, a));
  v.push(...box(1, 1, 1, 1, 1, 3, C.amber));
  v.push({ x: 1, y: 1, z: 4, c: C.glow });
  v.push(...box(2, 0, 1, 1, 1, 1, a));
  return v;
}

function koiModel(accent: number): Voxel[] {
  const body = blendInt(C.teal, PALETTE_INT.structureMid, 0.2);
  const v = box(0, 0, 1, 3, 1, 1, body);
  v.push({ x: 3, y: 0, z: 2, c: accent }); // tail flick
  v.push({ x: 0, y: 0, z: 2, c: body }); // head rise
  v.push({ x: 0, y: 0, z: 0, c: accent }); // fin
  v.push({ x: 1, y: 0, z: 2, c: C.amber }); // eye glint
  return v;
}

function signalModel(accent: number): Voxel[] {
  const v = box(0, 0, 0, 2, 2, 1, C.metal);
  v.push(...box(1, 1, 1, 1, 1, 2, blendInt(C.metal, C.ink, 0.25)));
  v.push({ x: 1, y: 1, z: 3, c: accent });
  v.push({ x: 0, y: 1, z: 1, c: accent }); // side lamp
  return v;
}

function warmcupModel(): Voxel[] {
  const cup = C.rose;
  const v = box(0, 0, 0, 2, 2, 2, cup);
  v.push({ x: 2, y: 1, z: 1, c: blendInt(cup, C.ink, 0.25) }); // handle
  v.push({ x: 0, y: 0, z: 2, c: C.glow }); // steam curl
  v.push({ x: 1, y: 1, z: 2, c: blendInt(C.amber, C.glow, 0.5) }); // the drink
  return v;
}

function cellwaxModel(): Voxel[] {
  const wax = blendInt(C.teal, PALETTE_INT.structureMid, 0.45);
  const v = box(0, 0, 0, 2, 2, 2, wax);
  v.push({ x: 0, y: 0, z: 2, c: shade(wax, 0.25) });
  v.push({ x: 1, y: 1, z: 2, c: C.ink }); // wick
  v.push({ x: 1, y: 1, z: 3, c: C.amber }); // flamelet
  return v;
}

function heatlampModel(): Voxel[] {
  const v = box(0, 0, 0, 2, 2, 1, C.metal);
  v.push(...box(1, 1, 1, 1, 1, 2, blendInt(C.metal, C.ink, 0.3)));
  v.push(...box(0, 0, 3, 2, 2, 1, blendInt(C.glow, C.amber, 0.3)));
  v.push({ x: 0, y: 0, z: 4, c: C.glow });
  return v;
}

function magclawModel(accent: number): Voxel[] {
  const v = box(0, 0, 0, 2, 1, 2, C.rust);
  v.push(...box(2, 0, 1, 1, 1, 1, C.rustDeep)); // wrist
  v.push({ x: 3, y: 0, z: 2, c: accent }); // upper prong
  v.push({ x: 3, y: 0, z: 0, c: accent }); // lower prong
  v.push({ x: 0, y: 0, z: 2, c: blendInt(C.rust, C.ink, 0.3) });
  return v;
}

function drillhammerModel(accent: number): Voxel[] {
  const v = box(1, 0, 0, 1, 1, 3, C.wood);
  v.push(...box(0, 0, 3, 3, 1, 1, C.metal));
  v.push({ x: 0, y: 0, z: 4, c: accent }); // striking band
  v.push({ x: 2, y: 0, z: 4, c: blendInt(C.metal, C.ink, 0.3) });
  return v;
}

function skimnetModel(accent: number): Voxel[] {
  const v = box(0, 0, 0, 1, 1, 2, C.wood);
  // Hoop.
  v.push(...box(0, 0, 2, 3, 1, 1, accent));
  v.push(...box(0, 0, 4, 3, 1, 1, accent));
  v.push({ x: 0, y: 0, z: 3, c: accent });
  v.push({ x: 2, y: 0, z: 3, c: accent });
  v.push({ x: 1, y: 0, z: 3, c: blendInt(accent, C.ink, 0.55) }); // mesh
  return v;
}

function tunerModel(accent: number): Voxel[] {
  const v = box(0, 0, 0, 2, 2, 1, C.metal);
  v.push({ x: 0, y: 0, z: 1, c: blendInt(C.metal, C.ink, 0.25) }); // dial
  v.push(...box(1, 1, 1, 1, 1, 2, C.metal));
  v.push({ x: 1, y: 1, z: 3, c: accent });
  v.push({ x: 0, y: 1, z: 1, c: PALETTE_INT.neonCyan }); // readout
  return v;
}

function riveterModel(accent: number): Voxel[] {
  const v = box(0, 0, 0, 2, 1, 2, C.rust);
  v.push({ x: 0, y: 0, z: 2, c: blendInt(C.rust, C.ink, 0.3) }); // grip
  v.push(...box(2, 0, 1, 1, 1, 1, C.metal));
  v.push({ x: 3, y: 0, z: 1, c: accent }); // hot tip
  return v;
}

const BUILDERS: Record<string, (accent: number) => Voxel[]> = {
  'icon-salvage': () => salvageModel(false),
  'icon-gilded-scrap': () => salvageModel(true),
  'icon-brass': () => ingotModel(blendInt(C.amber, C.ochre, 0.5)),
  'icon-blue-hot-brass': () => ingotModel(PALETTE_INT.neonCyan),
  'icon-amperite': () => crystalModel(),
  'icon-glowkoi': () => koiModel(blendInt(C.teal, C.glow, 0.35)),
  'icon-prismatic-glowkoi': () => koiModel(PALETTE_INT.neonRose),
  'icon-signal': () => signalModel(PALETTE_INT.neonCyan),
  'icon-ghost-frequency': () => signalModel(PALETTE_INT.neonRose),
  'icon-warmcup': () => warmcupModel(),
  'icon-cellwax': () => cellwaxModel(),
  'icon-heatlamp': () => heatlampModel(),
  'icon-magclaw': (a) => magclawModel(a),
  'icon-drillhammer': (a) => drillhammerModel(a),
  'icon-skimnet': (a) => skimnetModel(a),
  'icon-tuner': (a) => tunerModel(a),
  'icon-riveter': (a) => riveterModel(a),
  // D2c garden rares.
  'icon-silverfern': () => silverfernModel(),
  'icon-emberseed': () => emberseedModel(),
  // F2: every item its own silhouette — these six previously borrowed the
  // gilded-scrap / riveter models and read as duplicates in the Pack.
  'icon-dented-crest': () => dentedCrestModel(),
  'icon-wisp-filament': () => wispFilamentModel(),
  'icon-dray-plate': () => drayPlateModel(),
  'icon-wax-chit': () => waxChitModel(),
  'icon-sparkwrench': (a) => sparkwrenchModel(a),
  'icon-scarf': () => scarfModel(),
};

/** A Scuttlebot's maker-mark: a pointed badge, one corner caved in. */
function dentedCrestModel(): Voxel[] {
  const steel = blendInt(C.metal, C.ink, 0.15);
  const v = box(0, 0, 1, 4, 1, 3, steel);
  v.push({ x: 1, y: 0, z: 0, c: steel }); // the point
  v.push({ x: 2, y: 0, z: 0, c: shade(steel, -0.3) });
  v.push({ x: 1, y: 0, z: 4, c: shade(steel, 0.25) }); // crown ridge
  v.push({ x: 2, y: 0, z: 4, c: shade(steel, 0.25) });
  v.push({ x: 1, y: 0, z: 2, c: C.rose }); // the maker's sigil
  v.push({ x: 3, y: 0, z: 3, c: shade(steel, -0.45) }); // the dent
  return v;
}

/** A hair of living charge — a rising zig of light with a hot tip. */
function wispFilamentModel(): Voxel[] {
  const glow = blendInt(C.teal, C.glow, 0.4);
  return [
    { x: 0, y: 0, z: 0, c: shade(glow, -0.2) },
    { x: 1, y: 0, z: 1, c: glow },
    { x: 1, y: 0, z: 2, c: C.teal },
    { x: 2, y: 0, z: 3, c: glow },
    { x: 2, y: 0, z: 4, c: C.teal },
    { x: 3, y: 0, z: 5, c: C.glow }, // the hot tip
  ];
}

/** Draymule flank armor: a riveted slab with a crowd-sized dent. */
function drayPlateModel(): Voxel[] {
  const plate = blendInt(MATERIAL_INT.rust, C.ink, 0.1);
  const v = box(0, 0, 0, 4, 1, 4, plate);
  v.push({ x: 0, y: 0, z: 4, c: shade(plate, 0.2) }); // top lip
  v.push({ x: 3, y: 0, z: 4, c: shade(plate, 0.2) });
  for (const [x, z] of [[0, 0], [3, 0], [0, 3], [3, 3]] as const) {
    v.push({ x, y: 1, z, c: C.metal }); // rivets proud of the face
  }
  v.push({ x: 2, y: 1, z: 2, c: shade(plate, -0.4) }); // the dent
  v.push({ x: 1, y: 1, z: 1, c: shade(plate, -0.25) });
  return v;
}

/** A courier tip pressed in wax: a paper tag, sealed, string through it. */
function waxChitModel(): Voxel[] {
  const paper = blendInt(MATERIAL_INT.paintOchre, C.glow, 0.35);
  const v = box(0, 0, 0, 3, 1, 4, paper);
  v.push({ x: 1, y: 1, z: 1, c: C.rose }); // the wax seal, proud
  v.push({ x: 1, y: 0, z: 4, c: shade(paper, -0.2) }); // punched corner
  v.push({ x: 2, y: 0, z: 5, c: blendInt(C.ochre, C.ink, 0.4) }); // string
  return v;
}

/** A heavy open-end wrench with opinions — jaw up, knurled grip. */
function sparkwrenchModel(accent: number): Voxel[] {
  const steel = C.metal;
  const v = box(1, 0, 0, 1, 1, 4, steel); // shaft
  v.push({ x: 1, y: 0, z: 4, c: shade(steel, 0.2) }); // head base
  v.push({ x: 0, y: 0, z: 5, c: steel }); // left jaw
  v.push({ x: 2, y: 0, z: 5, c: steel }); // right jaw
  v.push({ x: 0, y: 0, z: 6, c: accent }); // jaw tips
  v.push({ x: 2, y: 0, z: 6, c: accent });
  v.push({ x: 1, y: 0, z: 1, c: blendInt(steel, C.ink, 0.35) }); // grip wrap
  v.push({ x: 1, y: 0, z: 0, c: accent }); // pommel spark
  return v;
}

/** The Dispatch Scarf — the wardrobe model, promoted to an item icon. */
function scarfModel(): Voxel[] {
  const rose = PALETTE_INT.neonRose;
  const deep = blendInt(rose, C.ink, 0.3);
  const v = box(0, 0, 1, 4, 3, 1, rose);
  v.push(...box(0, 2, 0, 1, 1, 1, deep)); // trailing tail
  v.push({ x: 0, y: 2, z: 2, c: deep });
  return v;
}

/** A frond gone chrome — stem + mirrored silver-green leaflets. */
function silverfernModel(): Voxel[] {
  const silver = shade(PALETTE_INT.solarGreen, 0.45);
  const deep = blendInt(PALETTE_INT.solarGreen, C.ink, 0.35);
  const v: Voxel[] = [];
  for (let z = 0; z < 6; z++) v.push({ x: 3, y: 3, z, c: deep });
  for (const [dx, dz] of [
    [1, 4], [2, 3], [1, 2], [2, 1], [1, 5],
  ] as const) {
    v.push({ x: 3 - dx, y: 3, z: dz, c: silver });
    v.push({ x: 3 + dx, y: 3, z: dz, c: (dx + dz) % 2 === 0 ? silver : PALETTE_INT.solarGreen });
  }
  v.push({ x: 3, y: 3, z: 6, c: silver });
  return v;
}

/** A seed that never sprouts — a warm kernel with one hot fleck. */
function emberseedModel(): Voxel[] {
  const v: Voxel[] = [];
  for (const [x, y, z, w, d, h] of [
    [2, 2, 0, 3, 3, 1], [1, 1, 1, 5, 5, 2], [2, 2, 3, 3, 3, 1],
  ] as const) {
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < d; dy++)
        for (let dz = 0; dz < h; dz++)
          v.push({ x: x + dx, y: y + dy, z: z + dz, c: blendInt(PALETTE_INT.emberOrange, C.rustDeep, 0.45) });
  }
  v.push({ x: 3, y: 3, z: 4, c: PALETTE_INT.emberOrange });
  v.push({ x: 2, y: 3, z: 2, c: C.amber });
  return v;
}

/** Fallback accents per family when the item declares no iconTint. */
const DEFAULT_ACCENT: Record<string, number> = {
  'icon-magclaw': C.teal,
  'icon-drillhammer': blendInt(C.amber, PALETTE_INT.structureMid, 0.3),
  'icon-skimnet': C.teal,
  'icon-tuner': PALETTE_INT.neonCyan,
  'icon-riveter': C.amber,
  'icon-sparkwrench': C.rose,
};

/** Draw one mini model onto a plum card, centered, 3-tone shaded. */
function bakeThumb(scene: Phaser.Scene, key: string, voxels: Voxel[]): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // The plum card.
  const card = mixPalette('duskSky', 'structureMid', 0.35);
  g.fillStyle(card, 1);
  g.fillRoundedRect(1, 1, CARD - 2, CARD - 2, 9);
  g.fillStyle(shade(card, 0.08), 1);
  g.fillRoundedRect(1, 1, CARD - 2, 10, { tl: 9, tr: 9, bl: 0, br: 0 });
  g.lineStyle(1.5, PALETTE_INT.ink, 0.9);
  g.strokeRoundedRect(1, 1, CARD - 2, CARD - 2, 9);

  // Fit: pick the largest half-width step that keeps the model inside.
  const sorted = [...voxels].sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z);
  let HW = 8;
  let proj: Array<{ px: number; py: number; v: Voxel }> = [];
  let bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  for (; HW >= 3; HW--) {
    const HH = Math.max(2, Math.round(HW / 2));
    const SIDE = HW;
    proj = sorted.map((v) => ({
      px: (v.x - v.y) * HW,
      py: (v.x + v.y) * HH - v.z * SIDE,
      v,
    }));
    bbox = {
      minX: Math.min(...proj.map((p) => p.px)) - HW,
      maxX: Math.max(...proj.map((p) => p.px)) + HW,
      minY: Math.min(...proj.map((p) => p.py)) - HH,
      maxY: Math.max(...proj.map((p) => p.py)) + HH + SIDE,
    };
    if (bbox.maxX - bbox.minX <= CARD - 10 && bbox.maxY - bbox.minY <= CARD - 10) break;
  }
  const HH = Math.max(2, Math.round(HW / 2));
  const SIDE = HW;
  const ox = Math.round((CARD - (bbox.maxX - bbox.minX)) / 2 - bbox.minX);
  const oy = Math.round((CARD - (bbox.maxY - bbox.minY)) / 2 - bbox.minY);
  for (const p of proj) {
    const top = shade(p.v.c, 0.3);
    const left = p.v.c;
    const right = shade(p.v.c, -0.35);
    const px = p.px + ox;
    const py = p.py + oy;
    g.fillStyle(top, 1);
    g.beginPath();
    g.moveTo(px, py - HH);
    g.lineTo(px + HW, py);
    g.lineTo(px, py + HH);
    g.lineTo(px - HW, py);
    g.closePath();
    g.fillPath();
    g.fillStyle(left, 1);
    g.beginPath();
    g.moveTo(px - HW, py);
    g.lineTo(px, py + HH);
    g.lineTo(px, py + HH + SIDE);
    g.lineTo(px - HW, py + SIDE);
    g.closePath();
    g.fillPath();
    g.fillStyle(right, 1);
    g.beginPath();
    g.moveTo(px + HW, py);
    g.lineTo(px, py + HH);
    g.lineTo(px, py + HH + SIDE);
    g.lineTo(px + HW, py + SIDE);
    g.closePath();
    g.fillPath();
  }
  g.generateTexture(key, CARD, CARD);
  g.destroy();
}

// ── cosmetic thumbs (S1: the Manifest wardrobe page + wardrobe UI) ────────

const COSMETIC_MODELS: Record<string, () => Voxel[]> = {
  bulbHat: () => {
    const v = box(1, 1, 0, 2, 2, 1, blendInt(C.metal, C.ink, 0.15));
    v.push(...box(0, 0, 1, 4, 4, 3, blendInt(C.glow, C.amber, 0.25)));
    v.push({ x: 1, y: 1, z: 4, c: C.glow });
    v.push({ x: 2, y: 2, z: 4, c: C.glow });
    return v;
  },
  alleyBeanie: () => {
    const brim = blendInt(PALETTE_INT.emberOrange, PALETTE_INT.structureMid, 0.3);
    const v = box(0, 0, 0, 4, 4, 1, brim);
    v.push(...box(0, 0, 1, 4, 4, 1, C.ochre));
    v.push(...box(1, 1, 2, 2, 2, 1, C.ochre));
    v.push({ x: 1, y: 2, z: 3, c: C.amber }); // bobble
    return v;
  },
  starterScarf: () => {
    const rose = PALETTE_INT.neonRose;
    const deep = blendInt(rose, C.ink, 0.3);
    const v = box(0, 0, 1, 4, 3, 1, rose);
    v.push(...box(0, 2, 0, 1, 1, 1, deep)); // trailing tail
    v.push({ x: 0, y: 2, z: 2, c: deep });
    return v;
  },
  salvagerSatchel: () => {
    const v = box(0, 0, 0, 4, 2, 2, C.rust);
    v.push(...box(0, 0, 2, 4, 2, 1, C.wood));
    v.push({ x: 1, y: 1, z: 1, c: C.amber }); // clasp
    return v;
  },
  brassToolSkin: () => {
    const brass = blendInt(C.amber, C.ochre, 0.55);
    const v = box(0, 0, 0, 2, 1, 2, brass);
    v.push({ x: 2, y: 0, z: 2, c: C.teal });
    v.push({ x: 2, y: 0, z: 0, c: C.teal });
    return v;
  },
  chargeTrim: () => [
    { x: 0, y: 0, z: 0, c: C.amber },
    { x: 1, y: 1, z: 1, c: C.glow },
    { x: 2, y: 2, z: 2, c: C.amber },
    { x: 0, y: 2, z: 1, c: blendInt(C.amber, C.glow, 0.5) },
    { x: 2, y: 0, z: 1, c: blendInt(C.amber, C.glow, 0.5) },
  ],
  circuitBanner: () => {
    const v = box(3, 0, 0, 1, 1, 5, C.metal);
    v.push(...box(1, 0, 3, 2, 1, 2, C.teal));
    v.push({ x: 0, y: 0, z: 4, c: PALETTE_INT.neonCyan });
    v.push({ x: 3, y: 0, z: 5, c: C.amber });
    return v;
  },
  glimmerTrail: () => [
    { x: 0, y: 0, z: 0, c: C.glow },
    { x: 1, y: 1, z: 1, c: C.amber },
    { x: 2, y: 2, z: 0, c: C.glow },
    { x: 3, y: 3, z: 1, c: blendInt(C.amber, C.glow, 0.5) },
    { x: 1, y: 3, z: 0, c: blendInt(C.glow, C.amber, 0.3) },
  ],
  archivistGlow: () => [
    { x: 0, y: 0, z: 0, c: C.teal },
    { x: 1, y: 1, z: 1, c: blendInt(C.teal, C.glow, 0.5) },
    { x: 2, y: 2, z: 2, c: C.teal },
    { x: 0, y: 2, z: 1, c: PALETTE_INT.neonCyan },
    { x: 2, y: 0, z: 1, c: PALETTE_INT.neonCyan },
  ],

  // ── The Cosmetic Foundry (premium) thumbs ──────────────────────────────
  auroraCrown: () => {
    const v: Voxel[] = box(0, 1, 0, 4, 1, 1, blendInt(PALETTE_INT.violetNeon, C.ink, 0.3));
    for (const [x, h] of [[0, 2], [1, 3], [2, 2], [3, 3]] as const) {
      for (let i = 0; i < h; i++) {
        v.push({ x, y: 1, z: 1 + i, c: i === h - 1 ? PALETTE_INT.neonCyan : PALETTE_INT.violetNeon });
      }
    }
    return v;
  },
  firstLightCrown: () => {
    const v: Voxel[] = box(0, 1, 0, 4, 1, 1, blendInt(C.amber, C.ink, 0.3));
    for (const [x, h] of [[0, 2], [1, 3], [2, 2], [3, 3]] as const) {
      for (let i = 0; i < h; i++) {
        v.push({ x, y: 1, z: 1 + i, c: i === h - 1 ? C.glow : C.amber });
      }
    }
    return v;
  },
  filamentWings: () => {
    const v: Voxel[] = [];
    for (const [x, dir] of [[1, -1], [2, 1]] as const) {
      for (let i = 0; i < 3; i++) {
        v.push({ x: x + dir * i, y: 1, z: i, c: i === 2 ? C.amber : PALETTE_INT.neonCyan });
      }
    }
    return v;
  },
  duskBloomMantle: () => {
    const v: Voxel[] = box(0, 1, 2, 4, 1, 1, PALETTE_INT.violetNeon);
    v.push(...box(1, 1, 0, 2, 1, 2, blendInt(PALETTE_INT.violetNeon, C.ink, 0.4)));
    v.push({ x: 0, y: 1, z: 1, c: PALETTE_INT.neonCyan });
    v.push({ x: 3, y: 1, z: 1, c: PALETTE_INT.neonCyan });
    return v;
  },
  emberdriftCape: () => {
    const v: Voxel[] = box(0, 1, 2, 4, 1, 1, PALETTE_INT.emberOrange);
    v.push(...box(1, 1, 0, 2, 1, 2, blendInt(PALETTE_INT.emberOrange, C.ink, 0.4)));
    v.push({ x: 0, y: 1, z: 1, c: C.glow });
    v.push({ x: 3, y: 1, z: 1, c: C.glow });
    return v;
  },
  nightmarketCoat: () => {
    const coat = blendInt(PALETTE_INT.violetNeon, PALETTE_INT.structureMid, 0.35);
    const v: Voxel[] = box(0, 1, 0, 4, 1, 3, blendInt(coat, C.ink, 0.35));
    v.push(...box(1, 1, 0, 2, 1, 3, coat));
    v.push({ x: 1, y: 1, z: 2, c: C.amber }); // button
    v.push({ x: 2, y: 1, z: 1, c: C.amber });
    return v;
  },
};

export function cosmeticThumbKey(id: string): string {
  return `thumb:cosmetic:${id}`;
}

/** Bake every (icon, accent) pair the item table actually uses. */
export function bakeItemThumbs(scene: Phaser.Scene): void {
  for (const [id, build] of Object.entries(COSMETIC_MODELS)) {
    bakeThumb(scene, cosmeticThumbKey(id), build());
  }
  for (const def of Object.values(ITEMS)) {
    const builder = BUILDERS[def.icon];
    if (builder === undefined) continue;
    const accent =
      def.iconTint !== undefined
        ? PALETTE_INT[def.iconTint as PaletteKey]
        : (DEFAULT_ACCENT[def.icon] ?? C.amber);
    bakeThumb(scene, itemThumbKey(def), builder(accent));
  }
}
