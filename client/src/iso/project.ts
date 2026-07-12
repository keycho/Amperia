import { CONFIG } from '@shared/config';

/**
 * Isometric projection helpers (2:1 diamonds). World origin is the center of
 * tile (0,0); +tx runs down-right, +ty runs down-left on screen.
 */
export const TILE_W = CONFIG.tile.width;
export const TILE_H = CONFIG.tile.height;

/**
 * TERRAIN ELEVATION (R4): raised tiles render higher on screen. A scene
 * registers its map's elevation lookup here once, and every world
 * position derived from tiles (floors, props, entities, effects) lifts by
 * the level automatically. Depth stays anchored to the BASE tile Y so
 * sorting never disagrees across levels.
 */
export const ELEV_PX = 10;

let elevationAt: (tx: number, ty: number) => number = () => 0;

export function setElevationLookup(fn: ((tx: number, ty: number) => number) | null): void {
  elevationAt = fn ?? (() => 0);
}

/** Screen lift (px) for a tile's elevation level. */
export function elevOffset(tx: number, ty: number): number {
  return elevationAt(tx, ty) * ELEV_PX;
}

/** World position of a tile's diamond center (elevation-lifted). */
export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  return {
    x: ((tx - ty) * TILE_W) / 2,
    y: ((tx + ty) * TILE_H) / 2 - elevOffset(tx, ty),
  };
}

/** A tile's BASE (level-0) world position — depth math uses this. */
export function tileToWorldBase(tx: number, ty: number): { x: number; y: number } {
  return {
    x: ((tx - ty) * TILE_W) / 2,
    y: ((tx + ty) * TILE_H) / 2,
  };
}

/** Fractional tile coordinates under a BASE world position. */
export function worldToTile(wx: number, wy: number): { tx: number; ty: number } {
  return {
    tx: wy / TILE_H + wx / TILE_W,
    ty: wy / TILE_H - wx / TILE_W,
  };
}

/**
 * Integer tile under a world position, elevation-aware: tries levels top
 * down and returns the first tile whose registered level matches the
 * assumed lift (a click on a platform top selects the platform tile).
 */
export function worldToTileFloor(wx: number, wy: number): { tx: number; ty: number } {
  for (const e of [2, 1]) {
    const { tx, ty } = worldToTile(wx, wy + e * ELEV_PX);
    const t = { tx: Math.round(tx), ty: Math.round(ty) };
    if (elevationAt(t.tx, t.ty) === e) return t;
  }
  const { tx, ty } = worldToTile(wx, wy);
  return { tx: Math.round(tx), ty: Math.round(ty) };
}

/**
 * Depth for a ground-anchored object: its anchor world Y. Everything in the
 * world layer uses this one rule so sorting can never disagree.
 */
export function depthForWorldY(wy: number): number {
  return wy;
}

/**
 * The floor plane's base depth — tiles at +0, curbs/lips +1, void +2,
 * CAST SHADOWS +3, lamp pools +4. Every sprite (worldY depth) sorts far
 * above all of it.
 */
export const DEPTH_FLOOR = -100000;
/** Cast-shadow layer: above floor decor, below every sprite. */
export const DEPTH_SHADOW = DEPTH_FLOOR + 3;

/** World-space bounding box of the whole diamond map, for camera bounds. */
export function mapWorldBounds(size: number): { x: number; y: number; w: number; h: number } {
  const minX = -((size - 1) * TILE_W) / 2 - TILE_W / 2;
  const maxX = ((size - 1) * TILE_W) / 2 + TILE_W / 2;
  const minY = -TILE_H / 2;
  const maxY = (size - 1) * TILE_H + TILE_H / 2;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
