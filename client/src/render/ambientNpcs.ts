import Phaser from 'phaser';
import type { DistrictId } from '@shared/map';
import { DEPTH_SHADOW, depthForWorldY, TILE_H, tileToWorld } from '../iso/project';
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
    // W0 layout: the Griddle cook at the noodle corner, west end of the market.
    { code: '1:1:1:1:3:0', tile: [17, 41], dir: 'nw', turns: ['nw', 'ne'] },
    // The angler working the coolant canal from the towpath with a skimnet.
    { code: '1:3:2:2:2:2', tile: [10, 27], dir: 'nw', pose: 'skimnet' },
    // A loafer on the plaza's NE rim, watching the tram lane.
    { code: '1:2:5:5:1:0', tile: [34, 22], dir: 'se', turns: ['se', 'sw'] },
    // Browsers drifting the Nightstalls promenade — the market feels lived-in.
    { code: '1:0:3:3:4:1', tile: [24, 45], dir: 'ne', turns: ['ne', 'nw'] },
    { code: '1:4:3:3:1:0', tile: [19, 45], dir: 'ne' },
    // R2: the Nightstalls MERCHANT, a visible person behind the stand (33,44)
    // so the vendor you sell to is a face, not an empty counter.
    { code: '1:2:1:0:4:1', tile: [33, 43], dir: 'se', turns: ['se', 'sw'] },
    // A local warming themselves by the Great Dynamo.
    { code: '1:2:0:5:2:0', tile: [28, 34], dir: 'ne', turns: ['ne', 'nw'] },
  ],
  tangle: [
    // The mechanic riveting at the blocked-up Draymule (ember hair + teal
    // jacket — soot-on-rust vanished into the dark; extras must READ).
    { code: '1:4:1:1:2:3', tile: [25, 14], dir: 'nw', pose: 'riveter' },
    // A scavver picking over the container spill.
    { code: '1:2:0:0:3:0', tile: [20, 26], dir: 'ne', pose: 'magclaw' },
  ],
  stacks: [
    // The highest NPC life density in the city (D1c): the junction eats,
    // the registry queues, the Roofline trades and takes in the view.
    // (W0 layout: junction ~(20,28), registry (42,25), Roofline x25-35 y8-15.)
    { code: '1:1:4:1:3:0', tile: [17, 25], dir: 'se', turns: ['se', 'sw'] }, // noodle cook
    { code: '1:2:1:0:4:2', tile: [18, 27], dir: 'nw' }, // patron slurping
    { code: '1:3:2:4:2:1', tile: [44, 29], dir: 'ne', turns: ['ne', 'nw'] }, // registry queue
    { code: '1:0:5:2:0:3', tile: [43, 29], dir: 'ne' }, // second in line
    { code: '1:4:3:3:1:0', tile: [30, 11], dir: 'ne', turns: ['ne', 'nw'] }, // roofline browser
    { code: '1:2:0:5:2:0', tile: [34, 14], dir: 'se' }, // vista watcher
  ],
  terrarium: [
    // Gardeners at their beds — the gentlest shift in the city.
    { code: '1:1:2:2:3:0', tile: [17, 13], dir: 'ne', pose: 'magclaw' }, // digging a bed
    { code: '1:3:5:0:2:2', tile: [29, 20], dir: 'nw', turns: ['nw', 'ne'] }, // trellis keeper
    { code: '1:0:1:5:0:1', tile: [9, 19], dir: 'se', turns: ['se', 'sw'] }, // promenade stroller
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
    // G1: citizens ground like players — spark bakes carry no cast shadow,
    // so the walking-entity contact ellipse goes underfoot here too.
    const shadow = scene.add.image(x, anchorY - 2, 'fx-contact-shadow');
    shadow.setScale(0.62);
    shadow.setAlpha(0.75);
    shadow.setDepth(DEPTH_SHADOW);
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
