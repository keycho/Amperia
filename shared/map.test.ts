import { describe, expect, it } from 'vitest';
import { CONFIG, type NodeKind } from './config';
import { buildStacksMap, buildTangleMap, buildTerrariumMap, buildWorldMap, reachableTiles } from './map';

describe('buildTerrariumMap', () => {
  const t = buildTerrariumMap();

  it('is deterministic and marked as the terrarium', () => {
    expect(buildTerrariumMap().props).toEqual(t.props);
    expect(t.district).toBe('terrarium');
  });

  it('every walkable tile is reachable across all three terrace bands', () => {
    const spawn = CONFIG.travel.terrariumSpawn;
    const reached = reachableTiles(t, spawn.x, spawn.y);
    let walkableCount = 0;
    for (const row of t.walkable) for (const w of row) if (w) walkableCount++;
    expect(reached.size).toBe(walkableCount);
    // At least one reachable tile on each band.
    for (const level of [0, 1, 2]) {
      const found = [...reached].some((key) => {
        const y = Math.floor(key / t.size);
        const x = key % t.size;
        return (t.elevation[y]?.[x] ?? -1) === level;
      });
      expect(found).toBe(true);
    }
  });

  it('the Mother Trellis stands and the berths are clear 3×3 pads', () => {
    expect(t.props.filter((p) => p.kind === 'mothertrellis').length).toBe(1);
    expect(t.loftberths.length).toBeGreaterThanOrEqual(4);
    for (const b of t.loftberths) {
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          expect(t.walkable[b.y + dy]?.[b.x + dx]).toBe(true);
        }
      }
    }
  });

  it('compost heaps hit the config count, all gatherable', () => {
    const heaps = t.nodes.filter((n) => n.kind === 'junkHeap');
    expect(heaps.length).toBe(CONFIG.terrarium.compostCount);
    for (const n of heaps) {
      const adjacent = [
        [n.x + 1, n.y],
        [n.x - 1, n.y],
        [n.x, n.y + 1],
        [n.x, n.y - 1],
      ].some(([x, y]) => t.walkable[y as number]?.[x as number] === true);
      expect(adjacent).toBe(true);
    }
  });

  it('blocks every prop footprint and grows real garden mass', () => {
    for (const p of t.props) {
      for (let dy = 0; dy < p.h; dy++) {
        for (let dx = 0; dx < p.w; dx++) {
          expect(t.walkable[p.y + dy]?.[p.x + dx]).toBe(false);
        }
      }
    }
    expect(t.props.filter((p) => p.kind === 'gardenbed').length).toBeGreaterThanOrEqual(12);
    expect(t.props.filter((p) => p.kind === 'toolshed').length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildStacksMap', () => {
  const stacks = buildStacksMap();

  it('is deterministic and marked as the stacks', () => {
    expect(buildStacksMap().props).toEqual(stacks.props);
    expect(stacks.district).toBe('stacks');
  });

  it('every walkable tile is reachable from the gate — including the Roofline', () => {
    const spawn = CONFIG.travel.stacksSpawn;
    expect(stacks.walkable[spawn.y]?.[spawn.x]).toBe(true);
    const reached = reachableTiles(stacks, spawn.x, spawn.y);
    let walkableCount = 0;
    for (const row of stacks.walkable) for (const w of row) if (w) walkableCount++;
    expect(reached.size).toBe(walkableCount);
    // The vista catwalk sits ON the +3 terrace and must be reachable.
    const R = CONFIG.stacks.roofline;
    const vista = stacks.catwalks.find(
      (c) => c.x >= R.x0 && c.x <= R.x1 && c.y >= R.y0 && c.y <= R.y1,
    );
    expect(vista).toBeDefined();
    expect(stacks.elevation[(vista as { y: number }).y]?.[(vista as { x: number }).x]).toBe(R.level);
    expect(reached.has((vista as { y: number }).y * stacks.size + (vista as { x: number }).x)).toBe(true);
  });

  it('the Roofline holds its shrines, market, and rim rails', () => {
    const R = CONFIG.stacks.roofline;
    const onRoof = (x: number, y: number) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1;
    const shrines = stacks.nodes.filter((n) => n.kind === 'antenna' && onRoof(n.x, n.y));
    expect(shrines.length).toBe(CONFIG.stacks.antennaRoofline);
    for (const n of shrines) expect(stacks.elevation[n.y]?.[n.x]).toBe(R.level);
    expect(stacks.props.filter((p) => p.kind === 'stall' && onRoof(p.x, p.y)).length).toBe(2);
    expect(stacks.props.some((p) => p.kind === 'guardrail' && onRoof(p.x, p.y))).toBe(true);
  });

  it('places the config node counts, all blocked and gatherable', () => {
    const junk = stacks.nodes.filter((n) => n.kind === 'junkHeap');
    const ants = stacks.nodes.filter((n) => n.kind === 'antenna');
    expect(junk.length).toBe(CONFIG.stacks.junkCount);
    expect(ants.length).toBe(CONFIG.stacks.antennaGround + CONFIG.stacks.antennaRoofline);
    for (const n of stacks.nodes) {
      expect(stacks.walkable[n.y]?.[n.x]).toBe(false);
      const adjacent = [
        [n.x + 1, n.y],
        [n.x - 1, n.y],
        [n.x, n.y + 1],
        [n.x, n.y - 1],
      ].some(([x, y]) => stacks.walkable[y as number]?.[x as number] === true);
      expect(adjacent).toBe(true);
    }
  });

  it('the Spire, the registry, and the junction furniture stand', () => {
    expect(stacks.props.filter((p) => p.kind === 'spire').length).toBe(1);
    expect(stacks.props.filter((p) => p.kind === 'registry').length).toBe(1);
    expect(stacks.props.filter((p) => p.kind === 'noodlecart').length).toBe(1);
    expect(stacks.props.filter((p) => p.kind === 'treeplanter').length).toBe(1);
    expect(stacks.props.filter((p) => p.kind === 'tower').length).toBeGreaterThanOrEqual(24);
  });

  it('blocks every prop footprint', () => {
    for (const p of stacks.props) {
      for (let dy = 0; dy < p.h; dy++) {
        for (let dx = 0; dx < p.w; dx++) {
          expect(stacks.walkable[p.y + dy]?.[p.x + dx]).toBe(false);
        }
      }
    }
  });
});

describe('buildTangleMap', () => {
  const tangle = buildTangleMap();

  it('is deterministic and marked as the tangle', () => {
    expect(buildTangleMap().props).toEqual(tangle.props);
    expect(tangle.district).toBe('tangle');
  });

  it('has denser junk/brass/amperite than the Filament config counts', () => {
    const count = (k: string) => tangle.nodes.filter((n) => n.kind === k).length;
    expect(count('junkHeap')).toBeGreaterThan(CONFIG.gathering.junkHeap.nodeCount);
    expect(count('brassSeam')).toBeGreaterThan(CONFIG.gathering.brassSeam.nodeCount);
    expect(count('amperite')).toBeGreaterThan(CONFIG.gathering.amperite.nodeCount);
    expect(count('glowkoi')).toBe(0);
  });

  it('every walkable tile is reachable from the tangle gate', () => {
    const spawn = CONFIG.travel.tangleSpawn;
    expect(tangle.walkable[spawn.y]?.[spawn.x]).toBe(true);
    const reached = reachableTiles(tangle, spawn.x, spawn.y);
    let walkableCount = 0;
    for (const row of tangle.walkable) for (const w of row) if (w) walkableCount++;
    expect(reached.size).toBe(walkableCount);
  });

  it('V5: the overlook terrace is dressed and its rim railed', () => {
    const rails = tangle.props.filter((p) => p.kind === 'guardrail');
    expect(rails.length).toBeGreaterThanOrEqual(4);
    for (const r of rails) {
      expect(tangle.elevation[r.y]?.[r.x]).toBe(1); // rails live on the rim
      expect(tangle.ramp[r.y]?.[r.x]).toBe(false); // never on a stair
    }
  });
});

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

  it('V5: the footbridge crosses the canal raised, both approaches ramped', () => {
    expect(map.footbridges.length).toBe(2);
    for (const fb of map.footbridges) {
      expect(map.walkable[fb.y]?.[fb.x]).toBe(true);
      expect(map.canal[fb.y]?.[fb.x]).toBe(false);
      expect(map.elevation[fb.y]?.[fb.x]).toBe(1);
    }
    const y = map.footbridges[0]?.y as number;
    const xs = map.footbridges.map((f) => f.x);
    const west = Math.min(...xs) - 1;
    const east = Math.max(...xs) + 1;
    expect(map.ramp[y]?.[west] === true || map.ramp[y]?.[east] === true).toBe(true);
  });

  it('V5: no glowkoi spot shares the footbridge row', () => {
    for (const n of map.nodes) {
      if (n.kind === 'glowkoi') expect(n.y).not.toBe(map.footbridges[0]?.y);
    }
  });

  it('blocks every prop footprint (the Ledgerhouse hall stays walkable)', () => {
    for (const p of map.props) {
      for (let dy = 0; dy < p.h; dy++) {
        for (let dx = 0; dx < p.w; dx++) {
          const tx = p.x + dx;
          const ty = p.y + dy;
          // S5: the bank's interior hall + door are carved back open by
          // design — the ONLY prop allowed walkable tiles, and each one
          // must be a registered bankInterior tile.
          if (p.kind === 'ledgerhouse' && map.walkable[ty]?.[tx] === true) {
            expect(map.bankInterior.some((t) => t.x === tx && t.y === ty)).toBe(true);
            continue;
          }
          expect(map.walkable[ty]?.[tx]).toBe(false);
        }
      }
    }
  });

  it('the Ledgerhouse hall is inside the building and reachable', () => {
    const bank = map.props.find((p) => p.kind === 'ledgerhouse');
    expect(bank).toBeDefined();
    expect(map.bankInterior.length).toBeGreaterThanOrEqual(4);
    for (const t of map.bankInterior) {
      expect(map.walkable[t.y]?.[t.x]).toBe(true);
      expect(t.x).toBeGreaterThanOrEqual((bank as { x: number }).x);
      expect(t.y).toBeGreaterThanOrEqual((bank as { y: number }).y);
    }
  });

  it('spawn tile is walkable', () => {
    const { x, y } = CONFIG.player.spawn;
    expect(map.walkable[y]?.[x]).toBe(true);
  });

  it('walls the edges with buildings and keeps the market spine', () => {
    const shacks = map.props.filter((p) => p.kind === 'shack');
    expect(shacks.length).toBeGreaterThanOrEqual(10);
    expect(shacks.every((s) => s.w === 2 && s.h === 2)).toBe(true);
    expect(map.props.filter((p) => p.kind === 'tramgate').length).toBe(1);
    expect(map.props.filter((p) => p.kind === 'stall').length).toBe(8);
    expect(map.props.filter((p) => p.kind === 'ropepost').length).toBeGreaterThanOrEqual(6);
  });

  it('every lane stall is a rentable pitch with stable sequential ids', () => {
    const stalls = map.props.filter((p) => p.kind === 'stall');
    expect(map.shopStalls.length).toBe(stalls.length);
    map.shopStalls.forEach((s, i) => {
      expect(s.id).toBe(i);
      const prop = stalls[i];
      expect({ x: s.x, y: s.y }).toEqual({ x: prop?.x, y: prop?.y });
    });
  });

  it('keeps the market lane clear between the Tramgate and the plaza', () => {
    for (let x = 28; x <= 35; x++) {
      expect(map.walkable[20]?.[x]).toBe(true);
    }
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
