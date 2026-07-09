import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { buildWorldMap, reachableTiles } from './map';

describe('buildWorldMap', () => {
  const map = buildWorldMap();

  it('is deterministic for a given seed', () => {
    const again = buildWorldMap();
    expect(again.props).toEqual(map.props);
    expect(again.walkable).toEqual(map.walkable);
  });

  it('has the configured size', () => {
    expect(map.size).toBe(CONFIG.map.size);
    expect(map.walkable.length).toBe(map.size);
    expect(map.walkable.every((row) => row.length === map.size)).toBe(true);
  });

  it('blocks every prop footprint', () => {
    for (const p of map.props) {
      for (let dy = 0; dy < p.h; dy++) {
        for (let dx = 0; dx < p.w; dx++) {
          expect(map.walkable[p.y + dy]?.[p.x + dx]).toBe(false);
        }
      }
    }
  });

  it('spawn tile is walkable', () => {
    const { x, y } = CONFIG.player.spawn;
    expect(map.walkable[y]?.[x]).toBe(true);
  });

  it('scatters the configured junk-heap count, spaced and blocked', () => {
    const cfg = CONFIG.gathering.junkHeap;
    expect(map.junkNodes).toHaveLength(cfg.nodeCount);
    for (const n of map.junkNodes) {
      expect(map.walkable[n.y]?.[n.x]).toBe(false);
      for (const other of map.junkNodes) {
        if (other.id === n.id) continue;
        const d = Math.max(Math.abs(other.x - n.x), Math.abs(other.y - n.y));
        expect(d).toBeGreaterThanOrEqual(cfg.minNodeSpacing);
      }
    }
  });

  it('every walkable tile is reachable from spawn (no sealed pockets)', () => {
    const { x, y } = CONFIG.player.spawn;
    const reached = reachableTiles(map, x, y);
    let walkableCount = 0;
    for (const row of map.walkable) for (const w of row) if (w) walkableCount++;
    expect(reached.size).toBe(walkableCount);
  });
});
