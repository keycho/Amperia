import type { TilePoint } from './pathfinding';

/**
 * Pure movement stepping shared by the server simulation (authoritative
 * positions for loot/adjacency checks) and any client prediction.
 */
export interface MoveState {
  tile: TilePoint;
  queue: TilePoint[];
  /** Seconds accumulated toward the next step. */
  acc: number;
}

export function makeMoveState(tile: TilePoint): MoveState {
  return { tile: { ...tile }, queue: [], acc: 0 };
}

/** Replace the walk queue (path must start after `tile`). */
export function setPath(m: MoveState, path: TilePoint[]): MoveState {
  return { tile: { ...m.tile }, queue: path.map((p) => ({ ...p })), acc: m.queue.length > 0 ? m.acc : 0 };
}

/** Advance the walk by dt; steps whole tiles as the accumulator fills. */
export function advanceMovement(m: MoveState, dtSeconds: number, secondsPerTile: number): MoveState {
  if (m.queue.length === 0) return { tile: { ...m.tile }, queue: [], acc: 0 };
  let acc = m.acc + dtSeconds;
  let tile = { ...m.tile };
  const queue = m.queue.map((p) => ({ ...p }));
  while (acc >= secondsPerTile && queue.length > 0) {
    acc -= secondsPerTile;
    tile = queue.shift() as TilePoint;
  }
  if (queue.length === 0) acc = 0;
  return { tile, queue, acc };
}
