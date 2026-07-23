import { mixPalette } from '@shared/palette';

/**
 * Style checkpoint configs (owner review). Toggle with ?style=a|b|c480|c360:
 *
 *  A — CURRENT+  : the emergency pass as it stands.
 *  B — CONTRAST  : base world darkened toward deep plum/ink, hotter emissive
 *                  bloom, dark ground BETWEEN light pools; sky stays warm.
 *  C — CONTRAST+PIXEL : B rendered at a low internal resolution with
 *                  nearest-neighbour upscale (retro voxel night-market).
 *
 * Nothing is deleted by the toggle — every value routes through here.
 */
export type StyleMode = 'A' | 'B' | 'C';

export interface StyleConfig {
  mode: StyleMode;
  /** Mix of the floor fill toward ink (0 = untouched). */
  groundInkMix: number;
  /** Extra ink mixed into world sprite tints (0 = untouched). */
  spriteInkMix: number;
  /** Multiplier on every emissive glow alpha. */
  bloomBoost: number;
  /** Multiplier on the global warm wash alpha. */
  washScale: number;
  /** Multiplier on the vignette strength. */
  vignetteScale: number;
  /** Internal render height for pixel mode (null = native). */
  pixelHeight: number | null;
  /** G1 contact shadows — every strength routes through here. */
  shadows: {
    /** Placed voxel-shadow image alpha (props, mobs, nodes, structures). */
    alpha: number;
    /** Extra alpha lerped in by sprite width (big props ground harder). */
    wideBonus: number;
    wideAtPx: number;
    /** In-bake pass alphas: soft fringe / core / contact-AO ring. */
    fringe: number;
    core: number;
    contact: number;
    /** The walking-entity ellipse passes (fx-contact-shadow, out→in). */
    entity: [number, number, number];
  };
}

/**
 * G4 — the darkness gradient: away from real light sources the ground and
 * props drop noticeably darker (never pure black), through QUANTIZED bands
 * with a checker-dither transition instead of a smooth ramp — the pixel
 * grammar's idea of falloff. One set for all modes, like shadows.
 */
export const DARKNESS = {
  /** Ink alpha over the floor at full distance (floor minimum guard). */
  maxAlpha: 0.32,
  /** Inside this tile radius of a light: untouched — the pool. */
  poolRadius: 2.5,
  /** Beyond this: full darkness band. */
  farRadius: 7.5,
  /** Number of quantized bands between pool and far. */
  bands: 3,
  /** How far props dim at full distance (0..1 mix toward dusk-dark). */
  propDim: 0.28,
} as const;

/** G1: shadows are grounding, not a style toggle — one set for all modes. */
const SHADOWS: StyleConfig['shadows'] = {
  alpha: 0.8,
  wideBonus: 0.12,
  wideAtPx: 220,
  fringe: 0.22,
  core: 0.52,
  contact: 0.66,
  entity: [0.28, 0.46, 0.56],
};

function parseMode(): { mode: StyleMode; pixelHeight: number | null } {
  const raw = new URLSearchParams(window.location.search).get('style')?.toLowerCase() ?? 'a';
  if (raw === 'b') return { mode: 'B', pixelHeight: null };
  if (raw === 'c' || raw === 'c480') return { mode: 'C', pixelHeight: 480 };
  if (raw === 'c360') return { mode: 'C', pixelHeight: 360 };
  return { mode: 'A', pixelHeight: null };
}

const parsed = parseMode();

export const STYLE: StyleConfig =
  parsed.mode === 'A'
    ? {
        mode: 'A',
        groundInkMix: 0,
        spriteInkMix: 0,
        bloomBoost: 1,
        washScale: 1,
        vignetteScale: 1,
        pixelHeight: null,
        shadows: SHADOWS,
      }
    : {
        mode: parsed.mode,
        groundInkMix: 0.5,
        spriteInkMix: 0.32,
        bloomBoost: 1.8,
        washScale: 0.28,
        vignetteScale: 1.35,
        pixelHeight: parsed.pixelHeight,
        shadows: SHADOWS,
      };

/** Grade a floor/graphics fill color through the style. */
export function gradeGround(color: number): number {
  if (STYLE.groundInkMix <= 0) return color;
  return mixInt(color, mixPalette('duskSky', 'ink', 0.55), STYLE.groundInkMix);
}

/** Neutral world-sprite tint for otherwise-untinted sprites. */
export function worldSpriteTint(): number | null {
  if (STYLE.spriteInkMix <= 0) return null;
  // Multiply toward warm plum: darkens while keeping the dusk warm.
  return mixInt(0xffffff, mixPalette('warmGlow', 'duskSky', 0.45), STYLE.spriteInkMix * 1.4);
}

/**
 * BLOOM TUNE (de-stack): since PP3 the post pipeline owns the SOFT HALO, so
 * the in-scene additive sprites are only the tight core glow — every emissive
 * alpha runs at half strength. Never two full-strength glow systems on the
 * same emitter: that stacked to featureless white blobs on the Dynamo and
 * washed the string lights white.
 */
const DESTACK = 0.5;

/** Emissive alpha through the bloom boost (clamped). */
export function bloom(alpha: number): number {
  return Math.min(1, alpha * DESTACK * STYLE.bloomBoost);
}

/** Plain integer color mix (styling only — palette blends stay in palette.ts). */
function mixInt(a: number, b: number, t: number): number {
  const clamp = Math.max(0, Math.min(1, t));
  const mix = (sa: number, sb: number) => Math.round(sa + (sb - sa) * clamp);
  const r = mix((a >> 16) & 0xff, (b >> 16) & 0xff);
  const g = mix((a >> 8) & 0xff, (b >> 8) & 0xff);
  const bl = mix(a & 0xff, b & 0xff);
  return (r << 16) | (g << 8) | bl;
}
