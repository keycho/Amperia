import { CONFIG, type NodeKind } from './config';
import { makeRng, randInt, type Rng } from './rng';

/**
 * The prototype map: one 40×40 slice of The Filament — plaza decking around
 * the Great Dynamo, a Nightstalls-style stall row, a coolant canal along the
 * west side (built channel, never open water), and a scrappier fringe toward
 * the edges. Deterministic from CONFIG.map.seed so client and server agree.
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

export interface GatherNode {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
}

export interface WorldMap {
  size: number;
  /** walkable[y][x] — true = a Spark can stand here. */
  walkable: boolean[][];
  /** canal[y][x] — true = coolant channel (blocked, rendered as coolant). */
  canal: boolean[][];
  props: Prop[];
  /** All gather nodes (blocked tiles; gathered from adjacent). */
  nodes: GatherNode[];
  /** Tiles inside the plaza decking (warmer floor variant). */
  plaza: { cx: number; cy: number; radius: number };
}

function blockFootprint(walkable: boolean[][], p: { x: number; y: number; w: number; h: number }): void {
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

/** Scatter helper: places single-tile nodes inside a box with a free ring. */
function scatterNodes(
  rng: Rng,
  walkable: boolean[][],
  nodes: GatherNode[],
  kind: NodeKind,
  count: number,
  spacing: number,
  box: { x0: number; y0: number; x1: number; y1: number },
  extraFilter?: (x: number, y: number) => boolean,
): void {
  let attempts = 0;
  let placed = 0;
  while (placed < count && attempts < count * 500) {
    attempts++;
    const x = randInt(rng, box.x0, box.x1);
    const y = randInt(rng, box.y0, box.y1);
    if (extraFilter !== undefined && !extraFilter(x, y)) continue;
    if (!isAreaFree(walkable, x, y, 1, 1)) continue;
    const tooClose = nodes.some(
      (n) => n.kind === kind && Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) < spacing,
    );
    if (tooClose) continue;
    nodes.push({ id: nodes.length, kind, x, y });
    blockFootprint(walkable, { x, y, w: 1, h: 1 });
    placed++;
  }
}

export function buildWorldMap(seed: number = CONFIG.map.seed): WorldMap {
  const size = CONFIG.map.size;
  const rng: Rng = makeRng(seed);
  const walkable: boolean[][] = Array.from({ length: size }, () => Array(size).fill(true));
  const canal: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const props: Prop[] = [];
  const nodes: GatherNode[] = [];

  const c = Math.floor(size / 2); // 20
  const plaza = { cx: c, cy: c, radius: 8 };

  // The coolant canal — a built channel with decked bridge rows.
  const cv = CONFIG.canal;
  for (let y = cv.yMin; y <= cv.yMax; y++) {
    for (let x = cv.xMin; x <= cv.xMax; x++) {
      if ((cv.bridgeRows as readonly number[]).includes(y)) continue;
      const wrow = walkable[y];
      const crow = canal[y];
      if (wrow && crow) {
        wrow[x] = false;
        crow[x] = true;
      }
    }
  }

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
    // Keep the canal banks clear so the towpath stays walkable.
    if (x >= cv.xMin - 1 && x <= cv.xMax + 1 && y >= cv.yMin - 1 && y <= cv.yMax + 1) continue;
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

  // ── Gather nodes ────────────────────────────────────────────────────────
  const g = CONFIG.gathering;

  // Junk heaps: all over the fringe (Scavving is the starter loop).
  scatterNodes(
    rng,
    walkable,
    nodes,
    'junkHeap',
    g.junkHeap.nodeCount,
    g.junkHeap.minNodeSpacing,
    { x0: 8, y0: 2, x1: size - 3, y1: size - 3 },
    (x, y) => Math.max(Math.abs(x - c), Math.abs(y - c)) > plaza.radius + 1,
  );

  // Brass seams: the north-east workings.
  scatterNodes(rng, walkable, nodes, 'brassSeam', g.brassSeam.nodeCount, g.brassSeam.minNodeSpacing, {
    x0: 26,
    y0: 3,
    x1: size - 3,
    y1: 14,
  });

  // Amperite crystals: the south-east deep fringe.
  scatterNodes(rng, walkable, nodes, 'amperite', g.amperite.nodeCount, g.amperite.minNodeSpacing, {
    x0: 26,
    y0: 26,
    x1: size - 3,
    y1: size - 3,
  });

  // Glowkoi spots: ON canal tiles (skimmed from the bank).
  const koiRows: number[] = [];
  {
    let tries = 0;
    while (koiRows.length < g.glowkoi.spotCount && tries < 400) {
      tries++;
      const y = randInt(rng, cv.yMin + 1, cv.yMax - 1);
      if ((cv.bridgeRows as readonly number[]).includes(y)) continue;
      if (koiRows.some((r) => Math.abs(r - y) < 4)) continue;
      koiRows.push(y);
    }
    for (const y of koiRows) {
      const x = randInt(rng, cv.xMin, cv.xMax);
      nodes.push({ id: nodes.length, kind: 'glowkoi', x, y });
      // Canal tiles are already unwalkable; no extra blocking needed.
    }
  }

  // Antenna-shrines: a wide ring at mid distance.
  scatterNodes(
    rng,
    walkable,
    nodes,
    'antenna',
    g.antenna.shrineCount,
    g.antenna.minNodeSpacing,
    { x0: 8, y0: 3, x1: size - 3, y1: size - 3 },
    (x, y) => {
      const d = Math.max(Math.abs(x - c), Math.abs(y - c));
      if (d < plaza.radius + 3 || d > plaza.radius + 9) return false;
      // Keep shrines off the canal banks.
      return !(x >= cv.xMin - 1 && x <= cv.xMax + 1);
    },
  );

  return { size, walkable, canal, props, nodes, plaza };
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
