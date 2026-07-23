import Phaser from 'phaser';
import type { WorldMap } from '@shared/map';
import { blendInt, MATERIAL_INT, PALETTE_INT } from '@shared/palette';
import { DEPTH_FLOOR, tileToWorld, TILE_H, TILE_W } from '../iso/project';
import { baseFloorKind, night } from './floorTiles';
import { voxelHash } from './materials';
import { shade } from './voxel';

/**
 * G2 — AUTHORED GROUND VIGNETTES: a flat decal layer of hand-designed
 * pixel grime laid during district build. Pavement cracks, dirt patches,
 * dry weed tufts, moss edges, stain rings, rust runs, paper scraps — each
 * with variants, per-instance flip and jitter, placed DETERMINISTICALLY
 * (voxelHash on tile coords) so every client walks the same streets and
 * nothing shimmers between sessions. Density follows zone character:
 * the market row collects stains and scraps, deck edges sprout weeds and
 * rust, the plaza stays swept. Flat ground layer — exempt from the prop
 * density cap, hard-capped itself at ~1 decal per 8 walkable tiles.
 */

type DecalKind = 'crack' | 'dirt' | 'weed' | 'moss' | 'stain' | 'scrap' | 'rust';

const VARIANTS: Record<DecalKind, number> = {
  crack: 3,
  dirt: 2,
  weed: 2,
  moss: 2,
  stain: 2,
  scrap: 2,
  rust: 2,
};

const key = (k: DecalKind, v: number): string => `decal-${k}-${v}`;

/** Bake every decal texture once at boot (2×, rendered at 0.5). */
export function bakeGroundDecals(scene: Phaser.Scene): void {
  if (scene.textures.exists(key('crack', 0))) return;
  const W = 64;
  const H = 32;

  const make = (k: DecalKind, v: number, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key(k, v), W, H);
    g.destroy();
  };
  const h = (a: number, b: number, s: number): number => voxelHash(a, b, 0, s);

  // Pavement cracks: a dark meander with a fork, per-variant path.
  for (let v = 0; v < VARIANTS.crack; v++) {
    make('crack', v, (g) => {
      const dark = shade(night(MATERIAL_INT.asphaltDeep, 0.1), -0.3);
      g.lineStyle(2.5, dark, 0.9);
      let x = 8 + v * 4;
      let y = 20 - v * 3;
      g.beginPath();
      g.moveTo(x, y);
      for (let i = 0; i < 5; i++) {
        x += 8 + h(v, i, 3) * 6;
        y += (h(v, i, 5) - 0.5) * 9;
        g.lineTo(x, y);
      }
      g.strokePath();
      // The fork.
      g.lineStyle(1.8, dark, 0.8);
      const fx = 22 + v * 6;
      const fy = 18 - v * 2;
      g.lineBetween(fx, fy, fx + 7, fy + 5 - v * 3);
    });
  }

  // Dirt patches: low-alpha warm-dark blobs.
  for (let v = 0; v < VARIANTS.dirt; v++) {
    make('dirt', v, (g) => {
      const soil = blendInt(night(MATERIAL_INT.asphaltDeep, 0.12), MATERIAL_INT.rustDeep, 0.35);
      for (let i = 0; i < 4 + v; i++) {
        g.fillStyle(soil, 0.26 + h(v, i, 7) * 0.14);
        g.fillEllipse(
          16 + h(v, i, 11) * 30,
          10 + h(v, i, 13) * 12,
          10 + h(v, i, 17) * 14,
          5 + h(v, i, 19) * 6,
        );
      }
    });
  }

  // Dry weed tufts: a few thin blades from a dark base dot.
  for (let v = 0; v < VARIANTS.weed; v++) {
    make('weed', v, (g) => {
      const dry = blendInt(PALETTE_INT.solarGreen, MATERIAL_INT.wood, 0.45);
      const base = shade(dry, -0.35);
      g.fillStyle(base, 0.8);
      g.fillEllipse(30, 24, 8, 3);
      for (let i = 0; i < 5 + v; i++) {
        const bx = 26 + h(v, i, 23) * 9;
        g.lineStyle(1.4, i % 2 === 0 ? dry : shade(dry, -0.15), 0.9);
        g.lineBetween(bx, 24, bx + (h(v, i, 29) - 0.5) * 7, 24 - 6 - h(v, i, 31) * 7);
      }
    });
  }

  // Moss edges: a soft desaturated-green patch hugging a corner.
  for (let v = 0; v < VARIANTS.moss; v++) {
    make('moss', v, (g) => {
      const moss = blendInt(PALETTE_INT.solarGreen, MATERIAL_INT.gunmetalDeep, 0.55);
      for (let i = 0; i < 6; i++) {
        g.fillStyle(shade(moss, (h(v, i, 37) - 0.5) * 0.2), 0.42 + h(v, i, 41) * 0.24);
        g.fillEllipse(10 + i * 7 + v * 3, 22 - (i % 3) * 4, 9, 4.5);
      }
    });
  }

  // Stain rings: a partial dark arc, like something round sat there wet.
  for (let v = 0; v < VARIANTS.stain; v++) {
    make('stain', v, (g) => {
      const wet = shade(night(MATERIAL_INT.concreteDeep, 0.15), -0.12);
      g.lineStyle(2.4, wet, 0.55);
      g.beginPath();
      g.arc(30, 15, 8 + v * 4, 0.4 + v, 0.4 + v + 4.6);
      g.strokePath();
      g.fillStyle(wet, 0.18);
      g.fillEllipse(30, 15, 14 + v * 6, 7 + v * 3);
    });
  }

  // Paper scraps: pale parallelograms blown against the ground.
  for (let v = 0; v < VARIANTS.scrap; v++) {
    make('scrap', v, (g) => {
      const paper = shade(night(MATERIAL_INT.concrete, 0.1), 0.35);
      for (let i = 0; i < 2 + v; i++) {
        const px = 12 + h(v, i, 43) * 34;
        const py = 10 + h(v, i, 47) * 12;
        const sk = (h(v, i, 53) - 0.5) * 4;
        g.fillStyle(shade(paper, -h(v, i, 59) * 0.15), 0.85);
        g.fillPoints(
          [
            new Phaser.Geom.Point(px, py),
            new Phaser.Geom.Point(px + 6, py + sk),
            new Phaser.Geom.Point(px + 7, py + sk + 4),
            new Phaser.Geom.Point(px + 1, py + 4),
          ],
          true,
        );
      }
    });
  }

  // Rust runs: drip streaks bleeding from a stain point (under metal).
  for (let v = 0; v < VARIANTS.rust; v++) {
    make('rust', v, (g) => {
      g.fillStyle(MATERIAL_INT.rustDeep, 0.55);
      g.fillEllipse(30, 8, 12 + v * 4, 4);
      for (let i = 0; i < 4; i++) {
        const rx = 25 + h(v, i, 61) * 12;
        g.lineStyle(1.8, blendInt(MATERIAL_INT.rust, MATERIAL_INT.rustDeep, 0.5), 0.7);
        g.lineBetween(rx, 9, rx, 14 + h(v, i, 67) * 9);
      }
    });
  }
}

/** Zone read for a tile → decal palette + density (1 in N tiles). */
function zoneFor(
  map: WorldMap,
  tx: number,
  ty: number,
  nearMarket: (x: number, y: number) => boolean,
): { kinds: DecalKind[]; oneIn: number } {
  const kind = baseFloorKind(map, tx, ty);
  const plaza = map.plaza;
  const inPlaza =
    plaza.radius > 0 &&
    Math.max(Math.abs(tx - plaza.cx), Math.abs(ty - plaza.cy)) <= plaza.radius;
  if (inPlaza) return { kinds: ['stain', 'scrap'], oneIn: 16 }; // swept nightly
  if (nearMarket(tx, ty)) return { kinds: ['stain', 'scrap', 'stain'], oneIn: 7 };
  if (kind === 'deck') return { kinds: ['weed', 'rust', 'stain'], oneIn: 9 };
  if (kind === 'plating') return { kinds: ['moss', 'rust', 'dirt'], oneIn: 9 };
  // Asphalt streets: cracks and dirt, the city's old skin.
  return { kinds: ['crack', 'dirt', 'weed', 'crack'], oneIn: 8 };
}

/**
 * Lay the decal layer for a district (call after floors, before props).
 * Deterministic per tile; hard-capped at walkable/8 instances.
 */
export function placeGroundDecals(scene: Phaser.Scene, map: WorldMap): void {
  bakeGroundDecals(scene);
  const marketAnchors = map.props
    .filter((p) => p.kind === 'stall' || p.kind === 'merchant')
    .map((p) => ({ x: p.x, y: p.y }));
  const nearMarket = (x: number, y: number): boolean =>
    marketAnchors.some((a) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) <= 5);

  let walkable = 0;
  for (let ty = 0; ty < map.size; ty++) {
    for (let tx = 0; tx < map.size; tx++) if (map.walkable[ty]?.[tx] === true) walkable += 1;
  }
  const cap = Math.floor(walkable / 8);
  let placed = 0;

  for (let ty = 0; ty < map.size && placed < cap; ty++) {
    for (let tx = 0; tx < map.size && placed < cap; tx++) {
      if (map.walkable[ty]?.[tx] !== true) continue;
      const zone = zoneFor(map, tx, ty, nearMarket);
      if (voxelHash(tx, ty, 0, 101) >= 1 / zone.oneIn) continue;
      const k = zone.kinds[
        Math.floor(voxelHash(tx, ty, 0, 103) * zone.kinds.length) % zone.kinds.length
      ] as DecalKind;
      const v = Math.floor(voxelHash(tx, ty, 0, 107) * VARIANTS[k]) % VARIANTS[k];
      const { x, y } = tileToWorld(tx, ty);
      const img = scene.add.image(
        x + (voxelHash(tx, ty, 0, 109) - 0.5) * TILE_W * 0.5,
        y + (voxelHash(tx, ty, 0, 113) - 0.5) * TILE_H * 0.5,
        key(k, v),
      );
      img.setScale(0.5);
      img.setFlipX(voxelHash(tx, ty, 0, 127) < 0.5);
      img.setAlpha(0.8 + voxelHash(tx, ty, 0, 131) * 0.2);
      // Above the floor tiles, below cast shadows and everything standing.
      img.setDepth(DEPTH_FLOOR + 1);
      placed += 1;
    }
  }
}
