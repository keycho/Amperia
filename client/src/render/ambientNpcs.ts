import Phaser from 'phaser';
import type { DistrictId } from '@shared/map';
import { depthForWorldY, TILE_H, tileToWorld } from '../iso/project';
import { bakeSparkAppearance } from './sparkModel';
import { worldSpriteTint } from './styleConfig';
import { addVoxelSprite, applyVoxelTexture } from './voxel';

/**
 * V6 ambient life: a handful of idle CITIZENS — background Sparks living
 * their small lives. Pure presentation: client-only, no nameplates, no
 * interaction, never a synced entity. They breathe, shift their weight,
 * and occasionally turn — extras on set, not cast (§12A: light is life,
 * but so are people).
 */

type Dir = 'se' | 'sw' | 'ne' | 'nw';

interface AmbientNpcDef {
  /** Versioned appearance code — distinct citizens, sanctioned tables. */
  code: string;
  tile: [number, number];
  dir: Dir;
  /** Optional tool pose (the angler skims, the mechanic rivets). */
  pose?: string;
  /** Facings cycled on a slow clock; omit to hold still. */
  turns?: Dir[];
}

const CITIZENS: Record<DistrictId, AmbientNpcDef[]> = {
  filament: [
    // The Griddle cook, stirring behind the counter.
    { code: '1:1:1:1:3:0', tile: [35, 26], dir: 'sw', turns: ['sw', 'se'] },
    // The angler working the canal with a skimnet.
    { code: '1:3:2:2:2:2', tile: [6, 25], dir: 'nw', pose: 'skimnet' },
    // A loafer at the dock's east end, watching the lane.
    { code: '1:2:5:5:1:0', tile: [18, 3], dir: 'se', turns: ['se', 'sw'] },
    // A browser drifting along the Nightstalls.
    { code: '1:0:3:3:4:1', tile: [29, 18], dir: 'ne', turns: ['ne', 'nw'] },
  ],
  tangle: [
    // The mechanic riveting at the blocked-up Draymule (ember hair + teal
    // jacket — soot-on-rust vanished into the dark; extras must READ).
    { code: '1:4:1:1:2:3', tile: [25, 14], dir: 'nw', pose: 'riveter' },
    // A scavver picking over the container spill.
    { code: '1:2:0:0:3:0', tile: [20, 26], dir: 'ne', pose: 'magclaw' },
  ],
  stacks: [
    // The noodle-cart cook at the junction (D1b brings the full crowd —
    // the Stacks carries the highest NPC life density in the city).
    { code: '1:1:4:1:3:0', tile: [12, 14], dir: 'se', turns: ['se', 'sw'] },
    // A balcony watcher by the registry, seeing who signs.
    { code: '1:3:2:4:2:1', tile: [23, 19], dir: 'ne', turns: ['ne', 'nw'] },
  ],
};

/** Bake + place the district's citizens. Call once from world setup. */
export function placeAmbientNpcs(scene: Phaser.Scene, district: DistrictId): void {
  const defs = CITIZENS[district];
  defs.forEach((def, i) => {
    bakeSparkAppearance(scene, def.code);
    const texFor = (dir: Dir) =>
      `spark@${def.code}#none-${dir}${def.pose !== undefined ? `-pose-${def.pose}` : ''}`;
    const { x, y } = tileToWorld(def.tile[0], def.tile[1]);
    const anchorY = y + TILE_H / 2;
    const img = addVoxelSprite(scene, texFor(def.dir), x, anchorY);
    const wt = worldSpriteTint();
    if (wt !== null) img.setTint(wt);
    img.setDepth(depthForWorldY(anchorY));
    // Breathing: a slow, tiny settle — alive, not animated furniture.
    scene.tweens.add({
      targets: img,
      scaleY: { from: img.scaleY, to: img.scaleY * 0.985 },
      duration: 1400 + i * 180,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
    // The slow turn: shift facing every so often, staggered per citizen.
    const turns = def.turns;
    if (turns !== undefined && turns.length > 1) {
      let at = 0;
      scene.time.addEvent({
        delay: 5200 + i * 1700,
        loop: true,
        callback: () => {
          at = (at + 1) % turns.length;
          applyVoxelTexture(img, texFor(turns[at] as Dir));
        },
      });
    }
  });
}
