import { CONFIG, type NodeKind } from './config';
import { makeRng, randInt, type Rng } from './rng';

/**
 * The prototype map: one 40×40 slice of The Filament — plaza decking around
 * the Great Dynamo, a Nightstalls-style stall row, a coolant canal along the
 * west side (built channel, never open water), and a scrappier fringe toward
 * the edges. Deterministic from CONFIG.map.seed so client and server agree.
 */

export type PropKind =
  | 'dynamo'
  | 'merchant'
  | 'tinkerbench'
  | 'stall'
  | 'crate'
  | 'block'
  | 'planter'
  | 'shack'
  | 'tramgate'
  | 'alleylamp'
  | 'ropepost'
  | 'dispatcher'
  | 'warden';

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

/**
 * True if blocking `tile` would seal off any walkable pocket. Used by the
 * vignette placements, which hug props on purpose and so can't rely on the
 * free-ring rule. One flood fill per candidate — map build is one-time.
 */
function wouldSealPocket(walkable: boolean[][], x: number, y: number, size: number): boolean {
  const total = () => {
    let n = 0;
    for (const row of walkable) for (const w2 of row) if (w2) n++;
    return n;
  };
  const flood = (): number => {
    let sx = -1;
    let sy = -1;
    outer: for (let yy = 0; yy < size; yy++) {
      for (let xx = 0; xx < size; xx++) {
        if (walkable[yy]?.[xx] === true) {
          sx = xx;
          sy = yy;
          break outer;
        }
      }
    }
    if (sx < 0) return 0;
    const seen = new Set<number>([sy * size + sx]);
    const stack: Array<[number, number]> = [[sx, sy]];
    while (stack.length > 0) {
      const [cx2, cy2] = stack.pop() as [number, number];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cx2 + dx;
        const ny = cy2 + dy;
        if (walkable[ny]?.[nx] === true && !seen.has(ny * size + nx)) {
          seen.add(ny * size + nx);
          stack.push([nx, ny]);
        }
      }
    }
    return seen.size;
  };
  const row = walkable[y];
  if (!row) return true;
  row[x] = false;
  const sealed = flood() !== total();
  row[x] = true;
  return sealed;
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

  // ── The market spine (composition §B6): Tramgate → lane → plaza ─────────
  // Arrivals step off the tram at the east edge and walk a stall-lined lane
  // (rows y 19–21, kept clear) straight into the Dynamo plaza.
  const gate: Prop = { kind: 'tramgate', x: 36, y: 18, w: 2, h: 5, variant: 0 };
  props.push(gate);
  blockFootprint(walkable, gate);

  // North lane row: three stalls whose counters (+y face) FACE the lane.
  for (let i = 0; i < 3; i++) {
    const stall: Prop = { kind: 'stall', x: 28 + i * 3, y: 17, w: 2, h: 2, variant: i };
    props.push(stall);
    blockFootprint(walkable, stall);
  }
  // South lane row: two stalls tucked awning-to-awning opposite.
  for (let i = 0; i < 2; i++) {
    const stall: Prop = { kind: 'stall', x: 30 + i * 3, y: 22, w: 2, h: 2, variant: (i + 3) % 4 };
    props.push(stall);
    blockFootprint(walkable, stall);
  }
  // The Dispatcher: quest-giver by the Tramgate arrivals.
  {
    const d: Prop = { kind: 'dispatcher', x: 34, y: 23, w: 1, h: 1, variant: 0 };
    props.push(d);
    blockFootprint(walkable, d);
  }
  // The Charge Warden: donation stub at the Dynamo (future Citywide Charge).
  {
    const wdn: Prop = { kind: 'warden', x: 23, y: 20, w: 1, h: 1, variant: 0 };
    props.push(wdn);
    blockFootprint(walkable, wdn);
  }

  // The Tinkerbench: crafting + repairs, on the plaza's north-west side.
  {
    const bench: Prop = { kind: 'tinkerbench', x: 15, y: 14, w: 1, h: 1, variant: 0 };
    props.push(bench);
    blockFootprint(walkable, bench);
  }

  // The merchant's stand: the gap in the north row, facing the lane.
  {
    const merchant: Prop = { kind: 'merchant', x: 30, y: 17, w: 1, h: 1, variant: 0 };
    props.push(merchant);
    blockFootprint(walkable, merchant);
  }

  // One more on the plaza's north-east edge, facing the plaza.
  {
    const stall: Prop = { kind: 'stall', x: 22, y: c - plaza.radius - 2, w: 2, h: 2, variant: 3 };
    props.push(stall);
    blockFootprint(walkable, stall);
  }

  // Planters dotting the plaza ring, plus twin rows framing the south
  // approach lane (greenery as decor, never terrain).
  const planterSpots: Array<[number, number]> = [
    [c - plaza.radius, c - 2],
    [c - plaza.radius, c + 2],
    [c + plaza.radius, c - 2],
    [c + plaza.radius, c + 2],
    [c - 2, c + plaza.radius],
    [c + 2, c + plaza.radius],
    [c - 2, c + plaza.radius + 3],
    [c + 2, c + plaza.radius + 3],
    [c - 2, c + plaza.radius + 5],
    [c + 2, c + plaza.radius + 5],
  ];
  for (const [px, py] of planterSpots) {
    const planter: Prop = { kind: 'planter', x: px, y: py, w: 1, h: 1, variant: randInt(rng, 0, 1) };
    props.push(planter);
    blockFootprint(walkable, planter);
  }

  // Buildings wall the outer edges with alley gaps (§B6) — the city has a
  // silhouette, nothing free-floats. Two inner landmarks stay.
  const shackSpots: Array<[number, number]> = [
    // North wall.
    [7, 1],
    [13, 1],
    [19, 1],
    [26, 1],
    [32, 2],
    // West wall (the canal runs x4–5; these sit behind the towpath).
    [1, 8],
    [1, 14],
    [1, 25],
    [1, 31],
    // South wall.
    [9, 36],
    [15, 36],
    [24, 36],
    // Inner landmarks: NE alley anchor + the scrap-corner gatehouse.
    [29, 8],
    [30, 27],
  ];
  shackSpots.forEach(([sx, sy], i) => {
    if (!isAreaFree(walkable, sx, sy, 2, 2)) return; // ring rule keeps reachability
    const shack: Prop = { kind: 'shack', x: sx, y: sy, w: 2, h: 2, variant: i };
    props.push(shack);
    blockFootprint(walkable, shack);
  });

  // Stall vignettes (§B8): goods crates flanking each stall's counter and
  // a planter at its shoulder — no stall stands alone.
  for (const stall of props.filter((p) => p.kind === 'stall')) {
    const sideSpots: Array<[number, number, PropKind]> = [
      [stall.x - 1, stall.y + 1, 'crate'],
      [stall.x + stall.w, stall.y + 1, 'block'],
      [stall.x + stall.w, stall.y - 1, 'planter'],
    ];
    for (const [sx, sy, kind] of sideSpots) {
      if (walkable[sy]?.[sx] !== true) continue;
      // Never pinch the lane rows or the plaza-axis sightlines shut.
      if (sy >= 19 && sy <= 21 && sx >= 27) continue;
      if (Math.abs(sx - c) <= 1 || Math.abs(sy - c) <= 1) continue;
      if (wouldSealPocket(walkable, sx, sy, size)) continue;
      const p: Prop = { kind, x: sx, y: sy, w: 1, h: 1, variant: randInt(rng, 0, 2) };
      props.push(p);
      blockFootprint(walkable, p);
    }
  }

  // Planter rows along the north wall's faces (§B8).
  for (const [px, py] of [
    [10, 3],
    [16, 3],
    [22, 3],
    [29, 4],
  ] as const) {
    if (walkable[py]?.[px] !== true) continue;
    if (wouldSealPocket(walkable, px, py, size)) continue;
    const p: Prop = { kind: 'planter', x: px, y: py, w: 1, h: 1, variant: randInt(rng, 0, 1) };
    props.push(p);
    blockFootprint(walkable, p);
  }

  // Dark-corner alley clutter (§B7): packed crates + one dim lantern each.
  const cornerClutter: Array<{ lamp: [number, number]; crates: Array<[number, number]> }> = [
    { lamp: [4, 34], crates: [[3, 33], [5, 35], [3, 35]] },
    { lamp: [34, 5], crates: [[35, 4], [33, 4], [35, 6]] },
    { lamp: [8, 5], crates: [[7, 4], [9, 4]] },
  ];
  for (const cluster of cornerClutter) {
    for (const [cx2, cy2] of cluster.crates) {
      if (!isAreaFree(walkable, cx2, cy2, 1, 1)) continue;
      const p: Prop = { kind: 'crate', x: cx2, y: cy2, w: 1, h: 1, variant: randInt(rng, 0, 1) };
      props.push(p);
      blockFootprint(walkable, p);
    }
    const [lx, ly] = cluster.lamp;
    if (isAreaFree(walkable, lx, ly, 1, 1)) {
      const lamp: Prop = { kind: 'alleylamp', x: lx, y: ly, w: 1, h: 1, variant: 0 };
      props.push(lamp);
      blockFootprint(walkable, lamp);
    }
  }

  // The roped scrap corner (§B11): posts along the SE yard's boundary with
  // a two-tile gap entrance; the rope itself is visual only.
  const ropeSpots: Array<[number, number]> = [];
  for (let x = 28; x <= 37; x += 2) if (x !== 34) ropeSpots.push([x, 28]);
  for (let y = 30; y <= 36; y += 2) ropeSpots.push([27, y]);
  for (const [px, py] of ropeSpots) {
    if (!isAreaFree(walkable, px, py, 1, 1)) continue;
    const post: Prop = { kind: 'ropepost', x: px, y: py, w: 1, h: 1, variant: 0 };
    props.push(post);
    blockFootprint(walkable, post);
  }

  // Scrappy fringe: crates and salvage blocks scattered outside the plaza,
  // pulled into vignette clusters around the shacks and stall row, with the
  // plaza-axis lanes kept clear as open sightlines out of the market.
  // Spacing rule (no two scatter props within 2 tiles, checked via the
  // free-area ring) guarantees no walkable pocket can be sealed off, so
  // every walkable tile stays reachable.
  const magnets: Array<[number, number]> = [
    ...shackSpots.map(([sx, sy]) => [sx + 1, sy + 1] as [number, number]),
    ...props.filter((p) => p.kind === 'stall').map((p) => [p.x, p.y + 1] as [number, number]),
  ];
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
    // Lanes stay open along both plaza axes.
    if (Math.abs(x - c) <= 1 || Math.abs(y - c) <= 1) continue;
    // The market lane (tramgate → plaza) stays completely clear.
    if (y >= 18 && y <= 22 && x >= 27) continue;
    // The roped scrap yard keeps its floor for seams, spoil and mobs.
    if (x >= 27 && y >= 28) continue;
    // Cluster near a magnet; thin out in the open mid-ground.
    const nearMagnet = magnets.some(
      ([mx, my]) => Math.max(Math.abs(x - mx), Math.abs(y - my)) <= 3,
    );
    const edgeness = distToPlaza / (size / 2);
    if (rng() > (nearMagnet ? 0.92 : edgeness * 0.45)) continue;
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

  // Junk heaps live in the alleys (§B11): the shadowed bands between the
  // edge buildings and the lit middle, never in the plaza or on the lane.
  scatterNodes(
    rng,
    walkable,
    nodes,
    'junkHeap',
    g.junkHeap.nodeCount,
    g.junkHeap.minNodeSpacing,
    { x0: 3, y0: 3, x1: size - 4, y1: size - 4 },
    (x, y) => {
      const distToEdge = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (distToEdge < 3 || distToEdge > 8) return false;
      if (Math.max(Math.abs(x - c), Math.abs(y - c)) <= plaza.radius + 1) return false;
      // Off the lane, out of the roped scrap corner, off the canal banks.
      if (y >= 18 && y <= 22 && x >= 27) return false;
      if (x >= 27 && y >= 28) return false;
      return !(x >= cv.xMin - 1 && x <= cv.xMax + 2);
    },
  );

  // Brass seams + amperite: the roped scrap corner in the SE, where the
  // feral Scuttlebots prowl (combat homeBox overlaps on purpose).
  const yard = { x0: 28, y0: 29, x1: size - 3, y1: size - 3 };
  scatterNodes(
    rng,
    walkable,
    nodes,
    'brassSeam',
    g.brassSeam.nodeCount,
    g.brassSeam.minNodeSpacing,
    yard,
  );
  scatterNodes(
    rng,
    walkable,
    nodes,
    'amperite',
    g.amperite.nodeCount,
    g.amperite.minNodeSpacing,
    yard,
  );

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

  // Antenna-shrines: the dark outskirts (§B11) — far from the plaza, still
  // inside the void fade so the beacons read as distant lights.
  scatterNodes(
    rng,
    walkable,
    nodes,
    'antenna',
    g.antenna.shrineCount,
    g.antenna.minNodeSpacing,
    { x0: 3, y0: 3, x1: size - 4, y1: size - 4 },
    (x, y) => {
      const d = Math.max(Math.abs(x - c), Math.abs(y - c));
      if (d < plaza.radius + 5) return false;
      // Not in the scrap corner, off the lane, off the canal banks.
      if (x >= 27 && y >= 28) return false;
      if (y >= 18 && y <= 22 && x >= 27) return false;
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
