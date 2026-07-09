import type {
  AmperiteConfig,
  AntennaConfig,
  BrassSeamConfig,
  GlowkoiConfig,
} from './config';
import { randInt, type Rng } from './rng';

/**
 * Pure math for the gathering active layers (Game Bible B3). The server
 * rolls everything with ITS rng and clock; the client only renders cues.
 */

// ── Brass: seam forks ─────────────────────────────────────────────────────

export function rollBrassSegmentYield(cfg: BrassSeamConfig, rng: Rng): number {
  return randInt(rng, cfg.segmentYieldMin, cfg.segmentYieldMax);
}

/** Which side the vein continues on (0 = left fork, 1 = right fork). */
export function pickLiveFork(rng: Rng): 0 | 1 {
  return rng() < 0.5 ? 0 : 1;
}

/** Rare roll happens only when the whole vein was followed to the end. */
export function rollBrassRare(cfg: BrassSeamConfig, completed: boolean, rng: Rng): boolean {
  return completed && rng() < cfg.rareFindChance;
}

// ── Amperite: pulse timing ────────────────────────────────────────────────

/**
 * Whether a strike at `elapsed` seconds (since session start) lands on-pulse.
 * Peaks occur at phase, phase+period, … — on-pulse within ±window/2.
 */
export function pulseIsOn(
  elapsedSeconds: number,
  phaseSeconds: number,
  periodSeconds: number,
  windowSeconds: number,
): boolean {
  const t = elapsedSeconds - phaseSeconds;
  const sincePeak = ((t % periodSeconds) + periodSeconds) % periodSeconds;
  const distance = Math.min(sincePeak, periodSeconds - sincePeak);
  return distance <= windowSeconds / 2;
}

export function amperiteStrikeYield(cfg: AmperiteConfig, onPulse: boolean): number {
  return onPulse ? cfg.yieldOnPulse : cfg.yieldOffPulse;
}

// ── Glowkoi: cast and tension ─────────────────────────────────────────────

export interface KoiRoll {
  /** Index into cfg.sizes. */
  sizeIdx: number;
  /** Prismatic rare — telegraphed by the shadow's shimmer. */
  rare: boolean;
}

export function rollKoi(cfg: GlowkoiConfig, rng: Rng): KoiRoll {
  const total = cfg.sizes.reduce((s, k) => s + k.weight, 0);
  let r = rng() * total;
  let sizeIdx = 0;
  for (let i = 0; i < cfg.sizes.length; i++) {
    const w = cfg.sizes[i]?.weight ?? 0;
    if (r < w) {
      sizeIdx = i;
      break;
    }
    r -= w;
    sizeIdx = i;
  }
  return { sizeIdx, rare: rng() < cfg.rareChance };
}

/** Tension needle position 0..1 — triangle wave over the period. */
export function tensionValue(elapsedSeconds: number, periodSeconds: number): number {
  const t = ((elapsedSeconds % periodSeconds) + periodSeconds) % periodSeconds;
  const half = periodSeconds / 2;
  return t < half ? t / half : 1 - (t - half) / half;
}

export function inSweetZone(value: number, sweetStart: number, sweetLen: number): boolean {
  return value >= sweetStart && value <= sweetStart + sweetLen;
}

/** Where the sweet zone sits this cast (fits fully inside the bar). */
export function rollSweetZoneStart(cfg: GlowkoiConfig, rng: Rng): number {
  return rng() * (1 - cfg.sweetZoneFraction);
}

export function koiYield(cfg: GlowkoiConfig, roll: KoiRoll): number {
  const size = cfg.sizes[roll.sizeIdx];
  const base = size?.yieldAmount ?? 1;
  return roll.rare ? base + cfg.rareBonusYield : base;
}

// ── Signal: frequency matching (the flagship) ─────────────────────────────

/** The drifting target frequency, 0..1 across the dial. */
export function targetFrequencyAt(
  elapsedSeconds: number,
  phase: number,
  cfg: { driftSpeed: number; amplitude: number },
): number {
  const v = 0.5 + cfg.amplitude * Math.sin(cfg.driftSpeed * elapsedSeconds * Math.PI * 2 + phase);
  return Math.min(1, Math.max(0, v));
}

export function signalYield(cfg: AntennaConfig, lockRatio: number): number {
  const clamped = Math.min(1, Math.max(0, lockRatio));
  return cfg.yieldBase + Math.round(cfg.yieldLockBonus * clamped);
}

export function rollSignalRare(cfg: AntennaConfig, lockRatio: number, rng: Rng): boolean {
  return lockRatio >= cfg.rareLockRatio && rng() < cfg.rareChance;
}
