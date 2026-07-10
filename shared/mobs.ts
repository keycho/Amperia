import type { TilePoint } from './pathfinding';

/**
 * Pure AI math for feral Scuttlebots. The server owns the loop; these
 * functions decide state transitions so the behavior is unit-testable
 * off a live room (CLAUDE.md conventions).
 */

export type MobAiState = 'idle' | 'wander' | 'chase' | 'windup' | 'return';

export interface MobAiConfig {
  aggroRadiusTiles: number;
  leashRadiusTiles: number;
  windupSeconds: number;
}

export interface MobAiSnapshot {
  state: MobAiState;
  mobTile: TilePoint;
  homeTile: TilePoint;
  /** Chebyshev distance to the current/nearest target; null = none alive. */
  targetDist: number | null;
  /** Chebyshev distance of the TARGET from the mob's home. */
  targetDistFromHome: number | null;
  windupElapsed: number;
  /** True while the post-bite cooldown is still running. */
  onCooldown: boolean;
}

export const chebyshev = (a: TilePoint, b: TilePoint): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export interface MobAiDecision {
  state: MobAiState;
  /** Set on the windup→(chase|return) edge when the bite should land. */
  bite: boolean;
}

/**
 * One AI tick decision. Movement/pathing and damage application stay in the
 * room; this only answers "what state next, and does a bite land now?".
 */
export function nextMobState(s: MobAiSnapshot, cfg: MobAiConfig): MobAiDecision {
  const distHome = chebyshev(s.mobTile, s.homeTile);
  const targetInLeash =
    s.targetDist !== null &&
    s.targetDistFromHome !== null &&
    s.targetDistFromHome <= cfg.leashRadiusTiles;

  switch (s.state) {
    case 'idle':
    case 'wander': {
      if (targetInLeash && (s.targetDist as number) <= cfg.aggroRadiusTiles) {
        return { state: 'chase', bite: false };
      }
      return { state: s.state, bite: false };
    }
    case 'chase': {
      if (!targetInLeash || distHome > cfg.leashRadiusTiles + 2) {
        return { state: 'return', bite: false };
      }
      if ((s.targetDist as number) <= 1 && !s.onCooldown) {
        return { state: 'windup', bite: false };
      }
      return { state: 'chase', bite: false };
    }
    case 'windup': {
      // Committed: the telegraph always finishes; the bite lands only if the
      // Spark is still in reach when it snaps.
      if (s.windupElapsed >= cfg.windupSeconds) {
        const landed = s.targetDist !== null && s.targetDist <= 1;
        return { state: targetInLeash ? 'chase' : 'return', bite: landed };
      }
      return { state: 'windup', bite: false };
    }
    case 'return': {
      if (distHome <= 1) return { state: 'idle', bite: false };
      return { state: 'return', bite: false };
    }
  }
}
