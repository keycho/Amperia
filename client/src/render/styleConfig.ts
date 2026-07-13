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
}

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
      }
    : {
        mode: parsed.mode,
        groundInkMix: 0.5,
        spriteInkMix: 0.32,
        bloomBoost: 1.8,
        washScale: 0.28,
        vignetteScale: 1.35,
        pixelHeight: parsed.pixelHeight,
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
