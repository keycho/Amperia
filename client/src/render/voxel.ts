import Phaser from 'phaser';
import { PALETTE_INT } from '@shared/palette';
import { DEPTH_SHADOW } from '../iso/project';
import { voxelHash, type Material } from './materials';

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
  /** Material surface behavior (noise/wear/stains). Plain-color voxels
   *  (neons, glow accents) omit it and render flat. */
  mat?: Material;
}

export interface VoxelModel {
  name: string;
  voxels: Voxel[];
  /** 1px ink outline around the silhouette (default true). */
  outline?: boolean;
  /** 1px warm rim along the top-left silhouette (characters pop). */
  warmRim?: boolean;
  /** Darken material voxels toward the base for grounding (default true). */
  grounding?: boolean;
  /** Bake + auto-place a directional cast shadow (default true). */
  shadow?: boolean;
}

/**
 * Directional cast shadows (R1): the key light sits high top-LEFT of
 * screen (matching the face ramp — left faces lit, right faces dark), so
 * every shadow shears toward screen bottom-right. Tile-space shear per
 * voxel of height: tall things throw LONG shadows across the ground.
 */
export const SHADOW_SHEAR_X = 0.95;
export const SHADOW_SHEAR_Y = 0.3;
/** Overall alpha the cast-shadow layer renders at. */
export const SHADOW_ALPHA = 0.5;

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

/** Rectangular solid built from a material. */
export function mbox(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  mat: Material,
): Voxel[] {
  return box(x, y, z, w, d, h, mat.base).map((v) => ({ ...v, mat }));
}

/** Tag a voxel list with a material (for per-voxel color patterns). */
export function withMat(voxels: Voxel[], mat: Material): Voxel[] {
  return voxels.map((v) => ({ ...v, mat }));
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

interface Exposure {
  top: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Material-aware cube: per-face value noise, chipped top edges on worn
 * materials, and stain streaks down exposed faces. Every face gets quiet
 * variation — no large flat single-color fills (materials pass §A2).
 */
function drawMatCube(
  g: Phaser.GameObjects.Graphics,
  px: number,
  py: number,
  v: Voxel,
  baseColor: number,
  exp: Exposure,
): void {
  const mat = v.mat as Material;
  const faceNoise = (salt: number) =>
    (voxelHash(v.x, v.y, v.z, salt) - 0.5) * 2 * mat.noise;
  const top = shade(baseColor, 0.2 + faceNoise(3));
  const left = shade(baseColor, faceNoise(5));
  const right = shade(baseColor, -0.2 + faceNoise(7));
  // Faces.
  g.fillStyle(top, 1);
  g.beginPath();
  g.moveTo(px, py - HALF_H);
  g.lineTo(px + HALF_W, py);
  g.lineTo(px, py + HALF_H);
  g.lineTo(px - HALF_W, py);
  g.closePath();
  g.fillPath();
  g.fillStyle(left, 1);
  g.beginPath();
  g.moveTo(px - HALF_W, py);
  g.lineTo(px, py + HALF_H);
  g.lineTo(px, py + HALF_H + SIDE_H);
  g.lineTo(px - HALF_W, py + SIDE_H);
  g.closePath();
  g.fillPath();
  g.fillStyle(right, 1);
  g.beginPath();
  g.moveTo(px + HALF_W, py);
  g.lineTo(px, py + HALF_H);
  g.lineTo(px, py + HALF_H + SIDE_H);
  g.lineTo(px + HALF_W, py + SIDE_H);
  g.closePath();
  g.fillPath();
  // Edge wear: a light chipped line along an exposed top edge.
  if (exp.top && voxelHash(v.x, v.y, v.z, 13) < mat.wearChance) {
    const chipLeft = voxelHash(v.x, v.y, v.z, 17) < 0.5;
    g.lineStyle(1.4, shade(baseColor, 0.5), 0.9);
    g.beginPath();
    if (chipLeft) {
      g.moveTo(px - HALF_W, py);
      g.lineTo(px, py - HALF_H);
    } else {
      g.moveTo(px, py - HALF_H);
      g.lineTo(px + HALF_W, py);
    }
    g.strokePath();
  }
  // Stains: a darker streak running down an exposed tall face.
  if (exp.left && voxelHash(v.x, v.y, v.z, 19) < mat.stainChance) {
    const t = 0.2 + voxelHash(v.x, v.y, v.z, 23) * 0.6;
    const sx = px - HALF_W + t * HALF_W;
    const sy = py + t * HALF_H;
    g.lineStyle(2, shade(left, -0.32), 0.55);
    g.beginPath();
    g.moveTo(sx, sy + 1);
    g.lineTo(sx, sy + SIDE_H * (0.5 + voxelHash(v.x, v.y, v.z, 29) * 0.5));
    g.strokePath();
  }
  if (exp.right && voxelHash(v.x, v.y, v.z, 31) < mat.stainChance) {
    const t = 0.2 + voxelHash(v.x, v.y, v.z, 37) * 0.6;
    const sx = px + t * HALF_W;
    const sy = py + HALF_H - t * HALF_H;
    g.lineStyle(2, shade(right, -0.32), 0.55);
    g.beginPath();
    g.moveTo(sx, sy + 1);
    g.lineTo(sx, sy + SIDE_H * (0.5 + voxelHash(v.x, v.y, v.z, 41) * 0.5));
    g.strokePath();
  }
}

/**
 * Bake a model's directional cast shadow ('vox-<name>-shadow'): every
 * voxel projects a ground diamond sheared by its height, plus a tight
 * contact-AO ring from the base voxels. Two-alpha layering (fringe under
 * core) keeps the edge soft; the image itself renders at SHADOW_ALPHA.
 */
function bakeShadow(
  scene: Phaser.Scene,
  name: string,
  voxels: Voxel[],
): BakedVoxelSprite {
  const key = `vox-${name}-shadow`;
  const regKey = `${name}@shadow`;
  const existing = registry.get(regKey);
  if (existing !== undefined && scene.textures.exists(key)) return existing;

  // Shadow ground cells: (x + z·shearX, y + z·shearY) in tile-voxel space.
  const cells = voxels.map((v) => ({
    px: (v.x + v.z * SHADOW_SHEAR_X - (v.y + v.z * SHADOW_SHEAR_Y)) * HALF_W,
    py: (v.x + v.z * SHADOW_SHEAR_X + (v.y + v.z * SHADOW_SHEAR_Y)) * HALF_H,
    contact: v.z <= 1,
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.px - HALF_W * 1.8);
    maxX = Math.max(maxX, c.px + HALF_W * 1.8);
    minY = Math.min(minY, c.py - HALF_H * 1.8);
    maxY = Math.max(maxY, c.py + HALF_H * 1.8);
  }
  // Anchor: identical world point to the sprite bake (footprint center).
  const xs = voxels.map((v) => v.x);
  const ys = voxels.map((v) => v.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const anchorX = (cx - cy) * HALF_W;
  const anchorY = (cx + cy) * HALF_H + HALF_H + SIDE_H;
  const pad = 3;
  const w = Math.ceil(maxX - minX) + pad * 2;
  const h = Math.ceil(maxY - minY) + pad * 2 + SIDE_H;
  const ox = pad - minX;
  const oy = pad - minY;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const diamond = (px: number, py: number, sx: number, sy: number, a: number) => {
    g.fillStyle(PALETTE_INT.ink, a);
    g.beginPath();
    g.moveTo(px, py - HALF_H * sy);
    g.lineTo(px + HALF_W * sx, py);
    g.lineTo(px, py + HALF_H * sy);
    g.lineTo(px - HALF_W * sx, py);
    g.closePath();
    g.fillPath();
  };
  // Fringe pass (soft edge), then core pass; contact cells darkest.
  for (const c of cells) diamond(c.px + ox, c.py + oy, 1.7, 1.7, 0.16);
  for (const c of cells) diamond(c.px + ox, c.py + oy, 1.05, 1.05, 0.4);
  for (const c of cells) {
    if (c.contact) diamond(c.px + ox, c.py + oy, 0.9, 0.9, 0.5);
  }
  g.generateTexture(key, w, h);
  g.destroy();

  const baked: BakedVoxelSprite = {
    key,
    originX: (anchorX + ox) / w,
    originY: (anchorY + oy) / h,
    scale: 0.5,
  };
  registry.set(regKey, baked);
  return baked;
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

  // Grounding gradient: material voxels darken slightly toward the base so
  // objects sit in the scene instead of floating (materials pass §A3).
  // Neon/accent voxels are light, not material — they never darken.
  const zMax = Math.max(1, ...model.voxels.map((v) => v.z));
  const grounding = model.grounding !== false;
  for (const p of proj.points) {
    const v = p.v;
    if (v.mat !== undefined) {
      const ground = grounding ? -0.1 * (1 - Math.min(1, v.z / zMax)) : 0;
      const base = shade(v.c, ground);
      const exp: Exposure = {
        top: !occupied.has(`${v.x},${v.y},${v.z + 1}`),
        left: !occupied.has(`${v.x},${v.y + 1},${v.z}`),
        right: !occupied.has(`${v.x + 1},${v.y},${v.z}`),
      };
      drawMatCube(g, p.px + ox, p.py + oy, v, base, exp);
    } else {
      drawCube(g, p.px + ox, p.py + oy, v.c);
    }
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
  if (model.shadow !== false) bakeShadow(scene, model.name, visible);
  return baked;
}

/** Per-scene list of (sprite, shadow) pairs kept in lockstep. */
interface ShadowPair {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}
const shadowPairs = new WeakMap<Phaser.Scene, ShadowPair[]>();

/**
 * Keep every auto-placed shadow under its (possibly moving) sprite. Call
 * once per frame from the world scene's update.
 */
export function syncVoxelShadows(scene: Phaser.Scene): void {
  const pairs = shadowPairs.get(scene);
  if (pairs === undefined) return;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const p = pairs[i] as ShadowPair;
    if (!p.img.active) {
      pairs.splice(i, 1);
      continue;
    }
    if (p.shadow.x !== p.img.x || p.shadow.y !== p.img.y) {
      p.shadow.setPosition(p.img.x, p.img.y);
    }
    if (p.shadow.visible !== p.img.visible) p.shadow.setVisible(p.img.visible);
  }
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
  // Directional cast shadow (R1): baked alongside the model, laid on the
  // shadow layer under every sprite, and kept in lockstep by the scene.
  const shadowBaked = registry.get(`${name}@shadow`);
  if (shadowBaked !== undefined) {
    const shadow = scene.add.image(worldX, worldY, shadowBaked.key);
    shadow.setOrigin(shadowBaked.originX, shadowBaked.originY);
    shadow.setScale(shadowBaked.scale);
    shadow.setAlpha(SHADOW_ALPHA);
    shadow.setDepth(DEPTH_SHADOW);
    img.setData('shadowImg', shadow);
    img.once(Phaser.GameObjects.Events.DESTROY, () => shadow.destroy());
    let pairs = shadowPairs.get(scene);
    if (pairs === undefined) {
      pairs = [];
      shadowPairs.set(scene, pairs);
    }
    pairs.push({ img, shadow });
  }
  return img;
}

/**
 * Swap an image to another baked model (e.g. depleted variants). Origin and
 * scale are re-applied because each bake has its own bounding box; the
 * attached cast shadow swaps with it.
 */
export function applyVoxelTexture(img: Phaser.GameObjects.Image, name: string): void {
  const baked = voxelSprite(name);
  img.setTexture(baked.key);
  img.setOrigin(baked.originX, baked.originY);
  img.setScale(baked.scale);
  const shadow = img.getData('shadowImg') as Phaser.GameObjects.Image | undefined;
  const shadowBaked = registry.get(`${name}@shadow`);
  if (shadow !== undefined && shadowBaked !== undefined) {
    shadow.setTexture(shadowBaked.key);
    shadow.setOrigin(shadowBaked.originX, shadowBaked.originY);
    shadow.setScale(shadowBaked.scale);
  }
}
