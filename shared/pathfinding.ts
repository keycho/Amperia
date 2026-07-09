/**
 * A* over the tile grid. Movement is 4-directional (no diagonals), which
 * structurally rules out corner-cutting through blocked tiles and gives the
 * chunky, readable movement the iso view wants. Pure and deterministic so the
 * server can validate the same paths later.
 */

export interface PathGrid {
  size: number;
  /** walkable[y][x] */
  walkable: boolean[][];
}

export interface TilePoint {
  x: number;
  y: number;
}

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

/** Binary min-heap on f (ties broken by g, preferring further-along nodes). */
class MinHeap {
  private items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(n: Node): void {
    this.items.push(n);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(i, p)) {
        this.swap(i, p);
        i = p;
      } else break;
    }
  }

  pop(): Node | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.less(l, m)) m = l;
        if (r < this.items.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const na = this.items[a] as Node;
    const nb = this.items[b] as Node;
    return na.f < nb.f || (na.f === nb.f && na.g > nb.g);
  }

  private swap(a: number, b: number): void {
    const t = this.items[a] as Node;
    this.items[a] = this.items[b] as Node;
    this.items[b] = t;
  }
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Shortest 4-directional path from start to goal.
 * Returns the steps AFTER start (start excluded, goal included), an empty
 * array when start === goal, or null when the goal is blocked/unreachable.
 */
export function findPath(
  grid: PathGrid,
  start: TilePoint,
  goal: TilePoint,
): TilePoint[] | null {
  const { size, walkable } = grid;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size;
  if (!inBounds(start.x, start.y) || !inBounds(goal.x, goal.y)) return null;
  if (walkable[start.y]?.[start.x] !== true || walkable[goal.y]?.[goal.x] !== true) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const key = (x: number, y: number) => y * size + x;
  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

  const open = new MinHeap();
  const gScore = new Map<number, number>();
  const closed = new Set<number>();

  const startNode: Node = { x: start.x, y: start.y, g: 0, f: h(start.x, start.y), parent: null };
  open.push(startNode);
  gScore.set(key(start.x, start.y), 0);

  while (open.size > 0) {
    const cur = open.pop() as Node;
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.x === goal.x && cur.y === goal.y) {
      const path: TilePoint[] = [];
      let n: Node | null = cur;
      while (n !== null && n.parent !== null) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      return path.reverse();
    }

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(nx, ny) || walkable[ny]?.[nx] !== true) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const g = cur.g + 1;
      const best = gScore.get(nk);
      if (best !== undefined && best <= g) continue;
      gScore.set(nk, g);
      open.push({ x: nx, y: ny, g, f: g + h(nx, ny), parent: cur });
    }
  }
  return null;
}

/**
 * Path to the nearest walkable tile orthogonally adjacent to a target
 * footprint (for walking up to nodes/props). Returns the shortest candidate
 * path, or null when no adjacent tile is reachable.
 */
export function findPathAdjacent(
  grid: PathGrid,
  start: TilePoint,
  target: { x: number; y: number; w: number; h: number },
): TilePoint[] | null {
  const candidates: TilePoint[] = [];
  for (let dx = 0; dx < target.w; dx++) {
    candidates.push({ x: target.x + dx, y: target.y - 1 });
    candidates.push({ x: target.x + dx, y: target.y + target.h });
  }
  for (let dy = 0; dy < target.h; dy++) {
    candidates.push({ x: target.x - 1, y: target.y + dy });
    candidates.push({ x: target.x + target.w, y: target.y + dy });
  }
  // Standing next to it already?
  if (candidates.some((c) => c.x === start.x && c.y === start.y)) return [];

  let best: TilePoint[] | null = null;
  for (const c of candidates) {
    const p = findPath(grid, start, c);
    if (p !== null && (best === null || p.length < best.length)) best = p;
  }
  return best;
}
