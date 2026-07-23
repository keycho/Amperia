import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { buildDistrictMap } from './map';

/**
 * FIRST BOLTS safety audit — the guided loop must be bite-proof.
 *
 * A brand-new Spark follows the tutorial arrow from spawn to the nearest
 * junk heap. Mob AI (shared/mobs.ts) only ever aggros a target standing
 * within `leashRadiusTiles` of the mob's HOME tile (`targetInLeash` gates
 * both idle→chase and staying in chase), so the exact danger envelope of
 * a home box is the box expanded by the leash radius. If the arrow heap —
 * or the straight corridor a newbie walks to reach it — sits inside that
 * envelope, a fresh 30-HP Spark can get mauled during the tutorial.
 *
 * This failed live during the F5 checkpoint shoots (two retakes: one
 * death, one 2/30 escape) before the shoot script learned to dodge mobs.
 * A new player cannot dodge what the arrow points at, so the map/config
 * must guarantee it instead. Fix on failure: move the heap pocket or the
 * mob home box in config — never special-case the AI.
 */

const box = CONFIG.combat.scuttlebot.homeBox;
const leash = CONFIG.combat.scuttlebot.leashRadiusTiles;

/** Chebyshev distance from a point to the home-box rectangle (0 inside). */
function distToBox(x: number, y: number): number {
  const dx = Math.max(box.x0 - x, 0, x - box.x1);
  const dy = Math.max(box.y0 - y, 0, y - box.y1);
  return Math.max(dx, dy);
}

/** The tutorial's heap pick — mirrors WorldScene.startTutorial exactly:
 *  nearest junkHeap to spawn by Manhattan distance. */
function arrowHeap(): { id: number; x: number; y: number } {
  const map = buildDistrictMap('filament');
  const spawn = CONFIG.player.spawn;
  const heaps = map.nodes.filter((n) => n.kind === 'junkHeap');
  expect(heaps.length).toBeGreaterThan(0);
  let best = heaps[0] as { id: number; x: number; y: number };
  let bestD = Infinity;
  for (const h of heaps) {
    const d = Math.abs(h.x - spawn.x) + Math.abs(h.y - spawn.y);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

describe('FIRST BOLTS path vs the scuttlebot fringe (Filament)', () => {
  it('spawn itself is outside mob reach', () => {
    const spawn = CONFIG.player.spawn;
    expect(distToBox(spawn.x, spawn.y)).toBeGreaterThan(leash);
  });

  it('the arrow heap is outside mob reach', () => {
    const h = arrowHeap();
    expect(
      distToBox(h.x, h.y),
      `tutorial heap #${h.id} at (${h.x},${h.y}) is within leash+aggro of the scuttlebot home box`,
    ).toBeGreaterThan(leash);
  });

  it('the straight corridor spawn → arrow heap never enters mob reach', () => {
    const spawn = CONFIG.player.spawn;
    const h = arrowHeap();
    const steps = Math.max(Math.abs(h.x - spawn.x), Math.abs(h.y - spawn.y));
    for (let i = 0; i <= steps; i++) {
      const x = spawn.x + ((h.x - spawn.x) * i) / steps;
      const y = spawn.y + ((h.y - spawn.y) * i) / steps;
      expect(
        distToBox(x, y),
        `corridor point (${x.toFixed(1)},${y.toFixed(1)}) is inside the scuttlebot envelope`,
      ).toBeGreaterThan(leash);
    }
  });

  it('the pulled-back home box still seats the full scuttlebot pack', () => {
    // Mirrors FilamentRoom.spawnMobs: scan the box row-major for walkable
    // tiles at least 3 apart. Shrinking the box must not shrink the pack.
    const map = buildDistrictMap('filament');
    const seats: Array<{ x: number; y: number }> = [];
    const want = CONFIG.combat.scuttlebot.count;
    for (let y = box.y0; y <= box.y1 && seats.length < want; y++) {
      for (let x = box.x0; x <= box.x1 && seats.length < want; x++) {
        if (map.walkable[y]?.[x] !== true) continue;
        if (seats.some((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) < 3)) continue;
        seats.push({ x, y });
      }
    }
    expect(seats.length).toBe(want);
  });

  it('every heap in the newbie pocket (≤14 tiles of spawn) is outside mob reach', () => {
    // The arrow marks ONE heap, but a fresh Spark works whatever glints
    // nearby if it is depleted — the whole spawn pocket must be safe.
    const map = buildDistrictMap('filament');
    const spawn = CONFIG.player.spawn;
    for (const n of map.nodes) {
      if (n.kind !== 'junkHeap') continue;
      const near = Math.max(Math.abs(n.x - spawn.x), Math.abs(n.y - spawn.y)) <= 14;
      if (!near) continue;
      expect(
        distToBox(n.x, n.y),
        `pocket heap #${n.id} at (${n.x},${n.y}) is within scuttlebot reach`,
      ).toBeGreaterThan(leash);
    }
  });
});
