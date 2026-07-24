import { CONFIG } from './config';

/**
 * U1 — THE DARKNESS MECHANIC, pure math (server truth + client display
 * share these; unit-tested off a live server per the conventions).
 *
 * The Underworks' rule: you see and touch only what your light reaches.
 * A lit Wicklamp burns Cellwax from the Pack (a real recurring sink —
 * numbers in CONFIG.underworks.lamp, never here). Out of fuel, the light
 * falls to a dim ember over emberSeconds — never to zero, and the way
 * out is always findable (the no-stranding principle).
 */

export interface WicklampState {
  /** Seconds left on the Cellwax stick currently burning (0 = none lit). */
  burnLeft: number;
  /** 1 → 0 while the ember dies after fuel runs out; 1 while fueled. */
  emberT: number;
}

export const freshLamp = (): WicklampState => ({ burnLeft: 0, emberT: 1 });

export interface LampTickResult {
  state: WicklampState;
  /** Cellwax sticks consumed this tick (0 or 1). */
  consumed: number;
  /** True while the lamp holds its full radius. */
  lit: boolean;
}

/**
 * Advance the lamp by dt seconds. `hasLamp` = a Wicklamp rides in the
 * Pack; `cellwax` = sticks available to burn. Consumption happens only
 * at stick boundaries — an unburned stick is never partially charged.
 */
export function lampTick(
  state: WicklampState,
  dt: number,
  hasLamp: boolean,
  cellwax: number,
): LampTickResult {
  const cfg = CONFIG.underworks.lamp;
  if (!hasLamp) {
    return { state: { burnLeft: 0, emberT: 0 }, consumed: 0, lit: false };
  }
  let { burnLeft, emberT } = state;
  let consumed = 0;
  burnLeft = Math.max(0, burnLeft - dt);
  if (burnLeft <= 0 && cellwax > 0) {
    burnLeft = cfg.burnSecondsPerCellwax;
    consumed = 1;
  }
  if (burnLeft > 0) {
    emberT = 1;
  } else {
    // The ember dies over emberSeconds, then holds at 0 (dim, never dark).
    emberT = Math.max(0, emberT - dt / cfg.emberSeconds);
  }
  return { state: { burnLeft, emberT }, consumed, lit: burnLeft > 0 };
}

/** The radius a Spark's light reaches right now (chebyshev tiles). */
export function lightRadiusTiles(lit: boolean, emberT: number): number {
  const cfg = CONFIG.underworks.lamp;
  if (lit) return cfg.radiusTiles;
  // Ember: shrink from full toward the ember floor as emberT dies.
  return cfg.emberRadiusTiles + (cfg.radiusTiles - cfg.emberRadiusTiles) * Math.max(0, emberT);
}

/** Server gate: may this actor touch a target at chebyshev distance d? */
export function withinLight(d: number, lit: boolean, emberT: number): boolean {
  return d <= lightRadiusTiles(lit, emberT);
}
