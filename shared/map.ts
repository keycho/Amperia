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
  | 'dispatchpost'
  | 'alleylamp'
  | 'ropepost'
  | 'dispatcher'
  | 'warden'
  /** Tangle canyon walls: containers stacked 2-4 high (variant = height). */
  | 'stack'
  /** The dead Craneking hulk — the Tangle's XL landmark. */
  | 'cranehulk'
  /** The Fortune Coil (S4): the daily-spin wheel at the Nightstalls. */
  | 'fortunecoil'
  /** The Ledgerhouse (S5): the bank — walls block, the hall inside walks. */
  | 'ledgerhouse'
  /** I6 vignette props (variant selects the sub-style). */
  | 'cablespool'
  | 'barrels'
  | 'pallets'
  | 'ventbox'
  | 'gascans'
  | 'tarp'
  | 'scrapbin'
  | 'toolrack'
  /** Gunmetal machine carcasses rusting in the maze pockets. */
  | 'deadmachine'
  /** Cable pylons — the client strings sagging bundles between pairs. */
  | 'pylon'
  /** V2 shape vocabulary — FABRIC: canopy, banner, laundry line. */
  | 'canopy'
  | 'banner'
  | 'laundry'
  /** V2 — ORGANIC: wild bushes through the pavement, vine-eaten trellis. */
  | 'wildbush'
  | 'vinewall'
  /** V2 — TALL/THIN: junction signposts, squatters' stovepipes. */
  | 'signpost'
  | 'stovepipe'
  /** V2 — ROUND-ISH: the neighbourhood water tank on legs (2×2). */
  | 'watertank'
  /** V4 unique set pieces — Filament: the Griddle noodle corner (3×2),
   *  a retired tram car on its siding (4×2), the scrap fountain (2×2). */
  | 'griddle'
  | 'tramcar'
  | 'fountain'
  /** V4 — Tangle: a Draymule up on blocks (2×2), a container spill (3×2). */
  | 'draymule'
  | 'spill'
  /** V5 — a low rail guarding a drop (variant 0 = along x, 1 = along y). */
  | 'guardrail'
  /** D1 THE STACKS — residential towers (4×4 tiles, blocking, never
   *  interiors per §5 amendment; variant = design*3 + paint). */
  | 'tower'
  /** D1 — the Signal Spire (3×3), the city's tallest mast, red crown. */
  | 'spire'
  /** D1 — the vanity registry office shopfront (4×3, violet sign). */
  | 'registry'
  /** D1 — the junction plaza's noodle cart (2×1) + its one tree (2×2). */
  | 'noodlecart'
  | 'treeplanter'
  /** D1 — a rooftop tarp shanty (2×2, Roofline furniture). */
  | 'shanty'
  /** D2 THE TERRARIUM — the Mother Trellis (4×4 XL, glow-fruit lights). */
  | 'mothertrellis'
  /** D2 — a raised crop bed (2×1) and the gardeners' tool shed (2×2). */
  | 'gardenbed'
  | 'toolshed';

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

export type DistrictId = 'filament' | 'tangle' | 'stacks' | 'terrarium';

/** Display names — used by tram boards, notices, and the world map. */
export const DISTRICT_NAMES: Record<DistrictId, string> = {
  filament: 'The Filament',
  tangle: 'The Tangle',
  stacks: 'The Stacks',
  terrarium: 'The Terrarium',
};

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
  /**
   * road[y][x] — decked walkway tiles (W3): the road network that threads
   * spawn → plaza → market → tram → gather. The client floors these as
   * boardwalk decking; purely presentation + the source of truth for where
   * a "street" is, so nothing hard-codes lane coordinates. Empty outside
   * the Filament (the other quarters read their streets from geometry).
   */
  roads: boolean[][];
  props: Prop[];
  /** All gather nodes (blocked tiles; gathered from adjacent). */
  nodes: GatherNode[];
  /** Tiles inside the plaza decking (warmer floor variant). */
  plaza: { cx: number; cy: number; radius: number };
  /** Catwalk light pools (I5): warm spots where Sparks show a look off —
   *  the tram platform arrivals step into one, the plaza rim holds court. */
  catwalks: TilePoint[];
  /** The Ledgerhouse hall (S5): bank actions are valid ONLY on these tiles. */
  bankInterior: TilePoint[];
  /** V5: raised footbridge deck tiles (the client rails their edges). */
  footbridges: TilePoint[];
  /** D2: Loftpod berth pads (nw corner of each 3×3 walkable pad).
   *  Server-managed occupancy (D2b); empty outside the Terrarium. */
  loftberths: TilePoint[];
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
  return wouldSealPocketRect(walkable, x, y, 1, 1, size);
}

/** Rect flavor for multi-tile props (V2 decor): block, flood, restore. */
function wouldSealPocketRect(
  walkable: boolean[][],
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
): boolean {
  const prior: boolean[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      prior.push(walkable[y + dy]?.[x + dx] === true);
      const row = walkable[y + dy];
      if (row) row[x + dx] = false;
    }
  }
  const sealed = floodCount(walkable, size) !== totalWalkable(walkable);
  let i = 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const row = walkable[y + dy];
      if (row) row[x + dx] = prior[i] as boolean;
      i++;
    }
  }
  return sealed;
}

function totalWalkable(walkable: boolean[][]): number {
  let n = 0;
  for (const row of walkable) for (const w2 of row) if (w2) n++;
  return n;
}

function floodCount(walkable: boolean[][], size: number): number {
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
}


/**
 * Would blocking `prop`'s footprint leave any node with NO adjacent
 * walkable tile? (The koi banks taught us — S5.) Every decorative
 * placement checks this; nodes always keep at least one approach.
 */
function stealsNodeAccess(walkable: boolean[][], nodes: GatherNode[], prop: Prop): boolean {
  for (const n of nodes) {
    const adj = [
      [n.x + 1, n.y],
      [n.x - 1, n.y],
      [n.x, n.y + 1],
      [n.x, n.y - 1],
    ].filter(([ax, ay]) => {
      const inProp =
        (ax as number) >= prop.x &&
        (ax as number) < prop.x + prop.w &&
        (ay as number) >= prop.y &&
        (ay as number) < prop.y + prop.h;
      return !inProp && walkable[ay as number]?.[ax as number] === true;
    });
    if (adj.length === 0) return true;
  }
  return false;
}

/** V5: the canal row carrying the raised footbridge (kept koi-free). */
const FOOTBRIDGE_ROW = 16;

/** Every tile of the prop's footprint is currently walkable. */
function footprintWalkable(walkable: boolean[][], p: Prop): boolean {
  for (let dy = 0; dy < p.h; dy++) {
    for (let dx = 0; dx < p.w; dx++) {
      if (walkable[p.y + dy]?.[p.x + dx] !== true) return false;
    }
  }
  return true;
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
  // W0 BREATHING ROOM: the Filament rides the larger starter footprint.
  const size = CONFIG.map.filamentSize;
  const rng: Rng = makeRng(seed);
  const walkable: boolean[][] = Array.from({ length: size }, () => Array(size).fill(true));
  const canal: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const roads: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const props: Prop[] = [];
  const nodes: GatherNode[] = [];

  const c = Math.floor(size / 2); // 30
  const plaza = { cx: c, cy: c, radius: 8 };
  const inPlaza = (x: number, y: number): boolean =>
    Math.max(Math.abs(x - c), Math.abs(y - c)) <= plaza.radius;

  // ── The road network FIRST (W3): decked streets threading spawn → plaza →
  //    market → tram → gather. Marked before anything else so every prop and
  //    node placement downstream keeps them clear. Roads never enter the
  //    plaza — the hub is its own decked stone; the roads meet its rim. ────
  const paveRoad = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) {
      const rrow = roads[y];
      if (!rrow) continue;
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || x >= size || inPlaza(x, y)) continue;
        rrow[x] = true;
      }
    }
  };
  paveRoad(39, 29, 53, 31); // east spine — the tram approach into the plaza
  paveRoad(10, 29, 21, 31); // west spine — past the Ledgerhouse door
  paveRoad(29, 17, 31, 21); // north connector → the Fortune Coil
  paveRoad(29, 39, 31, 44); // south connector → the market promenade
  paveRoad(14, 45, 44, 46); // the Nightstalls promenade (E–W market street)
  for (let y = 10; y <= 50; y++) (roads[y] as boolean[])[10] = true; // canal towpath
  const onRoad = (x: number, y: number): boolean => roads[y]?.[x] === true;

  // The coolant canal — a built channel down the west side, decked where the
  // market spine crosses (bridgeRows) and at the raised footbridge.
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

  // ── The compact social core (W2): the Great Dynamo at the plaza heart, the
  //    plaza kept MOSTLY EMPTY so it reads as a gathering place, not storage.
  const dynamo: Prop = { kind: 'dynamo', x: c - 2, y: c - 2, w: 4, h: 4, variant: 0 };
  props.push(dynamo);
  blockFootprint(walkable, dynamo);

  // The Charge Warden: the donation stub beside the Dynamo (tut5 donates here).
  {
    const wdn: Prop = { kind: 'warden', x: 26, y: 30, w: 1, h: 1, variant: 0 };
    props.push(wdn);
    blockFootprint(walkable, wdn);
  }

  // The return Tramgate on the east edge; arrivals step onto the spine.
  const gate: Prop = { kind: 'tramgate', x: 54, y: 28, w: 2, h: 5, variant: 0 };
  props.push(gate);
  blockFootprint(walkable, gate);

  // The Ledgerhouse (S5): the bank, standing alone WEST of the plaza. The
  // prop walls block; the 2×2 hall + the south door stay WALKABLE and open
  // straight onto the west spine.
  const bankInterior: TilePoint[] = [];
  {
    const bank: Prop = { kind: 'ledgerhouse', x: 12, y: 25, w: 4, h: 4, variant: 0 };
    props.push(bank);
    blockFootprint(walkable, bank);
    const hall: TilePoint[] = [
      { x: 13, y: 26 },
      { x: 14, y: 26 },
      { x: 13, y: 27 },
      { x: 14, y: 27 },
      { x: 13, y: 28 }, // the door tile (south wall gap)
    ];
    for (const t of hall) {
      (walkable[t.y] as boolean[])[t.x] = true;
      bankInterior.push(t);
    }
  }

  // The Fortune Coil: the daily ritual wheel, standing alone NORTH of the
  // plaza at the head of the north connector.
  {
    const coil: Prop = { kind: 'fortunecoil', x: 29, y: 15, w: 2, h: 2, variant: 0 };
    props.push(coil);
    blockFootprint(walkable, coil);
  }

  // The Tinkerbench: crafting + repairs, standing alone off the plaza's NW
  // corner ("over by the plaza" — tut3 crafts here).
  {
    const bench: Prop = { kind: 'tinkerbench', x: 20, y: 28, w: 1, h: 1, variant: 0 };
    props.push(bench);
    blockFootprint(walkable, bench);
  }

  // ── The Nightstalls (W2): ONE market street, a single tidy row of stalls
  //    facing the promenade, spaced two tiles apart, garland strung overhead.
  //    Every stall is a rentable pitch id'd by build order (ShopStall rows).
  const stallXs = [15, 19, 23, 27, 31, 35, 39, 43];
  stallXs.forEach((sx, i) => {
    const stall: Prop = { kind: 'stall', x: sx, y: 43, w: 2, h: 2, variant: i % 4 };
    props.push(stall);
    blockFootprint(walkable, stall);
  });
  // The merchant stands in a gap in the row, behind the counter facing the
  // street — the visible person you sell to (tut2), not an empty stall.
  {
    const merchant: Prop = { kind: 'merchant', x: 33, y: 44, w: 1, h: 1, variant: 0 };
    props.push(merchant);
    blockFootprint(walkable, merchant);
  }
  // Garland: banners strung over the promenade (client rigs the lines).
  for (const [bx, by] of [
    [21, 42],
    [25, 42],
    [37, 42],
    [41, 42],
  ] as const) {
    if (walkable[by]?.[bx] !== true || onRoad(bx, by)) continue;
    const banner: Prop = { kind: 'banner', x: bx, y: by, w: 1, h: 1, variant: (bx + by) % 3 };
    props.push(banner);
    blockFootprint(walkable, banner);
  }

  // The Dispatcher: quest-giver at the mouth of the tram arrival square, on
  // the way west — the arrival square itself stays clear (W2).
  {
    const d: Prop = { kind: 'dispatcher', x: 44, y: 33, w: 1, h: 1, variant: 0 };
    props.push(d);
    blockFootprint(walkable, d);
  }

  // A sparse frame of planters at the plaza's inner rim — the only decor the
  // plaza gets, so the open space stays open.
  for (const [px, py] of [
    [24, 24],
    [24, 36],
    [36, 24],
    [36, 36],
  ] as const) {
    if (!isAreaFree(walkable, px, py, 1, 1)) continue;
    const planter: Prop = { kind: 'planter', x: px, y: py, w: 1, h: 1, variant: randInt(rng, 0, 1) };
    props.push(planter);
    blockFootprint(walkable, planter);
  }

  // ── Residential wall (W2): shacks ring the edges with alley gaps, so the
  //    city has a silhouette and nothing free-floats. The ring rule (only
  //    place where the 2×2 is free) keeps every interior tile reachable.
  const shackSpots: Array<[number, number]> = [
    // North wall.
    [6, 1],
    [16, 1],
    [24, 1],
    [40, 1],
    [50, 1],
    // South wall.
    [10, 57],
    [20, 57],
    [38, 57],
    [48, 57],
    // East wall.
    [57, 12],
    [57, 44],
    // West bank (across the canal — reached by the bridges).
    [2, 14],
    [2, 46],
  ];
  shackSpots.forEach(([sx, sy], i) => {
    if (!isAreaFree(walkable, sx, sy, 2, 2)) return;
    const shack: Prop = { kind: 'shack', x: sx, y: sy, w: 2, h: 2, variant: i };
    props.push(shack);
    blockFootprint(walkable, shack);
  });

  // ── Unique set pieces (one each): the Griddle noodle corner greets the
  //    west end of the market, the retired tram car rusts on a north siding,
  //    the scrap fountain marks the west approach. ────────────────────────
  const landmarks: Prop[] = [
    { kind: 'griddle', x: 14, y: 40, w: 3, h: 2, variant: 0 },
    { kind: 'tramcar', x: 40, y: 24, w: 4, h: 2, variant: 0 },
    { kind: 'fountain', x: 18, y: 22, w: 2, h: 2, variant: 0 },
  ];
  for (const p of landmarks) {
    if (!footprintWalkable(walkable, p)) continue;
    if (wouldSealPocketRect(walkable, p.x, p.y, p.w, p.h, size)) continue;
    props.push(p);
    blockFootprint(walkable, p);
  }

  // ── Vignettes (W1): a FEW purposeful clusters of 3–5 props — never a
  //    scatter of loose clutter. Each hugs a landmark and reads as a little
  //    scene worth walking to. Everything else stays open ground. ──────────
  const vignettes: Prop[] = [
    // The work corner, tucked north-west of the Tinkerbench.
    { kind: 'toolrack', x: 17, y: 26, w: 1, h: 1, variant: 0 },
    { kind: 'pallets', x: 21, y: 26, w: 1, h: 1, variant: 1 },
    { kind: 'gascans', x: 19, y: 25, w: 1, h: 1, variant: 0 },
    // The canal-side stash on the east towpath.
    { kind: 'cablespool', x: 12, y: 20, w: 1, h: 1, variant: 1 },
    { kind: 'barrels', x: 12, y: 22, w: 1, h: 1, variant: 0 },
    { kind: 'tarp', x: 12, y: 24, w: 1, h: 1, variant: 0 },
    // The south alley bins behind the market.
    { kind: 'scrapbin', x: 24, y: 52, w: 1, h: 1, variant: 0 },
    { kind: 'scrapbin', x: 27, y: 53, w: 1, h: 1, variant: 1 },
    { kind: 'ventbox', x: 25, y: 54, w: 1, h: 1, variant: 0 },
    // A stovepipe + wildbush breaking the north edge's line.
    { kind: 'stovepipe', x: 33, y: 8, w: 1, h: 1, variant: 0 },
    { kind: 'wildbush', x: 36, y: 9, w: 1, h: 1, variant: 2 },
    // The water tank on legs over the east alleys.
    { kind: 'watertank', x: 50, y: 20, w: 2, h: 2, variant: 0 },
    // A signpost where the connectors meet the spine, a vine on the bank wall.
    { kind: 'signpost', x: 34, y: 24, w: 1, h: 1, variant: 1 },
    { kind: 'vinewall', x: 11, y: 26, w: 1, h: 1, variant: 0 },
  ];
  for (const p of vignettes) {
    if (!footprintWalkable(walkable, p)) continue;
    if (onRoad(p.x, p.y)) continue;
    if (wouldSealPocketRect(walkable, p.x, p.y, p.w, p.h, size)) continue;
    props.push(p);
    blockFootprint(walkable, p);
  }

  // ── Gather nodes to the PERIPHERY (W2) ─────────────────────────────────
  const g = CONFIG.gathering;

  // Junk heaps ring the mid-periphery: the shadowed bands between the edge
  // buildings and the lit core — never in the plaza, on a road, in the scrap
  // yard, on the canal, or inside the cleared tram arrival square.
  const spawn = CONFIG.player.spawn;
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
      if (distToEdge < 3 || distToEdge > 12) return false;
      if (Math.max(Math.abs(x - c), Math.abs(y - c)) <= plaza.radius + 1) return false;
      if (onRoad(x, y)) return false;
      if (x >= 44 && y >= 44) return false; // the scrap yard is brass/amperite
      if (x >= cv.xMin - 1 && x <= cv.xMax + 1) return false; // off the canal banks
      if (Math.max(Math.abs(x - spawn.x), Math.abs(y - spawn.y)) <= 6) return false; // clear square
      return true;
    },
  );

  // Brass seams + amperite: the roped scrap corner in the SE, where the feral
  // Scuttlebots prowl (combat homeBox overlaps on purpose).
  const yard = { x0: 45, y0: 45, x1: size - 3, y1: size - 3 };
  scatterNodes(rng, walkable, nodes, 'brassSeam', g.brassSeam.nodeCount, g.brassSeam.minNodeSpacing, yard);
  scatterNodes(rng, walkable, nodes, 'amperite', g.amperite.nodeCount, g.amperite.minNodeSpacing, yard);

  // Glowkoi spots: ON the west canal (skimmed from the bank).
  const koiRows: number[] = [];
  {
    let tries = 0;
    while (koiRows.length < g.glowkoi.spotCount && tries < 400) {
      tries++;
      const y = randInt(rng, cv.yMin + 1, cv.yMax - 1);
      if ((cv.bridgeRows as readonly number[]).includes(y)) continue;
      if (y === FOOTBRIDGE_ROW) continue; // V5: the raised crossing's row
      if (koiRows.some((r) => Math.abs(r - y) < 4)) continue;
      koiRows.push(y);
    }
    for (const y of koiRows) {
      const x = randInt(rng, cv.xMin, cv.xMax);
      const candidates = [x, x === cv.xMin ? cv.xMax : cv.xMin];
      const pick = candidates.find((cx) =>
        [
          [cx + 1, y],
          [cx - 1, y],
          [cx, y + 1],
          [cx, y - 1],
        ].some(([ax, ay]) => walkable[ay as number]?.[ax as number] === true),
      );
      if (pick === undefined) continue;
      nodes.push({ id: nodes.length, kind: 'glowkoi', x: pick, y });
    }
  }

  // Antenna-shrines: the dark far outskirts (distant beacons in the void).
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
      if (onRoad(x, y)) return false;
      if (x >= 45 && y >= 45) return false; // not in the scrap yard
      return !(x >= cv.xMin - 1 && x <= cv.xMax + 1);
    },
  );

  // ── The roped scrap corner (W2): posts along the SE yard's north + west
  //    boundary with a gapped entrance off the promenade; the rope is visual.
  const ropeSpots: Array<[number, number]> = [];
  for (let x = 45; x <= 56; x += 2) if (x !== 51) ropeSpots.push([x, 44]); // gap = entrance
  for (let y = 47; y <= 55; y += 2) ropeSpots.push([44, y]);
  for (const [px, py] of ropeSpots) {
    if (!isAreaFree(walkable, px, py, 1, 1)) continue;
    if (onRoad(px, py)) continue;
    const post: Prop = { kind: 'ropepost', x: px, y: py, w: 1, h: 1, variant: 0 };
    props.push(post);
    blockFootprint(walkable, post);
  }

  // Every lane stall is a rentable player pitch, id'd by build order.
  const shopStalls: ShopStallSpot[] = props
    .filter((p) => p.kind === 'stall')
    .map((p, i) => ({ id: i, x: p.x, y: p.y, w: p.w, h: p.h }));

  // ── Terrain elevation (R4) ─────────────────────────────────────────────
  const elevation: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const ramp: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const d = Math.max(Math.abs(tx - c), Math.abs(ty - c));
      if (d < plaza.radius) (elevation[ty] as number[])[tx] = 1;
      else if (d === plaza.radius) (ramp[ty] as boolean[])[tx] = true;
      if (canal[ty]?.[tx] === true) (elevation[ty] as number[])[tx] = -1;
    }
  }
  // Raised tram platform: arrivals step off above the spine, then down.
  for (const ty of [29, 30, 31]) {
    (elevation[ty] as number[])[53] = 1;
    (ramp[ty] as boolean[])[53] = true;
  }

  // ── V5: the canal footbridge — a raised crossing over the coolant, both
  //    approaches ramped. The market spine crosses flat at the bridgeRows.
  const footbridges: TilePoint[] = [];
  for (const bx of [cv.xMin, cv.xMax]) {
    (walkable[FOOTBRIDGE_ROW] as boolean[])[bx] = true;
    (canal[FOOTBRIDGE_ROW] as boolean[])[bx] = false;
    (elevation[FOOTBRIDGE_ROW] as number[])[bx] = 1;
    footbridges.push({ x: bx, y: FOOTBRIDGE_ROW });
  }
  for (const ax of [cv.xMin - 1, cv.xMax + 1]) {
    if (walkable[FOOTBRIDGE_ROW]?.[ax] === true) (ramp[FOOTBRIDGE_ROW] as boolean[])[ax] = true;
  }

  // Catwalk light pools (I5): the tram landing, the plaza rim, the market.
  const catwalks: TilePoint[] = [
    { x: 50, y: 30 },
    { x: 30, y: 22 },
    { x: 22, y: 30 },
    { x: 38, y: 30 },
    { x: 30, y: 38 },
    { x: 30, y: 45 },
  ];
  return { district: 'filament', size, walkable, canal, roads, props, nodes, plaza, shopStalls, elevation, ramp, catwalks, bankInterior, footbridges, loftberths: [] };
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

  // ── V2 shape vocabulary, Tangle flavor: squatters' fabric, weeds through
  // the scrap, junction posts, one tank. Placed after the nodes (which get
  // first pick) with the same guards the Filament decor uses. ────────────
  const decor: Prop[] = [
    { kind: 'laundry', x: 4, y: 9, w: 3, h: 1, variant: 1 },
    { kind: 'stovepipe', x: 7, y: 5, w: 1, h: 1, variant: 0 },
    { kind: 'stovepipe', x: 32, y: 34, w: 1, h: 1, variant: 1 },
    { kind: 'banner', x: 12, y: 22, w: 1, h: 1, variant: 1 },
    { kind: 'signpost', x: 9, y: 22, w: 1, h: 1, variant: 1 },
    { kind: 'vinewall', x: 12, y: 11, w: 1, h: 1, variant: 0 },
    { kind: 'vinewall', x: 28, y: 29, w: 1, h: 1, variant: 1 },
    { kind: 'wildbush', x: 21, y: 28, w: 1, h: 1, variant: 1 },
    { kind: 'wildbush', x: 35, y: 21, w: 1, h: 1, variant: 2 },
    { kind: 'wildbush', x: 15, y: 4, w: 1, h: 1, variant: 0 },
    { kind: 'watertank', x: 18, y: 33, w: 2, h: 2, variant: 0 },
    // V4 unique set pieces: somebody's Draymule up on blocks beside the
    // crane yard, and the spilled container run in the south corridor.
    { kind: 'draymule', x: 23, y: 13, w: 2, h: 2, variant: 0 },
    { kind: 'spill', x: 19, y: 24, w: 3, h: 2, variant: 0 },
    // V5: the SW terrace becomes the OVERLOOK — a stash worth the climb
    // and a lamp to find it by (rails go on the rim separately below).
    { kind: 'cablespool', x: 5, y: 33, w: 1, h: 1, variant: 0 },
    { kind: 'tarp', x: 7, y: 34, w: 1, h: 1, variant: 1 },
    { kind: 'barrels', x: 4, y: 34, w: 1, h: 1, variant: 1 },
    { kind: 'alleylamp', x: 8, y: 33, w: 1, h: 1, variant: 0 },
  ];
  for (const prop of decor) {
    if (!footprintWalkable(walkable, prop)) continue;
    if (stealsNodeAccess(walkable, nodes, prop)) continue;
    let ramped = false;
    for (let dy = 0; dy < prop.h && !ramped; dy++) {
      for (let dx = 0; dx < prop.w && !ramped; dx++) {
        if (nearRamp(prop.x + dx, prop.y + dy)) ramped = true;
      }
    }
    if (ramped) continue;
    if (wouldSealPocketRect(walkable, prop.x, prop.y, prop.w, prop.h, size)) continue;
    props.push(prop);
    blockFootprint(walkable, prop);
  }

  // V5: overlook rails along the SW terrace rim. These deliberately skip
  // the nearRamp guard — a rail belongs beside a stair head; the stair
  // tiles themselves stay open (never placed ON a ramp).
  const railSpots: Array<[number, number, number]> = [
    [4, 30, 0], [5, 30, 0], [7, 30, 0], [8, 30, 0], // north rim (gap = stair)
    [9, 31, 1], [9, 33, 1], [9, 34, 1], // east rim (gap = stair)
  ];
  for (const [rx, ry, rv] of railSpots) {
    if (onRamp(rx, ry)) continue;
    const rail: Prop = { kind: 'guardrail', x: rx, y: ry, w: 1, h: 1, variant: rv };
    if (!footprintWalkable(walkable, rail)) continue;
    if (stealsNodeAccess(walkable, nodes, rail)) continue;
    if (wouldSealPocketRect(walkable, rail.x, rail.y, 1, 1, size)) continue;
    props.push(rail);
    blockFootprint(walkable, rail);
  }

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
  return { district: 'tangle', size, walkable, canal, roads: [], props, nodes, plaza, shopStalls: [], elevation, ramp, catwalks, bankInterior: [], footbridges: [], loftberths: [] };
}

/**
 * THE STACKS (districts block D1) — the vertical quarter, per the §12B
 * brief and the Part I §5 amendment: canyon streets between residential
 * towers (blocking props, never interiors), the cramped junction plaza
 * with the district's only open sky, and THE ROOFLINE — a +3 walkable
 * rooftop terrace over three fused towers, reached by a stair run, with
 * the rooftop market, the Tuning shrines, and the vista. The Signal
 * Spire looms over everything from the NE. PvE-safe, no mobs.
 */
export function buildStacksMap(seed: number = CONFIG.map.seed ^ 0x57ac): WorldMap {
  // W0 BREATHING ROOM: the free second district rides the larger footprint
  // too — the canyon keeps its tight alleys, but the streets breathe.
  const size = CONFIG.map.stacksSize;
  const rng: Rng = makeRng(seed);
  const walkable: boolean[][] = Array.from({ length: size }, () => Array(size).fill(true));
  const canal: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const roads: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const props: Prop[] = [];
  const nodes: GatherNode[] = [];
  // The junction plaza is a crossroads, not a heal ring: radius -1.
  const plaza = { cx: 20, cy: 28, radius: -1 };

  const place = (kind: PropKind, x: number, y: number, w = 1, h = 1, variant = 0) => {
    const p: Prop = { kind, x, y, w, h, variant };
    props.push(p);
    blockFootprint(walkable, p);
  };

  // ── The streets FIRST (W3): three decked canyon streets — the main
  //    east-west spine off the gate, the north street to the Roofline stair
  //    and the Spire quarter, the south street into the deep alleys. ──────
  for (let x = 1; x <= 58; x++) for (const y of [28, 29, 30]) (roads[y] as boolean[])[x] = true;
  for (let y = 4; y <= 30; y++) for (const x of [19, 20, 21]) (roads[y] as boolean[])[x] = true;
  for (let y = 31; y <= 56; y++) for (const x of [37, 38, 39]) (roads[y] as boolean[])[x] = true;

  // ── elevation FIRST: the Roofline plateau + its stair run ──────────────
  const elevation: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const ramp: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const R = CONFIG.stacks.roofline;
  for (let ty = R.y0; ty <= R.y1; ty++) {
    for (let tx = R.x0; tx <= R.x1; tx++) (elevation[ty] as number[])[tx] = R.level;
  }
  // The stair run climbs the plateau's west face: three ramp steps.
  const stairX = R.x0 - 1;
  for (let step = 1; step <= 3; step++) {
    const sy = R.y1 + 4 - step; // (24,18)+1 → (24,17)+2 → (24,16)+3
    (elevation[sy] as number[])[stairX] = step;
    (ramp[sy] as boolean[])[stairX] = true;
  }
  // The landing strip beside the plateau's west rim rides at +3 too, so
  // the top stair step opens onto the terrace.
  (elevation[R.y1] as number[])[stairX] = R.level;
  const onRamp = (x: number, y: number): boolean => ramp[y]?.[x] === true;
  const nearRamp = (x: number, y: number): boolean =>
    onRamp(x, y) || onRamp(x - 1, y) || onRamp(x + 1, y) || onRamp(x, y - 1) || onRamp(x, y + 1);

  // ── gates + landmarks ───────────────────────────────────────────────────
  place('tramgate', 1, 27, 2, 5); // arrivals step onto the main street
  place('spire', 48, 4, 3, 3); // THE SIGNAL SPIRE — red crown, seen everywhere
  place('registry', 42, 25, 4, 3); // the vanity registry office, fronting main

  // ── the towers: canyon walls (4×4 blocking, design*3+paint variant) ────
  const towerVariant = (x: number, y: number) => ((x * 7 + y * 13) % 4) * 3 + ((x * 3 + y * 5) % 3);
  const towerAt = (x: number, y: number) => {
    // Towers may abut each other (a canyon, not a suburb) — but never the
    // plateau, the stairs, the streets, or anything already placed.
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        if (walkable[y + dy]?.[x + dx] !== true) return;
        if ((elevation[y + dy]?.[x + dx] ?? 0) !== 0) return;
        if (nearRamp(x + dx, y + dy)) return;
        if (roads[y + dy]?.[x + dx] === true) return;
      }
    }
    place('tower', x, y, 4, 4, towerVariant(x, y));
  };
  // North-west quarter (west of the north street, north of main).
  for (const [tx, ty] of [
    [3, 4], [9, 4], [15, 4], [3, 10], [9, 10], [15, 10], [3, 16], [9, 16], [15, 16], [3, 22], [9, 22],
  ] as const) towerAt(tx, ty);
  // North rim + the Spire quarter east of the plateau.
  for (const [tx, ty] of [
    [23, 2], [29, 2], [35, 2], [42, 2],
    [41, 8], [47, 8], [53, 8], [41, 14], [47, 14], [53, 14],
    [44, 20], [50, 20], [28, 20], [34, 20],
  ] as const) towerAt(tx, ty);
  // South-west quarter (between main and the deep south edge).
  for (const ty of [33, 39, 45, 51] as const) {
    for (const tx of [3, 9, 15, 21, 27] as const) towerAt(tx, ty);
  }
  // South-east quarter, across the south street.
  for (const ty of [33, 39, 45, 51] as const) {
    for (const tx of [41, 47, 53] as const) towerAt(tx, ty);
  }

  // The ONE rooftop garden in the city (§12B brief): a fixed tower wears
  // it — variant 12 is the client's special garden-roof bake.
  const gardenTower = props.find((p) => p.kind === 'tower' && p.x === 9 && p.y === 10);
  if (gardenTower !== undefined) gardenTower.variant = 12;

  // ── the junction plaza: noodle cart + the district's one tree ──────────
  place('noodlecart', 17, 26, 2, 1);
  place('treeplanter', 22, 25, 2, 2);
  // U1a: the dispatch post — parcel runs to the named towers start here.
  place('dispatchpost', 16, 31, 1, 1);

  // ── Roofline furniture: market stalls, the shanty, the water tank ──────
  place('watertank', 26, 9, 2, 2);
  place('stall', 29, 9, 2, 2, 0);
  place('stall', 32, 9, 2, 2, 2);
  place('shanty', 33, 12, 2, 2);

  // ── nodes: alley junk + Signal shrines (ground and Roofline) ───────────
  const spawn = CONFIG.travel.stacksSpawn;
  const isStreet = (x: number, y: number): boolean =>
    roads[y]?.[x] === true || (x >= 16 && x <= 24 && y >= 25 && y <= 31); // + the junction
  // Alley junk is HAND-laid: the scatter helper demands a free ring, and
  // a canyon alley is two tiles wide by design — junk hugs the tower walls
  // at alley tips and pocket corners, never sealing a route (flood-checked).
  const junkSpots: Array<[number, number]> = [
    [7, 8], [13, 8], [14, 14], [7, 20], [13, 26], // NW alleys
    [39, 6], [46, 3], [45, 10], [51, 12], // Spire-quarter pockets
    [8, 37], [20, 43], [14, 49], [26, 51], // SW deep alleys
    [46, 37], [52, 43], [46, 49], // SE deep alleys (spares — first junkCount win)
  ];
  for (const [jx, jy] of junkSpots) {
    if (nodes.filter((n) => n.kind === 'junkHeap').length >= CONFIG.stacks.junkCount) break;
    if (walkable[jy]?.[jx] !== true || (elevation[jy]?.[jx] ?? 0) !== 0) continue;
    if (isStreet(jx, jy) || nearRamp(jx, jy)) continue;
    if (Math.max(Math.abs(jx - spawn.x), Math.abs(jy - spawn.y)) <= 6) continue; // W2: clear arrival
    if (wouldSealPocket(walkable, jx, jy, size)) continue;
    nodes.push({ id: nodes.length, kind: 'junkHeap', x: jx, y: jy });
    blockFootprint(walkable, { x: jx, y: jy, w: 1, h: 1 });
  }
  scatterNodes(rng, walkable, nodes, 'antenna', CONFIG.stacks.antennaGround, 4, {
    x0: 2, y0: 2, x1: size - 3, y1: size - 3,
  }, (x, y) => (elevation[y]?.[x] ?? 0) === 0 && !isStreet(x, y) && !nearRamp(x, y));
  // The Roofline shrines — the city's best Signal lives up here.
  scatterNodes(rng, walkable, nodes, 'antenna', CONFIG.stacks.antennaRoofline, 2, {
    x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1,
  }, (x, y) => (elevation[y]?.[x] ?? 0) === R.level && !nearRamp(x, y));

  // ── Roofline rim rails + street decor (guarded like everywhere else) ───
  const decor: Prop[] = [
    // South rim rails (the stair landing at x24-25 stays open).
    { kind: 'guardrail', x: 27, y: 15, w: 1, h: 1, variant: 0 },
    { kind: 'guardrail', x: 29, y: 15, w: 1, h: 1, variant: 0 },
    { kind: 'guardrail', x: 31, y: 15, w: 1, h: 1, variant: 0 },
    { kind: 'guardrail', x: 33, y: 15, w: 1, h: 1, variant: 0 },
    // West rim rails.
    { kind: 'guardrail', x: 25, y: 10, w: 1, h: 1, variant: 1 },
    { kind: 'guardrail', x: 25, y: 12, w: 1, h: 1, variant: 1 },
    // Street life: wash lines and banners in the canyon, V2 vocabulary.
    { kind: 'laundry', x: 5, y: 21, w: 3, h: 1, variant: 0 },
    { kind: 'laundry', x: 45, y: 17, w: 3, h: 1, variant: 1 },
    { kind: 'banner', x: 18, y: 33, w: 1, h: 1, variant: 2 },
    { kind: 'banner', x: 35, y: 26, w: 1, h: 1, variant: 0 },
    { kind: 'stovepipe', x: 10, y: 55, w: 1, h: 1, variant: 0 },
    { kind: 'stovepipe', x: 50, y: 33, w: 1, h: 1, variant: 1 },
    { kind: 'wildbush', x: 12, y: 32, w: 1, h: 1, variant: 1 },
    { kind: 'scrapbin', x: 28, y: 37, w: 1, h: 1, variant: 0 },
    { kind: 'scrapbin', x: 7, y: 43, w: 1, h: 1, variant: 1 },
  ];
  for (const prop of decor) {
    if (!footprintWalkable(walkable, prop)) continue;
    if (stealsNodeAccess(walkable, nodes, prop)) continue;
    let ramped = false;
    for (let dy = 0; dy < prop.h && !ramped; dy++) {
      for (let dx = 0; dx < prop.w && !ramped; dx++) {
        if (nearRamp(prop.x + dx, prop.y + dy)) ramped = true;
      }
    }
    if (ramped) continue;
    if (wouldSealPocketRect(walkable, prop.x, prop.y, prop.w, prop.h, size)) continue;
    props.push(prop);
    blockFootprint(walkable, prop);
  }

  // Catwalks: the gate landing, the junction plaza, and THE VISTA — the
  // Roofline's SE corner, looking down the lit canyon.
  const catwalks: TilePoint[] = [
    { x: 4, y: 29 },
    { x: 20, y: 28 },
    { x: 34, y: 15 },
  ];
  return { district: 'stacks', size, walkable, canal, roads, props, nodes, plaza, shopStalls: [], elevation, ramp, catwalks, bankInterior: [], footbridges: [], loftberths: [] };
}

/**
 * THE TERRARIUM (districts block D2) — the hanging-garden tier, per the
 * §12B brief: three stepped terrace bands rising east, greenery as
 * INFRASTRUCTURE on built decking (never lawn), the MOTHER TRELLIS
 * feeding every bed below, and the Loftpod berths — the city's housing
 * showroom. The gentlest district: PvE-safe, NO mobs, no Scrapcache.
 */
export function buildTerrariumMap(seed: number = CONFIG.map.seed ^ 0x7e88): WorldMap {
  const size = CONFIG.map.size;
  const rng: Rng = makeRng(seed);
  const walkable: boolean[][] = Array.from({ length: size }, () => Array(size).fill(true));
  const canal: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const props: Prop[] = [];
  const nodes: GatherNode[] = [];
  const plaza = { cx: 31, cy: 17, radius: -1 }; // the Trellis court, no heal ring

  const place = (kind: PropKind, x: number, y: number, w = 1, h = 1, variant = 0) => {
    const p: Prop = { kind, x, y, w, h, variant };
    props.push(p);
    blockFootprint(walkable, p);
  };

  // ── the three terrace bands (elevation first — guards read it) ─────────
  const elevation: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const ramp: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 14; tx <= 25; tx++) (elevation[ty] as number[])[tx] = 1;
    for (let tx = 26; tx < size; tx++) (elevation[ty] as number[])[tx] = 2;
  }
  // Garden steps up each terrace face — generous, this is a stroll.
  for (const ry of [6, 20, 32]) (ramp[ry] as boolean[])[14] = true;
  for (const ry of [10, 24, 34]) (ramp[ry] as boolean[])[26] = true;
  const onRamp = (x: number, y: number): boolean => ramp[y]?.[x] === true;
  const nearRamp = (x: number, y: number): boolean =>
    onRamp(x, y) || onRamp(x - 1, y) || onRamp(x + 1, y) || onRamp(x, y - 1) || onRamp(x, y + 1);

  // ── the gate + the MOTHER TRELLIS ───────────────────────────────────────
  place('tramgate', 1, 18, 2, 5);
  place('mothertrellis', 30, 15, 4, 4);

  // ── garden infrastructure: crop-bed rows, sheds, trees, green walls ────
  const bedRows: Array<[number, number, number]> = [
    // [x, y, count] — beds run east in a row, 2×1 each with walk gaps.
    [15, 4, 3], [15, 12, 3], [16, 22, 3], [15, 28, 3], [16, 35, 3],
    [27, 4, 3], [28, 12, 2], [27, 22, 2], [28, 28, 3], [27, 35, 3],
    [5, 8, 2], [4, 26, 2], [6, 32, 2],
  ];
  for (const [bx, by, count] of bedRows) {
    for (let i = 0; i < count; i++) {
      const p: Prop = { kind: 'gardenbed', x: bx + i * 3, y: by, w: 2, h: 1, variant: (bx + i) % 3 };
      if (!footprintWalkable(walkable, p)) continue;
      let ramped = false;
      for (let dx = 0; dx < p.w && !ramped; dx++) if (nearRamp(p.x + dx, p.y)) ramped = true;
      if (ramped) continue;
      if (wouldSealPocketRect(walkable, p.x, p.y, p.w, p.h, size)) continue;
      props.push(p);
      blockFootprint(walkable, p);
    }
  }
  for (const [sx, sy] of [
    [9, 14], [22, 8], [21, 30], [34, 8], [33, 30],
  ] as const) {
    if (!nearRamp(sx, sy)) {
      const p: Prop = { kind: 'toolshed', x: sx, y: sy, w: 2, h: 2, variant: (sx + sy) % 2 };
      if (footprintWalkable(walkable, p) && !wouldSealPocketRect(walkable, p.x, p.y, 2, 2, size)) {
        props.push(p);
        blockFootprint(walkable, p);
      }
    }
  }
  for (const [tx2, ty2] of [
    [8, 5], [10, 29], [19, 17], [24, 26], [35, 21],
  ] as const) {
    const p: Prop = { kind: 'treeplanter', x: tx2, y: ty2, w: 2, h: 2, variant: 0 };
    if (footprintWalkable(walkable, p) && !nearRamp(tx2, ty2) && !wouldSealPocketRect(walkable, tx2, ty2, 2, 2, size)) {
      props.push(p);
      blockFootprint(walkable, p);
    }
  }

  // ── the Loftpod berths (D2b): 3×3 walkable pads, sightline-placed ──────
  const loftberths: TilePoint[] = [];
  for (const [bx, by] of [
    [16, 8], [16, 24], [20, 32], [29, 8], [33, 25], [28, 31],
  ] as const) {
    let clear = true;
    for (let dy = 0; dy < 3 && clear; dy++) {
      for (let dx = 0; dx < 3 && clear; dx++) {
        if (walkable[by + dy]?.[bx + dx] !== true) clear = false;
        if (nearRamp(bx + dx, by + dy)) clear = false;
      }
    }
    if (clear) loftberths.push({ x: bx, y: by });
  }

  // ── compost heaps: the peaceful scavenge (Scavving rules apply) ────────
  scatterNodes(rng, walkable, nodes, 'junkHeap', CONFIG.terrarium.compostCount, 4, {
    x0: 3, y0: 3, x1: size - 4, y1: size - 4,
  }, (x, y) => {
    if (nearRamp(x, y)) return false;
    if (Math.abs(y - 20) <= 1 && x <= 8) return false; // gate approach
    // Not on a berth pad — homes keep their yards.
    return !loftberths.some((b) => x >= b.x - 1 && x <= b.x + 3 && y >= b.y - 1 && y <= b.y + 3);
  });

  // ── organic dressing: vine walls + wild bushes along terrace edges ─────
  const decor: Prop[] = [
    { kind: 'vinewall', x: 13, y: 12, w: 1, h: 1, variant: 0 },
    { kind: 'vinewall', x: 13, y: 26, w: 1, h: 1, variant: 1 },
    { kind: 'vinewall', x: 25, y: 16, w: 1, h: 1, variant: 0 },
    { kind: 'vinewall', x: 25, y: 30, w: 1, h: 1, variant: 1 },
    { kind: 'wildbush', x: 7, y: 17, w: 1, h: 1, variant: 0 },
    { kind: 'wildbush', x: 18, y: 26, w: 1, h: 1, variant: 1 },
    { kind: 'wildbush', x: 23, y: 5, w: 1, h: 1, variant: 2 },
    { kind: 'wildbush', x: 31, y: 33, w: 1, h: 1, variant: 1 },
    { kind: 'wildbush', x: 36, y: 12, w: 1, h: 1, variant: 0 },
    { kind: 'watertank', x: 35, y: 4, w: 2, h: 2, variant: 0 },
    { kind: 'barrels', x: 10, y: 15, w: 1, h: 1, variant: 0 },
    { kind: 'cablespool', x: 5, y: 12, w: 1, h: 1, variant: 1 },
  ];
  for (const prop of decor) {
    if (!footprintWalkable(walkable, prop)) continue;
    if (stealsNodeAccess(walkable, nodes, prop)) continue;
    let ramped = false;
    for (let dy = 0; dy < prop.h && !ramped; dy++) {
      for (let dx = 0; dx < prop.w && !ramped; dx++) {
        if (nearRamp(prop.x + dx, prop.y + dy)) ramped = true;
      }
    }
    if (ramped) continue;
    if (wouldSealPocketRect(walkable, prop.x, prop.y, prop.w, prop.h, size)) continue;
    if (loftberths.some((b) => prop.x >= b.x - 1 && prop.x <= b.x + 3 && prop.y >= b.y - 1 && prop.y <= b.y + 3)) continue;
    props.push(prop);
    blockFootprint(walkable, prop);
  }

  // Catwalks: the gate landing + the Trellis court (housing showroom light).
  const catwalks: TilePoint[] = [
    { x: 4, y: 20 },
    { x: 29, y: 19 },
  ];
  return { district: 'terrarium', size, walkable, canal, roads: [], props, nodes, plaza, shopStalls: [], elevation, ramp, catwalks, bankInterior: [], footbridges: [], loftberths };
}

export function buildDistrictMap(district: DistrictId): WorldMap {
  if (district === 'tangle') return buildTangleMap();
  if (district === 'stacks') return buildStacksMap();
  if (district === 'terrarium') return buildTerrariumMap();
  return buildWorldMap();
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
