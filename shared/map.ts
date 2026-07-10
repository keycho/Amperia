import { CONFIG, type NodeKind } from './config';
import { canStep, type TilePoint } from './pathfinding';
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
  | 'warden'
  /** Tangle canyon walls: containers stacked 2-4 high (variant = height). */
  | 'stack'
  /** The dead Craneking hulk — the Tangle's XL landmark. */
  | 'cranehulk'
  /** Gunmetal machine carcasses rusting in the maze pockets. */
  | 'deadmachine'
  /** Cable pylons — the client strings sagging bundles between pairs. */
  | 'pylon';

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

export type DistrictId = 'filament' | 'tangle';

export interface WorldMap {
  district: DistrictId;
  size: number;
  /** walkable[y][x] — true = a Spark can stand here. */
  walkable: boolean[][];
  /** canal[y][x] — true = coolant channel (blocked, rendered as coolant). */
  canal: boolean[][];
  /**
   * Terrain elevation (R4): integer level per tile. The plaza rides +1
   * behind its step ring, the canal sinks to −1 below deck level, docks
   * and platforms step up. Movement crosses levels only at ramp tiles.
   */
  elevation: number[][];
  /** ramp[y][x] — stair/ramp tiles where a ±1 level step is walkable. */
  ramp: boolean[][];
  props: Prop[];
  /** All gather nodes (blocked tiles; gathered from adjacent). */
  nodes: GatherNode[];
  /** Tiles inside the plaza decking (warmer floor variant). */
  plaza: { cx: number; cy: number; radius: number };
  /** Catwalk light pools (I5): warm spots where Sparks show a look off —
   *  the tram platform arrivals step into one, the plaza rim holds court. */
  catwalks: TilePoint[];
  /**
   * Rentable player shop stalls (the Nightstalls come alive — E2), in a
   * FIXED deterministic order: the stall id is the index here, and the
   * ShopStall DB rows key on it. Empty outside the Filament.
   */
  shopStalls: ShopStallSpot[];
}

export interface ShopStallSpot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
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

  // North lane row: four stalls whose counters (+y face) FACE the lane
  // (the westmost extends the row toward the plaza — a rentable pitch).
  for (let i = 0; i < 3; i++) {
    const stall: Prop = { kind: 'stall', x: 28 + i * 3, y: 17, w: 2, h: 2, variant: i };
    props.push(stall);
    blockFootprint(walkable, stall);
  }
  {
    const stall: Prop = { kind: 'stall', x: 25, y: 17, w: 2, h: 2, variant: 3 };
    props.push(stall);
    blockFootprint(walkable, stall);
  }
  // South lane row: three stalls tucked awning-to-awning opposite.
  for (let i = 0; i < 2; i++) {
    const stall: Prop = { kind: 'stall', x: 30 + i * 3, y: 22, w: 2, h: 2, variant: (i + 3) % 4 };
    props.push(stall);
    blockFootprint(walkable, stall);
  }
  {
    const stall: Prop = { kind: 'stall', x: 27, y: 22, w: 2, h: 2, variant: 1 };
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

  // Every stall on the Filament lane is a rentable player pitch, id'd by
  // its deterministic build order (ShopStall DB rows key on this).
  const shopStalls: ShopStallSpot[] = props
    .filter((p) => p.kind === 'stall')
    .map((p, i) => ({ id: i, x: p.x, y: p.y, w: p.w, h: p.h }));

  // ── Terrain elevation (R4) ───────────────────────────────────────────
  const elevation: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const ramp: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const d = Math.max(Math.abs(tx - c), Math.abs(ty - c));
      // The Dynamo plaza rides +1; its step ring is the stair all around.
      if (d < plaza.radius) (elevation[ty] as number[])[tx] = 1;
      else if (d === plaza.radius) (ramp[ty] as boolean[])[tx] = true;
      // The canal sinks below deck level (water under the bridges).
      if (canal[ty]?.[tx] === true) (elevation[ty] as number[])[tx] = -1;
    }
  }
  // Loading dock strip along the north wall (+1, two stair tiles).
  for (let tx = 8; tx <= 18; tx++) {
    for (let ty = 3; ty <= 4; ty++) {
      (elevation[ty] as number[])[tx] = 1;
    }
  }
  (ramp[4] as boolean[])[11] = true;
  (ramp[4] as boolean[])[16] = true;
  // Raised tram platform: arrivals step off above the lane, then down.
  for (const ty of [19, 20, 21]) {
    (elevation[ty] as number[])[35] = 1;
    (ramp[ty] as boolean[])[35] = true;
  }

  // Catwalk light pools (I5): the tram-platform landing + the plaza rim.
  const catwalks: TilePoint[] = [
    { x: 34, y: 19 },
    { x: 34, y: 21 },
    { x: 20, y: 13 },
    { x: 13, y: 20 },
    { x: 20, y: 27 },
    { x: 27, y: 20 },
  ];
  return { district: 'filament', size, walkable, canal, props, nodes, plaza, shopStalls, elevation, ramp, catwalks };
}

/**
 * THE TANGLE v2 — wire-maze CANYON (district brief, ART-DIRECTION §12B):
 * corridors thread between container-stack walls 2-4 high, under sagging
 * cable trusses, past dead machines, with the ruined Craneking hulk
 * looming over the center. Rust + gunmetal; hazard-amber junction lamps;
 * teal ONLY as amperite/beacons; rose ONLY as Scrapcache/mob/crane-beacon.
 * Darker than the Filament; danger lives in the dark stretches. PvE only.
 * Gameplay placements (node counts, mob boxes, tram position) match v1.
 */
export function buildTangleMap(seed: number = CONFIG.map.seed ^ 0x7a9): WorldMap {
  const size = CONFIG.map.size;
  const rng: Rng = makeRng(seed);
  const walkable: boolean[][] = Array.from({ length: size }, () => Array(size).fill(true));
  const canal: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const props: Prop[] = [];
  const nodes: GatherNode[] = [];
  // No plaza: radius -1 disables ring/heal-zone logic downstream.
  const plaza = { cx: 3, cy: 20, radius: -1 };

  const place = (kind: PropKind, x: number, y: number, w = 1, h = 1, variant = 0) => {
    const p: Prop = { kind, x, y, w, h, variant };
    props.push(p);
    blockFootprint(walkable, p);
  };

  // ── terraces first (R4): scatter guards read them ──────────────────────
  const elevation: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const ramp: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  // NE antenna terrace (+1) — the quiet clearing sits a step above the maze.
  for (let ty = 4; ty <= 9; ty++) {
    for (let tx = 31; tx <= 36; tx++) (elevation[ty] as number[])[tx] = 1;
  }
  (ramp[9] as boolean[])[32] = true;
  (ramp[9] as boolean[])[35] = true;
  // SW terrace pocket (+1) — a lookout over the south corridors.
  for (let ty = 30; ty <= 35; ty++) {
    for (let tx = 4; tx <= 9; tx++) (elevation[ty] as number[])[tx] = 1;
  }
  (ramp[30] as boolean[])[6] = true;
  (ramp[32] as boolean[])[9] = true;
  const onRamp = (x: number, y: number): boolean => ramp[y]?.[x] === true;
  // Ramps have few approach tiles — nothing may squat on or beside one.
  const nearRamp = (x: number, y: number): boolean =>
    onRamp(x, y) || onRamp(x - 1, y) || onRamp(x + 1, y) || onRamp(x, y - 1) || onRamp(x, y + 1);

  // The return Tramgate on the west edge (arrivals from the Filament).
  place('tramgate', 1, 18, 2, 5);

  // ── XL landmark FIRST (before the walls claim its ring): the dead
  // Craneking hulk over the yard — visible from most of the maze. ────────
  if (isAreaFree(walkable, 17, 13, 6, 4)) place('cranehulk', 17, 13, 6, 4);

  // ── canyon walls: container stacks 2-4 high with readable gaps ─────────
  // variant = stack height (2..4); the client bakes one model per height.
  const wallRun = (
    x0: number,
    y0: number,
    dx: number,
    dy: number,
    len: number,
    gapEvery: number,
  ) => {
    for (let i = 0; i < len; i++) {
      if (i % gapEvery === gapEvery - 1) continue; // the gap
      const x = x0 + dx * i;
      const y = y0 + dy * i;
      if (walkable[y]?.[x] !== true) continue;
      if (nearRamp(x, y)) continue;
      // Wall heights breathe 2-4 along the run — a canyon, not a fence.
      // The OCCASIONAL container carries the hazard band (variant +10).
      const h = 2 + ((i * 7 + x + y) % 3);
      const striped = (x * 13 + y * 7) % 11 === 0;
      place('stack', x, y, 1, 1, striped ? h + 10 : h);
    }
  };
  // Perimeter fragments: the maze walls itself off from the void.
  wallRun(3, 2, 1, 0, 34, 9);
  wallRun(4, 37, 1, 0, 33, 8);
  wallRun(2, 4, 0, 1, 12, 6); // west upper (gate approach stays open below)
  wallRun(2, 24, 0, 1, 5, 5);
  wallRun(37, 11, 0, 1, 24, 7);
  // Main street flanks (the spine runs y19-21 from the gate east).
  wallRun(8, 17, 1, 0, 6, 7);
  wallRun(27, 17, 1, 0, 4, 5);
  wallRun(8, 23, 1, 0, 23, 7);
  // North zone: two E-W corridor walls + one splitter column.
  wallRun(10, 12, 1, 0, 19, 6);
  wallRun(6, 7, 1, 0, 24, 8);
  wallRun(20, 3, 0, 1, 4, 9);
  wallRun(13, 13, 0, 1, 4, 6);
  // South zone: corridor walls with dead-end pockets.
  wallRun(8, 30, 1, 0, 24, 7);
  wallRun(16, 24, 0, 1, 6, 4);
  wallRun(26, 25, 0, 1, 5, 6);
  wallRun(31, 9, 0, 1, 10, 6);
  // East wall separating the maze from the antenna approach.
  wallRun(31, 24, 0, 1, 6, 4);

  // ── the scrap yard: roped boundary along the street (posts, gapped) ────
  for (let x = 14; x <= 26; x += 3) {
    if (walkable[18]?.[x] === true && !nearRamp(x, 18)) place('ropepost', x, 18);
  }

  // ── dead machines rust in the pockets (M mass) ─────────────────────────
  for (const [mx, my, v] of [
    [10, 9, 0],
    [24, 27, 1],
    [33, 20, 2],
    [6, 26, 1],
    [27, 4, 0],
  ] as const) {
    if (isAreaFree(walkable, mx, my, 2, 2)) place('deadmachine', mx, my, 2, 2, v);
  }

  // Two salvage shacks squat in the maze (landmarks, lit windows).
  for (const [sx, sy, v] of [
    [5, 5, 1],
    [33, 32, 2],
  ] as const) {
    if (isAreaFree(walkable, sx, sy, 2, 2)) place('shack', sx, sy, 2, 2, v);
  }

  // ── light plan (§12B d): hazard-amber lamps at junctions, pools ≤5 apart
  // on the main routes; corners and dead ends stay genuinely dark. ───────
  for (const [lx, ly] of [
    [9, 18],
    [14, 22],
    [20, 22],
    [26, 18],
    [30, 22],
    [13, 10],
    [21, 14],
    [27, 8],
    [12, 28],
    [22, 31],
    [30, 27],
    [7, 33],
  ] as const) {
    if (walkable[ly]?.[lx] === true && !nearRamp(lx, ly)) place('alleylamp', lx, ly);
  }

  // ── cable pylons: consecutive PAIRS — the client sags bundles between
  // them, crossing the corridors overhead. ───────────────────────────────
  for (const [px, py] of [
    [11, 16], [11, 24],   // over the west street
    [18, 12], [18, 18],   // over the yard's west edge
    [25, 16], [25, 24],   // over the east street
    [15, 29], [24, 29],   // along the south corridor
    [29, 6], [29, 13],    // north-east drop
  ] as const) {
    if (walkable[py]?.[px] === true && !nearRamp(px, py)) place('pylon', px, py);
  }

  // Nodes: denser junk/brass/amperite; a couple of antennas; no koi.
  // Every scatter also keeps off the ramps' scarce approach tiles.
  const g = CONFIG.gathering;
  const mult = CONFIG.tangle.nodeMult;
  scatterNodes(
    rng,
    walkable,
    nodes,
    'junkHeap',
    Math.round(g.junkHeap.nodeCount * mult.junkHeap),
    g.junkHeap.minNodeSpacing,
    { x0: 3, y0: 3, x1: size - 4, y1: size - 4 },
    (x, y) => !(Math.abs(y - 20) <= 1 && x <= 8) && !nearRamp(x, y),
  );
  scatterNodes(
    rng,
    walkable,
    nodes,
    'brassSeam',
    Math.round(g.brassSeam.nodeCount * mult.brassSeam),
    g.brassSeam.minNodeSpacing,
    { x0: 9, y0: 9, x1: size - 8, y1: size - 8 },
    (x, y) => !nearRamp(x, y),
  );
  scatterNodes(
    rng,
    walkable,
    nodes,
    'amperite',
    Math.round(g.amperite.nodeCount * mult.amperite),
    g.amperite.minNodeSpacing,
    // The whole scrap heart (the crane hulk + yard walls tightened the
    // old 13..27 box below the count) — same area the mobs prowl.
    { x0: 10, y0: 10, x1: 29, y1: 29 },
    (x, y) => !nearRamp(x, y),
  );
  scatterNodes(
    rng,
    walkable,
    nodes,
    'antenna',
    CONFIG.tangle.antennaCount,
    g.antenna.minNodeSpacing,
    { x0: 3, y0: 3, x1: size - 4, y1: size - 4 },
    (x, y) => Math.min(x, y, size - 1 - x, size - 1 - y) <= 6 && !nearRamp(x, y),
  );

  // ── rust-family clutter, clustered against the walls (no confetti) ─────
  const clutterTarget = Math.floor(size * size * 0.022);
  let placed = 0;
  let attempts = 0;
  while (placed < clutterTarget && attempts < clutterTarget * 80) {
    attempts++;
    const x = randInt(rng, 2, size - 3);
    const y = randInt(rng, 2, size - 3);
    if (Math.abs(y - 20) <= 1 && x <= 8) continue; // gate approach stays open
    if (nearRamp(x, y)) continue;
    // Hug the walls: only near an existing blocked tile.
    const nearWall =
      walkable[y - 1]?.[x] === false ||
      walkable[y + 1]?.[x] === false ||
      walkable[y]?.[x - 1] === false ||
      walkable[y]?.[x + 1] === false;
    if (!nearWall && rng() < 0.75) continue;
    if (!isAreaFree(walkable, x, y, 1, 1)) continue;
    // Clutter runs LAST (nodes got first pick of the space), so the ring
    // rule alone can't prevent seals against existing single-gap walls —
    // flood-check each candidate like the Filament vignettes do.
    if (wouldSealPocket(walkable, x, y, size)) continue;
    // Rust/gunmetal family only (variants 4-6 = weathered steel boxes;
    // 3 = drums; crates are rusted already). NO painted confetti here.
    const roll = rng();
    if (roll < 0.35) place('crate', x, y, 1, 1, randInt(rng, 0, 1));
    else if (roll < 0.55) place('block', x, y, 1, 1, 3);
    else place('block', x, y, 1, 1, 4 + randInt(rng, 0, 2));
    placed++;
  }


  // One pool at the gate — arrivals get their entrance moment even here.
  const catwalks: TilePoint[] = [{ x: 4, y: 20 }];
  return { district: 'tangle', size, walkable, canal, props, nodes, plaza, shopStalls: [], elevation, ramp, catwalks };
}

export function buildDistrictMap(district: DistrictId): WorldMap {
  return district === 'tangle' ? buildTangleMap() : buildWorldMap();
}

/** Flood-fill reachability from a start tile (4-directional). */
export function reachableTiles(map: WorldMap, sx: number, sy: number): Set<number> {
  const seen = new Set<number>();
  const key = (x: number, y: number) => y * map.size + x;
  if (!map.walkable[sy]?.[sx]) return seen;
  const grid = { size: map.size, walkable: map.walkable, elevation: map.elevation, ramp: map.ramp };
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
      if (canStep(grid, x, y, nx, ny) && !seen.has(key(nx, ny))) {
        seen.add(key(nx, ny));
        stack.push([nx, ny]);
      }
    }
  }
  return seen;
}
