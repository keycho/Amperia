import type { JunkHeapConfig } from './config';
import type { ItemId } from './items';
import { randInt, type Rng } from './rng';

/**
 * Pure gathering math (Game Bible B3). Attention pays: hitting the glint
 * multiplies the cycle's yield and is the ONLY path to a rare-find roll —
 * passive gathering still works at base yield.
 */

export interface GatherRoll {
  /** Salvage collected this cycle. */
  amount: number;
  /** Rare Manifest variant collected, if the rare-find roll hit. */
  rare: ItemId | null;
  /** Whether the glint bonus applied (echoed for logging/UI). */
  glintHit: boolean;
}

export function rollGather(cfg: JunkHeapConfig, glintHit: boolean, rng: Rng): GatherRoll {
  const base = randInt(rng, cfg.yieldMin, cfg.yieldMax);
  const amount = glintHit ? Math.round(base * cfg.glint.yieldMultiplier) : base;
  const rare =
    glintHit && rng() < cfg.glint.rareFindChance ? (cfg.glint.rareFindItem as ItemId) : null;
  return { amount, rare, glintHit };
}

/**
 * When (in seconds from cycle start) the glint pops this cycle.
 * Deterministic given the rng stream — per-session cue variation is the
 * anti-scripting habit the bible asks for (B3).
 */
export function rollGlintTime(cfg: JunkHeapConfig, cycleSeconds: number, rng: Rng): number {
  const { earliestCycleFraction, latestCycleFraction } = cfg.glint;
  const f = earliestCycleFraction + rng() * (latestCycleFraction - earliestCycleFraction);
  return f * cycleSeconds;
}
