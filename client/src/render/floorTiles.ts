import Phaser from 'phaser';
import { MATERIAL_INT, PALETTE_INT, sat, splitTone } from '@shared/palette';
import { voxelHash } from './materials';
import { shade } from './voxel';

/**
 * Per-tile baked floor diamonds (floor-fix §1). Each tile is a textured
 * diamond built from chunky cells with deterministic per-tile variation —
 * the grid reads through TEXTURE CHANGE, never drawn gridlines.
 *
 * Seam prevention: every texture is drawn from axis-aligned 1px row spans
 * (no polygon AA), each row extends 1px past the exact diamond so adjacent
 * tiles overlap instead of gapping, and tiles sit at integer world
 * positions with even-sized textures.
 */

export type FloorKind =
  | 'asphalt'
  | 'paver'
  | 'paverLight'
  | 'plating'
  | 'deck'
  | 'rug'
  | 'coolant';

/** Baked at 2×: diamond 128×64 with a 2px pad each side. */
const W = 132;
const H = 68;
const CX = W / 2;
const PAD = 2;

const VARIANTS: Record<FloorKind, number> = {
  asphalt: 4,
  paver: 4,
  paverLight: 2,
  plating: 4,
  deck: 4,
  rug: 3,
  coolant: 3,
};

export function floorTileKey(kind: FloorKind, seed: number): string {
  const v = Math.abs(seed) % VARIANTS[kind];
  return `ftile-${kind}-${v}`;
}

/** Night-air mix — a light touch now (§2: cut the purple wash ~70%).
 *  The ground is the LOW saturation tier (R3b): desaturated a step and
 *  split-toned so it sits back behind props and light sources. */
function night(base: number, t: number): number {
  const dusk = PALETTE_INT.duskSky;
  const clamp = Math.max(0, Math.min(1, t));
  const mix = (sa: number, sb: number) => Math.round(sa + (sb - sa) * clamp);
  const r = mix((base >> 16) & 0xff, (dusk >> 16) & 0xff);
  const g = mix((base >> 8) & 0xff, (dusk >> 8) & 0xff);
  const b = mix(base & 0xff, dusk & 0xff);
  return splitTone(sat((r << 16) | (g << 8) | b, -0.14));
}

interface KindSpec {
  base: number;
  noise: number;
  /** Extra per-cell coloring on top of noise. */
  cell?: (col: number, row: number, v: number, h: (s: number) => number) => number | null;
  /** Post-pass: axis-aligned detail rects (already crisp). */
  post?: (g: Phaser.GameObjects.Graphics, v: number, rowSpan: (y: number) => [number, number]) => void;
}

const rowHalf = (y: number): number => {
  // Exact diamond half-width for texture row y (0..63 inside the pad).
  const dy = Math.abs(y - 31.5);
  return Math.max(2, 64 - 2 * dy + 1); // +1px overlap bleed
};

function specFor(kind: FloorKind, v: number): KindSpec {
  switch (kind) {
    case 'asphalt':
      return {
        base: night(MATERIAL_INT.asphalt, 0.12),
        noise: 0.07,
        cell: (c, r, vv, h) => {
          if (h(3) < 0.04) return shade(night(MATERIAL_INT.asphalt, 0.12), 0.1); // chip
          if (vv % 2 === 0 && Math.abs(r - (c * 0.45 - 2 - vv)) < 0.6) {
            return shade(night(MATERIAL_INT.asphaltDeep, 0.12), -0.12); // crack run
          }
          return null;
        },
      };
    case 'paver':
    case 'paverLight': {
      const base = night(MATERIAL_INT.concrete, 0.16);
      const lit = kind === 'paverLight' ? 0.1 : 0;
      return {
        base: shade(base, lit),
        noise: 0.045,
        cell: (c, r, _vv, h) => {
          // Four paver quadrants with a quiet checker offset.
          const q = (c < 8 ? 0 : 1) + (r < 4 ? 0 : 2);
          const qShade = [0.03, -0.03, -0.05, 0.05][q] as number;
          return shade(shade(base, lit + qShade), (h(11) - 0.5) * 0.05);
        },
        post: (g, _vv, span) => {
          // Grout along both diagonals of the tile (paver joints).
          const grout = shade(night(MATERIAL_INT.concreteDeep, 0.16), -0.05);
          g.fillStyle(grout, 0.85);
          for (const y of [31, 32]) {
            const [xl, xr] = span(y);
            g.fillRect(xl, PAD + y, xr - xl, 1);
          }
          for (let y = 0; y < 64; y++) {
            const [xl, xr] = span(y);
            if (CX - 1 >= xl && CX + 1 <= xr) g.fillRect(CX - 1, PAD + y, 2, 1);
          }
        },
      };
    }
    case 'plating':
      return {
        base: night(MATERIAL_INT.gunmetalDeep, 0.14),
        noise: 0.05,
        post: (g, vv, span) => {
          // Plate border: darken the outermost 5px of each row.
          const edge = shade(night(MATERIAL_INT.gunmetalDeep, 0.14), -0.14);
          g.fillStyle(edge, 0.9);
          for (let y = 0; y < 64; y++) {
            const [xl, xr] = span(y);
            const wEdge = Math.min(5, Math.max(0, (xr - xl) / 2));
            g.fillRect(xl, PAD + y, wEdge, 1);
            g.fillRect(xr - wEdge, PAD + y, wEdge, 1);
          }
          // Rivets near the four corners.
          const riv = shade(night(MATERIAL_INT.gunmetal, 0.1), 0.16);
          g.fillStyle(riv, 1);
          for (const [rx, ry] of [
            [CX, 10],
            [CX, 54],
            [CX - 42, 32],
            [CX + 40, 32],
          ] as const) {
            g.fillRect(rx - 1, PAD + ry - 1, 3, 2);
          }
          // A wear streak on some plates.
          if (vv % 2 === 1) {
            g.fillStyle(shade(night(MATERIAL_INT.rustDeep, 0.2), -0.05), 0.35);
            for (let y = 20; y < 44; y++) {
              const [xl, xr] = span(y);
              const sx = CX - 20 + (y - 20) * 0.6;
              if (sx > xl && sx + 3 < xr) g.fillRect(sx, PAD + y, 3, 1);
            }
          }
        },
      };
    case 'deck':
      return {
        base: night(MATERIAL_INT.wood, 0.16),
        noise: 0.06,
        cell: (_c, r, vv, h) => {
          // Board bands two cell-rows tall, shade alternating per board.
          const board = Math.floor((r + (vv % 2)) / 2);
          const b = shade(night(MATERIAL_INT.wood, 0.16), board % 2 === 0 ? 0.035 : -0.035);
          if (h(17) < 0.05) return shade(b, -0.12); // knot
          return shade(b, (h(19) - 0.5) * 0.05);
        },
        post: (g, vv, span) => {
          const seam = shade(night(MATERIAL_INT.woodDeep, 0.16), -0.2);
          g.fillStyle(seam, 0.8);
          for (const y of [15, 31, 47]) {
            const yy = (y + (vv % 2) * 8) % 62;
            const [xl, xr] = span(yy);
            g.fillRect(xl, PAD + yy, xr - xl, 2); // 2px: survives decimation
          }
        },
      };
    case 'rug': {
      const rugBase = [MATERIAL_INT.paintRose, MATERIAL_INT.paintOchre, MATERIAL_INT.paintTeal][
        v % 3
      ] as number;
      return {
        base: night(rugBase, 0.18),
        noise: 0.04,
        cell: (c, r, _vv, h) => {
          // Woven checker dots inside the border (col c, row r).
          if (c > 2 && c < 13 && r > 1 && r < 6 && (c + r) % 2 === 0 && h(23) < 0.8) {
            return shade(night(rugBase, 0.18), 0.07);
          }
          return null;
        },
        post: (g, _vv, span) => {
          // Border band: outermost 8px of each row, warmer.
          const border = shade(night(rugBase, 0.1), -0.16);
          g.fillStyle(border, 0.95);
          for (let y = 0; y < 64; y++) {
            const [xl, xr] = span(y);
            const wEdge = Math.min(8, Math.max(0, (xr - xl) / 2));
            g.fillRect(xl, PAD + y, wEdge, 1);
            g.fillRect(xr - wEdge, PAD + y, wEdge, 1);
          }
        },
      };
    }
    case 'coolant':
      // The one zone that stays plum-dark — it's shadowed water.
      return {
        base: night(PALETTE_INT.ink, 0.4),
        noise: 0.03,
        post: (g, vv, span) => {
          const ripple = shade(PALETTE_INT.neonCyan, -0.25);
          g.fillStyle(ripple, 0.12);
          for (const y of [14, 30, 46]) {
            const yy = (y + vv * 5) % 60 + 2;
            const [xl, xr] = span(yy);
            g.fillRect(xl + 6, PAD + yy, Math.max(0, xr - xl - 12), 2);
          }
        },
      };
  }
}

/** Bake every floor tile variant (call once from BootScene). */
export function bakeFloorTiles(scene: Phaser.Scene): void {
  const span = (y: number): [number, number] => {
    const half = rowHalf(y);
    return [CX - half, CX + half];
  };
  for (const kind of Object.keys(VARIANTS) as FloorKind[]) {
    for (let v = 0; v < VARIANTS[kind]; v++) {
      const key = `ftile-${kind}-${v}`;
      if (scene.textures.exists(key)) continue;
      const spec = specFor(kind, v);
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      // Cell pass: chunky 8×8px cells clipped to the diamond row spans.
      for (let y = 0; y < 64; y++) {
        const [xl, xr] = span(y);
        const row = Math.floor(y / 8);
        for (let col = 0; col < 16; col++) {
          const cx0 = Math.max(xl, PAD + col * 8);
          const cx1 = Math.min(xr, PAD + (col + 1) * 8);
          if (cx1 <= cx0) continue;
          const h = (salt: number) => voxelHash(col, row, v * 131, salt);
          let color = spec.cell?.(col, row, v, h) ?? null;
          if (color === null) {
            color = shade(spec.base, (h(7) - 0.5) * 2 * spec.noise);
          }
          g.fillStyle(color, 1);
          g.fillRect(cx0, PAD + y, cx1 - cx0, 1);
        }
      }
      spec.post?.(g, v, span);
      g.generateTexture(key, W, H);
      g.destroy();
    }
  }
}
