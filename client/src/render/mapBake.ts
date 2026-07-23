import Phaser from 'phaser';
import { buildDistrictMap, type DistrictId, type PropKind, type WorldMap } from '@shared/map';
import { blendInt, MATERIAL_INT, PALETTE_INT } from '@shared/palette';
import { baseFloorKind, night, type FloorKind } from './floorTiles';
import { shade } from './voxel';

/**
 * WORLD-MAP ISLAND BAKE (map M1) — each district as a real miniature
 * render, generated from the SAME shared map data the world builds from:
 * zone floors through the world's own classifier (baseFloorKind), the
 * coolant canals, elevation as lifted terraces with shadowed south faces,
 * and every prop as a tiny extruded block with its material color — the
 * Stacks' tower canyon, the Terrarium's green tiers, the Filament's lit
 * plaza all read as themselves. Baked once per session per district into
 * a texture; a layout change in shared/map.ts regenerates it on next
 * open, so the map can never drift stale.
 */

/** Iso projection scale: full island diamond spans `islandW` pixels. */
interface Proj {
  s: number; // tile half-height in px (half-width = 2s)
  cx: number;
  cy: number;
}

/** Flat top-color per floor kind — the bake's zone read at 3px/tile.
 *  Bases mirror floorTiles.specFor so the miniature grades like the world. */
function floorColor(kind: FloorKind): number {
  switch (kind) {
    case 'asphalt':
      return night(MATERIAL_INT.asphalt, 0.12);
    case 'paver':
      return night(MATERIAL_INT.concrete, 0.16);
    case 'paverLight':
      return shade(night(MATERIAL_INT.concrete, 0.16), 0.1);
    case 'plating':
      return night(MATERIAL_INT.gunmetalDeep, 0.14);
    case 'deck':
      return night(MATERIAL_INT.wood, 0.16);
    case 'rug':
      return night(MATERIAL_INT.paintOchre, 0.2);
    case 'coolant':
      return night(PALETTE_INT.ink, 0.4);
  }
}

/** Mini-extrusion spec per prop kind: box height in px-per-tile units and
 *  top color. Kinds not listed render as low structure clutter. */
const PROP_LOOK: Partial<Record<PropKind, { h: number; top: number; accent?: number }>> = {
  tower: { h: 6.5, top: night(MATERIAL_INT.concrete, 0.2), accent: PALETTE_INT.warmGlow },
  dynamo: { h: 7.5, top: MATERIAL_INT.gunmetal, accent: PALETTE_INT.neonAmber },
  ledgerhouse: { h: 3.6, top: MATERIAL_INT.paintOchre, accent: PALETTE_INT.warmGlow },
  ampedbar: { h: 3.2, top: MATERIAL_INT.paintOchre, accent: PALETTE_INT.neonAmber },
  shack: { h: 2.2, top: MATERIAL_INT.rust },
  toolshed: { h: 2.0, top: MATERIAL_INT.rust },
  stall: { h: 1.6, top: MATERIAL_INT.paintRose, accent: PALETTE_INT.warmGlow },
  merchant: { h: 1.6, top: MATERIAL_INT.paintTeal, accent: PALETTE_INT.neonAmber },
  tramgate: { h: 3.0, top: MATERIAL_INT.gunmetal, accent: PALETTE_INT.neonAmber },
  tramcar: { h: 1.8, top: MATERIAL_INT.gunmetal },
  fortunecoil: { h: 3.0, top: MATERIAL_INT.gunmetal, accent: PALETTE_INT.violetNeon },
  fountain: { h: 1.4, top: MATERIAL_INT.concrete, accent: PALETTE_INT.neonTeal },
  watertank: { h: 3.2, top: MATERIAL_INT.rust },
  stovepipe: { h: 3.0, top: MATERIAL_INT.gunmetalDeep },
  spire: { h: 9.0, top: MATERIAL_INT.gunmetalDeep, accent: PALETTE_INT.neonRose },
  registry: { h: 3.0, top: MATERIAL_INT.paintTeal, accent: PALETTE_INT.violetNeon },
  noodlecart: { h: 1.4, top: MATERIAL_INT.paintOchre, accent: PALETTE_INT.emberOrange },
  shanty: { h: 1.6, top: MATERIAL_INT.rust },
  mothertrellis: { h: 5.0, top: PALETTE_INT.solarGreen, accent: PALETTE_INT.warmGlow },
  stack: { h: 2.6, top: MATERIAL_INT.rust },
  cranehulk: { h: 5.0, top: MATERIAL_INT.rustDeep, accent: PALETTE_INT.emberOrange },
  deadmachine: { h: 1.8, top: MATERIAL_INT.gunmetalDeep },
  pylon: { h: 3.5, top: MATERIAL_INT.gunmetalDeep },
  canopy: { h: 1.4, top: MATERIAL_INT.paintRose },
  dispatchpost: { h: 2.0, top: MATERIAL_INT.wood, accent: PALETTE_INT.neonTeal },
  draymule: { h: 1.6, top: MATERIAL_INT.rust },
  spill: { h: 1.0, top: MATERIAL_INT.rustDeep },
  wildbush: { h: 1.2, top: PALETTE_INT.solarGreen },
  gardenbed: { h: 0.9, top: blendInt(PALETTE_INT.solarGreen, MATERIAL_INT.wood, 0.35) },
  treeplanter: { h: 2.4, top: PALETTE_INT.solarGreen },
  planter: { h: 1.2, top: blendInt(PALETTE_INT.solarGreen, MATERIAL_INT.concrete, 0.4) },
  vinewall: { h: 2.0, top: blendInt(PALETTE_INT.solarGreen, MATERIAL_INT.gunmetalDeep, 0.5) },
  scrapbin: { h: 1.4, top: MATERIAL_INT.rustDeep },
  barrels: { h: 1.2, top: MATERIAL_INT.paintTeal },
  crate: { h: 1.2, top: MATERIAL_INT.wood },
  block: { h: 1.6, top: MATERIAL_INT.concreteDeep },
  pallets: { h: 0.8, top: MATERIAL_INT.woodDeep },
  cablespool: { h: 1.2, top: MATERIAL_INT.woodDeep },
  gascans: { h: 1.0, top: MATERIAL_INT.paintOchre },
  ventbox: { h: 1.2, top: MATERIAL_INT.gunmetalDeep },
  tinkerbench: { h: 1.4, top: MATERIAL_INT.wood, accent: PALETTE_INT.warmGlow },
  griddle: { h: 1.2, top: MATERIAL_INT.gunmetal, accent: PALETTE_INT.emberOrange },
};

/** Node glint accents — the gather economy sparkling on the island. */
const NODE_ACCENT: Record<string, number> = {
  junkHeap: MATERIAL_INT.rust,
  brassSeam: PALETTE_INT.warmGlow,
  amperite: PALETTE_INT.neonTeal,
  koiSpot: blendInt(PALETTE_INT.neonTeal, PALETTE_INT.ink, 0.35),
  antenna: PALETTE_INT.violetNeon,
};

function project(p: Proj, tx: number, ty: number, size: number): { x: number; y: number } {
  const c = size / 2;
  return {
    x: p.cx + (tx - ty) * p.s * 2,
    y: p.cy + (tx + ty - 2 * c) * p.s,
  };
}

function diamond(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
  g.fillPoints(
    [
      new Phaser.Geom.Point(x, y - s),
      new Phaser.Geom.Point(x + s * 2, y),
      new Phaser.Geom.Point(x, y + s),
      new Phaser.Geom.Point(x - s * 2, y),
    ],
    true,
  );
}

/** Extruded mini-box: top diamond + two shaded side facets. */
function extrude(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  halfW: number,
  height: number,
  top: number,
): void {
  const s = halfW / 2;
  // Right facet (screen SE) — mid shadow.
  g.fillStyle(shade(top, -0.28), 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(x, y + s),
      new Phaser.Geom.Point(x + halfW, y),
      new Phaser.Geom.Point(x + halfW, y - height),
      new Phaser.Geom.Point(x, y + s - height),
    ],
    true,
  );
  // Left facet (screen SW) — deep shadow.
  g.fillStyle(shade(top, -0.45), 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(x, y + s),
      new Phaser.Geom.Point(x - halfW, y),
      new Phaser.Geom.Point(x - halfW, y - height),
      new Phaser.Geom.Point(x, y + s - height),
    ],
    true,
  );
  g.fillStyle(top, 1);
  diamond(g, x, y - height, s);
}

/** Deterministic tiny hash for per-tile jitter (no Math.random — bakes
 *  must be identical across opens so the map never shimmers). */
function jitter(tx: number, ty: number): number {
  const n = Math.sin(tx * 127.1 + ty * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function districtIslandKey(d: DistrictId, islandW: number): string {
  return `map-island-${d}-${islandW}`;
}

/** Landmark kinds that get a pictogram pin on the world map (M2). */
export const MAP_LANDMARKS = [
  'dynamo',
  'merchant',
  'tramgate',
  'ledgerhouse',
  'fortunecoil',
] as const;
export type MapLandmark = (typeof MAP_LANDMARKS)[number];

export function landmarkMarkerKey(kind: MapLandmark): string {
  return `map-mark-${kind}`;
}

/**
 * Bake the landmark pictogram set (M2): a dark roundel + a small glyph in
 * the landmark's signature color — the same shorthand the interaction
 * markers use in-world, shrunk to map scale. Idempotent per session.
 */
export function ensureMapMarkers(scene: Phaser.Scene): void {
  if (scene.textures.exists(landmarkMarkerKey('dynamo'))) return;
  const S = 14; // texture size; the glyph sits in a 10px core
  const draw = (kind: MapLandmark, glyph: (g: Phaser.GameObjects.Graphics) => void): void => {
    const g = scene.add.graphics();
    g.setVisible(false);
    g.fillStyle(PALETTE_INT.ink, 0.92);
    g.fillCircle(S / 2, S / 2, S / 2 - 0.5);
    g.lineStyle(1, PALETTE_INT.structureMid, 0.9);
    g.strokeCircle(S / 2, S / 2, S / 2 - 1);
    glyph(g);
    g.generateTexture(landmarkMarkerKey(kind), S, S);
    g.destroy();
  };
  // The Dynamo: amber core with its stacked rings.
  draw('dynamo', (g) => {
    g.fillStyle(PALETTE_INT.neonAmber, 1);
    g.fillRect(4, 6, 6, 1);
    g.fillRect(5, 8, 4, 1);
    g.fillRect(5, 4, 4, 1);
  });
  // The Nightstalls: a rose awning over the stand.
  draw('merchant', (g) => {
    g.fillStyle(PALETTE_INT.neonRose, 1);
    g.fillRect(3, 4, 8, 2);
    g.fillStyle(PALETTE_INT.warmGlow, 1);
    g.fillRect(4, 7, 2, 3);
    g.fillRect(8, 7, 2, 3);
  });
  // The Tramgate: the amber stop diamond (the minimap's own language).
  draw('tramgate', (g) => {
    g.fillStyle(PALETTE_INT.neonAmber, 1);
    g.fillPoints(
      [
        new Phaser.Geom.Point(7, 3),
        new Phaser.Geom.Point(11, 7),
        new Phaser.Geom.Point(7, 11),
        new Phaser.Geom.Point(3, 7),
      ],
      true,
    );
    g.fillStyle(PALETTE_INT.ink, 1);
    g.fillRect(6, 6, 2, 2);
  });
  // The Ledgerhouse: the vault slot.
  draw('ledgerhouse', (g) => {
    g.fillStyle(PALETTE_INT.warmGlow, 1);
    g.fillRect(4, 4, 6, 6);
    g.fillStyle(PALETTE_INT.ink, 1);
    g.fillRect(6, 6, 2, 3);
  });
  // The Fortune Coil: a violet wheel with spokes.
  draw('fortunecoil', (g) => {
    g.lineStyle(1.4, PALETTE_INT.violetNeon, 1);
    g.strokeCircle(7, 7, 3.6);
    g.fillStyle(PALETTE_INT.violetNeon, 1);
    g.fillRect(6, 6, 2, 2);
    g.fillRect(6, 3, 2, 1);
    g.fillRect(6, 10, 2, 1);
    g.fillRect(3, 6, 1, 2);
    g.fillRect(10, 6, 1, 2);
  });
}

/** Pixel size of the baked island texture for layout math. */
export function islandTextureSize(d: DistrictId, islandW: number): { w: number; h: number } {
  void d;
  return { w: islandW + 16, h: islandW / 2 + 44 };
}

/**
 * Bake one district's island to a texture (idempotent per session).
 * Returns the texture key.
 */
export function bakeDistrictIsland(
  scene: Phaser.Scene,
  d: DistrictId,
  islandW: number,
): string {
  const key = districtIslandKey(d, islandW);
  if (scene.textures.exists(key)) return key;

  const map: WorldMap = buildDistrictMap(d);
  const size = map.size;
  const tex = islandTextureSize(d, islandW);
  // Headroom above the diamond for extrusions; sits in the lower region.
  const p: Proj = { s: islandW / (2 * size), cx: tex.w / 2, cy: 30 + islandW / 4 };

  const g = scene.add.graphics();
  g.setVisible(false);

  // ── ground: zone floors + canals, with elevation lift and south faces ──
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const walk = map.walkable[ty]?.[tx] === true;
      const canal = map.canal[ty]?.[tx] === true;
      if (!walk && !canal) continue;
      const pt = project(p, tx, ty, size);
      const e = canal ? -1 : (map.elevation[ty]?.[tx] ?? 0);
      const lift = e * p.s * 1.2;
      const base = canal ? floorColor('coolant') : floorColor(baseFloorKind(map, tx, ty));
      // Terrace faces where this tile stands above its screen-south neighbors.
      if (e > 0) {
        g.fillStyle(shade(base, -0.4), 1);
        g.fillPoints(
          [
            new Phaser.Geom.Point(pt.x - p.s * 2, pt.y - lift),
            new Phaser.Geom.Point(pt.x, pt.y + p.s - lift),
            new Phaser.Geom.Point(pt.x + p.s * 2, pt.y - lift),
            new Phaser.Geom.Point(pt.x + p.s * 2, pt.y),
            new Phaser.Geom.Point(pt.x, pt.y + p.s),
            new Phaser.Geom.Point(pt.x - p.s * 2, pt.y),
          ],
          true,
        );
      }
      // Per-tile jitter keeps the ground reading as texture, not flat fill.
      g.fillStyle(shade(base, (jitter(tx, ty) - 0.5) * 0.12), 1);
      diamond(g, pt.x, pt.y - lift, p.s);
    }
  }

  // ── the plaza's warm pool (the Filament's heart glows on the map) ──────
  if (map.plaza.radius > 0) {
    const c = project(p, map.plaza.cx, map.plaza.cy, size);
    g.fillStyle(PALETTE_INT.warmGlow, 0.16);
    g.fillEllipse(c.x, c.y, map.plaza.radius * p.s * 5.2, map.plaza.radius * p.s * 2.6);
  }

  // ── nodes as 1px glints ────────────────────────────────────────────────
  for (const n of map.nodes) {
    const accent = NODE_ACCENT[n.kind];
    if (accent === undefined) continue;
    const pt = project(p, n.x, n.y, size);
    g.fillStyle(accent, 0.85);
    g.fillRect(Math.round(pt.x) - 1, Math.round(pt.y) - 1, 2, 1);
  }

  // ── props as extruded blocks, painter-sorted back to front ─────────────
  const props = [...map.props].sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const prop of props) {
    const look = PROP_LOOK[prop.kind];
    if (look === undefined) continue;
    const cx = prop.x + prop.w / 2;
    const cy = prop.y + prop.h / 2;
    const pt = project(p, cx, cy, size);
    const e = map.elevation[Math.floor(cy)]?.[Math.floor(cx)] ?? 0;
    const lift = Math.max(0, e) * p.s * 1.2;
    const footprint = Math.max(prop.w, prop.h);
    const halfW = p.s * 2 * Math.max(0.8, footprint * 0.55);
    // Tangle container stacks encode their height in the variant (2-4 high),
    // and alternate the world's container paints so the maze reads varied.
    const hUnits = prop.kind === 'stack' ? 0.9 + prop.variant * 0.55 : look.h;
    const height = hUnits * p.s * 2;
    const top =
      prop.kind === 'stack'
        ? ([MATERIAL_INT.rust, MATERIAL_INT.paintTeal, MATERIAL_INT.paintOchre][
            (prop.x + prop.y) % 3
          ] as number)
        : look.top;
    extrude(g, pt.x, pt.y - lift, halfW, height, top);
    if (look.accent !== undefined) {
      // A lit accent pixel-pair on the top face — windows, sign, glow.
      g.fillStyle(look.accent, 0.95);
      g.fillRect(Math.round(pt.x) - 1, Math.round(pt.y - lift - height) - 1, 2, 2);
      if (prop.kind === 'tower') {
        // Window lights down the south face — the Stacks' canyon at night.
        for (let i = 1; i <= 3; i++) {
          if (jitter(prop.x + i, prop.y) < 0.4) continue;
          g.fillStyle(look.accent, 0.75);
          g.fillRect(
            Math.round(pt.x + (i % 2 === 0 ? -2 : 2)),
            Math.round(pt.y - lift - height + i * (height / 4)),
            1,
            1,
          );
        }
      }
    }
  }

  // ── the Dynamo's crown glow (only where a dynamo stands) ───────────────
  const dyn = map.props.find((pr) => pr.kind === 'dynamo');
  if (dyn !== undefined) {
    const pt = project(p, dyn.x + dyn.w / 2, dyn.y + dyn.h / 2, size);
    const look = PROP_LOOK.dynamo as { h: number };
    g.fillStyle(PALETTE_INT.neonAmber, 0.22);
    g.fillEllipse(pt.x, pt.y - look.h * p.s * 2, p.s * 14, p.s * 8);
  }

  const rt = scene.make.renderTexture({ width: tex.w, height: tex.h }, false);
  rt.draw(g, 0, 0);
  rt.saveTexture(key);
  rt.destroy();
  g.destroy();
  return key;
}
