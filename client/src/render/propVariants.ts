import { voxelHash } from './materials';

/**
 * V1 repetition breaking: deterministic per-position looks for the common
 * props. The position hash seeds the pick (stable across sessions and
 * clients — pure presentation, the server never sees it); an adjacency
 * guard then probes the pool for a look no same-kind neighbor within
 * `reach` tiles already wears. When a dense cluster exhausts the pool, we
 * take the candidate whose nearest twin is FARTHEST away — so with three
 * or more looks, two identical models never touch orthogonally, ever.
 */
export class VariantPicker {
  private readonly placed = new Map<string, number>();

  /**
   * Pick a look index in [0, count) for a `kind` prop at tile (tx, ty).
   * `kind` scopes the adjacency guard — only props sharing the key repel
   * each other (a dented teal box next to a plain rust one is fine).
   */
  pick(kind: string, tx: number, ty: number, count: number, reach = 2): number {
    if (count <= 1) return 0;
    const base = Math.floor(voxelHash(tx, ty, 0, saltFor(kind)) * count);
    let best = base;
    let bestClearance = -1;
    for (let attempt = 0; attempt < count; attempt++) {
      const candidate = (base + attempt) % count;
      const clearance = this.clearance(kind, tx, ty, candidate, reach);
      if (clearance === Infinity) {
        this.placed.set(`${kind}@${tx},${ty}`, candidate);
        return candidate;
      }
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = candidate;
      }
    }
    this.placed.set(`${kind}@${tx},${ty}`, best);
    return best;
  }

  /** Squared distance to the nearest placed twin; Infinity if none in reach. */
  private clearance(kind: string, tx: number, ty: number, candidate: number, reach: number): number {
    let nearest = Infinity;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (this.placed.get(`${kind}@${tx + dx},${ty + dy}`) === candidate) {
          nearest = Math.min(nearest, dx * dx + dy * dy);
        }
      }
    }
    return nearest;
  }
}

/** Stable string → salt so each prop family hashes independently. */
function saltFor(kind: string): number {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) | 0;
  return h;
}
