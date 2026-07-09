import Phaser from 'phaser';
import { PALETTE_INT } from '@shared/palette';

/**
 * "Kintara construction, Amperia palette" — the in-code voxel-sprite
 * pipeline. Every world asset is a list of voxels (grid coords + palette
 * color) rendered ONCE at boot into a texture:
 *
 *  - fixed voxel unit: 1/8 tile width (8 world px), so all assets share scale
 *  - flat 3-tone face shading, consistent top-left light:
 *    top +20% light · left base · right −20% dark
 *  - optional 1px ink outline around the whole silhouette
 *  - colors ONLY from palette.ts (plus one neon accent where it earns it);
 *    the ±20% face ramp is the sanctioned value shading
 *
 * Textures are baked at 2× and drawn at scale 0.5 for crisp edges.
 */

/** World pixels per voxel (footprint diamond width). */
export const VOXEL_UNIT = 8;

// Texture-space (2×) steps for the iso projection of one voxel.
const HALF_W = VOXEL_UNIT; // 8px at 2× = half diamond width
const HALF_H = VOXEL_UNIT / 2; // 4px at 2×
const SIDE_H = VOXEL_UNIT; // vertical face height at 2×

export interface Voxel {
  x: number;
  y: number;
  z: number;
  c: number;
}

export interface VoxelModel {
  name: string;
  voxels: Voxel[];
  /** 1px ink outline around the silhouette (default true). */
  outline?: boolean;
  /** 1px warm rim along the top-left silhouette (characters pop). */
  warmRim?: boolean;
}

export interface BakedVoxelSprite {
  key: string;
  /** Set as origin so the sprite sits on its footprint's south corner. */
  originX: number;
  originY: number;
  /** Display scale (textures are baked at 2×). */
  scale: number;
}

const registry = new Map<string, BakedVoxelSprite>();

export function voxelSprite(name: string): BakedVoxelSprite {
  const baked = registry.get(name);
  if (baked === undefined) throw new Error(`voxel model not baked: ${name}`);
  return baked;
}

/** Rectangular solid of voxels. */
export function box(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  c: number,
): Voxel[] {
  const out: Voxel[] = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      for (let dz = 0; dz < h; dz++) {
        out.push({ x: x + dx, y: y + dy, z: z + dz, c });
      }
    }
  }
  return out;
}

/** ±fraction value shade (the 3-tone face ramp). */
export function shade(color: number, fraction: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = Math.max(-1, Math.min(1, fraction));
  const adj = (v: number) => {
    const target = f >= 0 ? 255 : 0;
    return Math.round(v + (target - v) * Math.abs(f));
  };
  return (adj(r) << 16) | (adj(g) << 8) | adj(b);
}

/** Rotate a model 90° around z (for 4-direction character bakes). */
export function rotate90(voxels: Voxel[]): Voxel[] {
  const maxX = Math.max(...voxels.map((v) => v.x));
  return voxels.map((v) => ({ x: v.y, y: maxX - v.x, z: v.z, c: v.c }));
}

/** Mirror a model across x (screen-flip alternative with correct shading). */
export function mirrorX(voxels: Voxel[]): Voxel[] {
  const maxX = Math.max(...voxels.map((v) => v.x));
  return voxels.map((v) => ({ x: maxX - v.x, y: v.y, z: v.z, c: v.c }));
}

interface Projected {
  px: number;
  py: number;
  v: Voxel;
}

function project(voxels: Voxel[]): {
  points: Projected[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  anchorX: number;
  anchorY: number;
} {
  // Screen position of a voxel's top-diamond center (before offset).
  const pts: Projected[] = voxels.map((v) => ({
    px: (v.x - v.y) * HALF_W,
    py: (v.x + v.y) * HALF_H - v.z * SIDE_H,
    v,
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.px - HALF_W);
    maxX = Math.max(maxX, p.px + HALF_W);
    minY = Math.min(minY, p.py - HALF_H);
    maxY = Math.max(maxY, p.py + HALF_H + SIDE_H);
  }
  // Anchor: south corner of the footprint's center column at z=0.
  const xs = voxels.map((v) => v.x);
  const ys = voxels.map((v) => v.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const anchorX = (cx - cy) * HALF_W;
  const anchorY = (cx + cy) * HALF_H + HALF_H + SIDE_H;
  return { points: pts, minX, minY, maxX, maxY, anchorX, anchorY };
}

function drawCube(
  g: Phaser.GameObjects.Graphics,
  px: number,
  py: number,
  color: number | null,
  alpha = 1,
): void {
  const top = color === null ? PALETTE_INT.ink : shade(color, 0.2);
  const left = color === null ? PALETTE_INT.ink : color;
  const right = color === null ? PALETTE_INT.ink : shade(color, -0.2);
  // Top diamond.
  g.fillStyle(top, alpha);
  g.beginPath();
  g.moveTo(px, py - HALF_H);
  g.lineTo(px + HALF_W, py);
  g.lineTo(px, py + HALF_H);
  g.lineTo(px - HALF_W, py);
  g.closePath();
  g.fillPath();
  // Left face.
  g.fillStyle(left, alpha);
  g.beginPath();
  g.moveTo(px - HALF_W, py);
  g.lineTo(px, py + HALF_H);
  g.lineTo(px, py + HALF_H + SIDE_H);
  g.lineTo(px - HALF_W, py + SIDE_H);
  g.closePath();
  g.fillPath();
  // Right face.
  g.fillStyle(right, alpha);
  g.beginPath();
  g.moveTo(px + HALF_W, py);
  g.lineTo(px, py + HALF_H);
  g.lineTo(px, py + HALF_H + SIDE_H);
  g.lineTo(px + HALF_W, py + SIDE_H);
  g.closePath();
  g.fillPath();
}

/** Bake a model to a texture ('vox-<name>') and register its anchor. */
export function bakeVoxelModel(scene: Phaser.Scene, model: VoxelModel): BakedVoxelSprite {
  const key = `vox-${model.name}`;
  const existing = registry.get(model.name);
  if (existing !== undefined && scene.textures.exists(key)) return existing;

  // Cull voxels with all three visible faces covered (exact for this
  // projection: +x, +y and +z neighbours hide a cube completely).
  const occupied = new Set(model.voxels.map((v) => `${v.x},${v.y},${v.z}`));
  const visible = model.voxels.filter(
    (v) =>
      !(
        occupied.has(`${v.x + 1},${v.y},${v.z}`) &&
        occupied.has(`${v.x},${v.y + 1},${v.z}`) &&
        occupied.has(`${v.x},${v.y},${v.z + 1}`)
      ),
  );
  const sorted = [...visible].sort(
    (a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z,
  );
  const proj = project(sorted);
  const pad = 3;
  const w = Math.ceil(proj.maxX - proj.minX) + pad * 2;
  const h = Math.ceil(proj.maxY - proj.minY) + pad * 2;
  const ox = pad - proj.minX;
  const oy = pad - proj.minY;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Silhouette passes: ink outline all around, then a warm rim top-left.
  if (model.outline !== false) {
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      for (const p of proj.points) {
        drawCube(g, p.px + ox + dx, p.py + oy + dy, null);
      }
    }
  }
  if (model.warmRim === true) {
    for (const p of proj.points) {
      drawCube(g, p.px + ox - 1, p.py + oy - 1, PALETTE_INT.warmGlow, 1);
    }
  }

  for (const p of proj.points) {
    drawCube(g, p.px + ox, p.py + oy, p.v.c);
  }

  g.generateTexture(key, w, h);
  g.destroy();

  const baked: BakedVoxelSprite = {
    key,
    originX: (proj.anchorX + ox) / w,
    originY: (proj.anchorY + oy) / h,
    scale: 0.5,
  };
  registry.set(model.name, baked);
  return baked;
}

/** Convenience: add a baked voxel sprite anchored on a world point. */
export function addVoxelSprite(
  scene: Phaser.Scene,
  name: string,
  worldX: number,
  worldY: number,
): Phaser.GameObjects.Image {
  const baked = voxelSprite(name);
  const img = scene.add.image(worldX, worldY, baked.key);
  img.setOrigin(baked.originX, baked.originY);
  img.setScale(baked.scale);
  return img;
}

/**
 * Swap an image to another baked model (e.g. depleted variants). Origin and
 * scale are re-applied because each bake has its own bounding box.
 */
export function applyVoxelTexture(img: Phaser.GameObjects.Image, name: string): void {
  const baked = voxelSprite(name);
  img.setTexture(baked.key);
  img.setOrigin(baked.originX, baked.originY);
  img.setScale(baked.scale);
}
