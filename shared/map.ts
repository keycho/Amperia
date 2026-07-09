import { CONFIG } from './config';
import { makeRng, randInt, type Rng } from './rng';

/**
 * The prototype map: one 40×40 slice of The Filament — plaza decking around
 * the Great Dynamo, a Nightstalls-style stall row, and a scrappier fringe
 * toward the edges. 0/1 walkability plus a prop list the client renders.
 * Deterministic from CONFIG.map.seed so client and (later) server agree.
 */

export type PropKind = 'dynamo' | 'stall' | 'crate' | 'block' | 'planter';

export interface Prop {
  kind: PropKind;
  /** North-west tile of the footprint. */
  x: number;
  y: number;
  /** Footprint size in tiles. */
  w: number;
  h: number;
  /** Visual variant index (client picks the sprite). */
  variant: number;
}

export interface WorldMap {
  size: number;
  /** walkable[y][x] — true = a Spark can stand here. */
  walkable: boolean[][];
  props: Prop[];
  /** Junk-heap gather nodes (blocked tiles; gathered from adjacent). */
  junkNodes: Array<{ id: number; x: number; y: number }>;
  /** Tiles inside the plaza decking (warmer floor variant). */
  plaza: { cx: number; cy: number; radius: number };
}

function blockFootprint(walkable: boolean[][], p: Prop): void {
  for (let dy = 0; dy < p.h; dy++) {
    for (let dx = 0; dx < p.w; dx++) {
      const row = walkable[p.y + dy];
      if (row) row[p.x + dx] = false;
    }
  }
}

function isAreaFree(walkable: boolean[][], x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const row = walkable[y + dy];
      if (!row || row[x + dx] !== true) return false;
    }
  }
  return true;
}

export function buildWorldMap(seed: number = CONFIG.map.seed): WorldMap {
  const size = CONFIG.map.size;
  const rng: Rng = makeRng(seed);
  const walkable: boolean[][] = Array.from({ length: size }, () => Array(size).fill(true));
  const props: Prop[] = [];

  const c = Math.floor(size / 2); // 20
  const plaza = { cx: c, cy: c, radius: 8 };

  // The Great Dynamo — 4×4 blocked footprint at the plaza heart.
  const dynamo: Prop = { kind: 'dynamo', x: c - 2, y: c - 2, w: 4, h: 4, variant: 0 };
  props.push(dynamo);
  blockFootprint(walkable, dynamo);

  // Stall row along the plaza's north edge (Nightstalls flavor).
  const stallY = c - plaza.radius - 2;
  for (let i = 0; i < 4; i++) {
    const stall: Prop = { kind: 'stall', x: c - 7 + i * 4, y: stallY, w: 2, h: 2, variant: i };
    props.push(stall);
    blockFootprint(walkable, stall);
  }

  // Planters dotting the plaza ring (greenery as decor, never terrain).
  const planterSpots: Array<[number, number]> = [
    [c - plaza.radius, c - 2],
    [c - plaza.radius, c + 2],
    [c + plaza.radius, c - 2],
    [c + plaza.radius, c + 2],
    [c - 2, c + plaza.radius],
    [c + 2, c + plaza.radius],
  ];
  for (const [px, py] of planterSpots) {
    const planter: Prop = { kind: 'planter', x: px, y: py, w: 1, h: 1, variant: randInt(rng, 0, 1) };
    props.push(planter);
    blockFootprint(walkable, planter);
  }

  // Scrappy fringe: crates and salvage blocks scattered outside the plaza,
  // denser toward the map edge. Spacing rule (no two scatter props within
  // 2 tiles, checked via the free-area ring) guarantees no walkable pocket
  // can be sealed off, so every walkable tile stays reachable.
  const scatterTarget = Math.floor(size * size * 0.024);
  let placed = 0;
  let attempts = 0;
  while (placed < scatterTarget && attempts < scatterTarget * 80) {
    attempts++;
    const x = randInt(rng, 1, size - 2);
    const y = randInt(rng, 1, size - 2);
    const distToPlaza = Math.max(Math.abs(x - c), Math.abs(y - c));
    if (distToPlaza <= plaza.radius + 1) continue;
    // Denser clutter further out.
    const edgeness = distToPlaza / (size / 2);
    if (rng() > edgeness * 0.7) continue;
    if (!isAreaFree(walkable, x, y, 1, 1)) continue;
    const kind: PropKind = rng() < 0.45 ? 'crate' : 'block';
    // Variant 3 (the dark scorched block) stays rare so the fringe reads
    // warm-mauve, not charcoal.
    const variant = kind === 'block' && rng() < 0.85 ? randInt(rng, 0, 2) : 3;
    const prop: Prop = { kind, x, y, w: 1, h: 1, variant };
    props.push(prop);
    blockFootprint(walkable, prop);
    placed++;
  }

  // Junk-heap nodes: Scavving lives in the fringe, spaced apart so routes
  // between heaps are short walks (same free-ring rule keeps connectivity).
  const junkNodes: WorldMap['junkNodes'] = [];
  const heapCfg = CONFIG.gathering.junkHeap;
  attempts = 0;
  while (junkNodes.length < heapCfg.nodeCount && attempts < heapCfg.nodeCount * 400) {
    attempts++;
    const x = randInt(rng, 2, size - 3);
    const y = randInt(rng, 2, size - 3);
    const distToPlaza = Math.max(Math.abs(x - c), Math.abs(y - c));
    if (distToPlaza <= plaza.radius + 1) continue;
    if (!isAreaFree(walkable, x, y, 1, 1)) continue;
    const tooClose = junkNodes.some(
      (n) => Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) < heapCfg.minNodeSpacing,
    );
    if (tooClose) continue;
    const node = { id: junkNodes.length, x, y };
    junkNodes.push(node);
    blockFootprint(walkable, { kind: 'block', x, y, w: 1, h: 1, variant: 0 });
  }

  return { size, walkable, props, junkNodes, plaza };
}

/** Flood-fill reachability from a start tile (4-directional). */
export function reachableTiles(map: WorldMap, sx: number, sy: number): Set<number> {
  const seen = new Set<number>();
  const key = (x: number, y: number) => y * map.size + x;
  if (!map.walkable[sy]?.[sx]) return seen;
  const stack: Array<[number, number]> = [[sx, sy]];
  seen.add(key(sx, sy));
  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (map.walkable[ny]?.[nx] === true && !seen.has(key(nx, ny))) {
        seen.add(key(nx, ny));
        stack.push([nx, ny]);
      }
    }
  }
  return seen;
}
