import { describe, expect, it } from 'vitest';
import { CONFIG, type NodeKind } from './config';
import { buildWorldMap, reachableTiles } from './map';

describe('buildWorldMap', () => {
  const map = buildWorldMap();

  it('is deterministic for a given seed', () => {
    const again = buildWorldMap();
    expect(again.props).toEqual(map.props);
    expect(again.nodes).toEqual(map.nodes);
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

  it('places the three salvage-shack landmarks', () => {
    const shacks = map.props.filter((p) => p.kind === 'shack');
    expect(shacks.length).toBe(3);
    expect(shacks.every((s) => s.w === 2 && s.h === 2)).toBe(true);
  });

  it('keeps the plaza-axis lanes clear of scatter clutter', () => {
    const c = Math.floor(map.size / 2);
    for (const p of map.props) {
      if (p.kind !== 'crate' && p.kind !== 'block') continue;
      const onLane = Math.abs(p.x - c) <= 1 || Math.abs(p.y - c) <= 1;
      expect(onLane).toBe(false);
    }
  });

  it('places the configured node count per kind, all blocked', () => {
    const counts: Record<NodeKind, number> = {
      junkHeap: 0,
      brassSeam: 0,
      amperite: 0,
      glowkoi: 0,
      antenna: 0,
    };
    for (const n of map.nodes) {
      counts[n.kind]++;
      expect(map.walkable[n.y]?.[n.x]).toBe(false);
    }
    const g = CONFIG.gathering;
    expect(counts.junkHeap).toBe(g.junkHeap.nodeCount);
    expect(counts.brassSeam).toBe(g.brassSeam.nodeCount);
    expect(counts.amperite).toBe(g.amperite.nodeCount);
    expect(counts.glowkoi).toBe(g.glowkoi.spotCount);
    expect(counts.antenna).toBe(g.antenna.shrineCount);
  });

  it('node ids are unique and sequential', () => {
    map.nodes.forEach((n, i) => expect(n.id).toBe(i));
  });

  it('glowkoi spots sit on canal tiles; every node kind is gatherable from an adjacent walkable tile', () => {
    for (const n of map.nodes) {
      if (n.kind === 'glowkoi') expect(map.canal[n.y]?.[n.x]).toBe(true);
      const adjacent = [
        [n.x + 1, n.y],
        [n.x - 1, n.y],
        [n.x, n.y + 1],
        [n.x, n.y - 1],
      ].some(([x, y]) => map.walkable[y as number]?.[x as number] === true);
      expect(adjacent).toBe(true);
    }
  });

  it('the canal is a built channel with walkable bridge rows', () => {
    const cv = CONFIG.canal;
    for (const y of cv.bridgeRows) {
      for (let x = cv.xMin; x <= cv.xMax; x++) {
        expect(map.walkable[y]?.[x]).toBe(true);
      }
    }
    let canalTiles = 0;
    for (const row of map.canal) for (const t of row) if (t) canalTiles++;
    expect(canalTiles).toBeGreaterThan(20);
  });

  it('every walkable tile is reachable from spawn (no sealed pockets)', () => {
    const { x, y } = CONFIG.player.spawn;
    const reached = reachableTiles(map, x, y);
    let walkableCount = 0;
    for (const row of map.walkable) for (const w of row) if (w) walkableCount++;
    expect(reached.size).toBe(walkableCount);
  });
});
