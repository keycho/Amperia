import { CONFIG } from '@shared/config';

/**
 * Isometric projection helpers (2:1 diamonds). World origin is the center of
 * tile (0,0); +tx runs down-right, +ty runs down-left on screen.
 */
export const TILE_W = CONFIG.tile.width;
export const TILE_H = CONFIG.tile.height;

/** World position of a tile's diamond center. */
export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  return {
    x: ((tx - ty) * TILE_W) / 2,
    y: ((tx + ty) * TILE_H) / 2,
  };
}

/** Fractional tile coordinates under a world position. */
export function worldToTile(wx: number, wy: number): { tx: number; ty: number } {
  return {
    tx: wy / TILE_H + wx / TILE_W,
    ty: wy / TILE_H - wx / TILE_W,
  };
}

/** Integer tile under a world position. */
export function worldToTileFloor(wx: number, wy: number): { tx: number; ty: number } {
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

/** World-space bounding box of the whole diamond map, for camera bounds. */
export function mapWorldBounds(size: number): { x: number; y: number; w: number; h: number } {
  const minX = -((size - 1) * TILE_W) / 2 - TILE_W / 2;
  const maxX = ((size - 1) * TILE_W) / 2 + TILE_W / 2;
  const minY = -TILE_H / 2;
  const maxY = (size - 1) * TILE_H + TILE_H / 2;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
