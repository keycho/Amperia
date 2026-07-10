import Phaser from 'phaser';
import { bloom } from './styleConfig';

/**
 * The glow language (render-overhaul addendum b): every light source is a
 * HOT EMISSIVE CORE plus layered additive bloom in the light's OWN hue —
 * never a white-out. The Dynamo is the biggest, softest instance of the
 * same three-layer recipe; a string-light bulb is the smallest.
 */

/**
 * Lean a hue toward white for the hot core — CAPPED at 32% so the hue
 * always reads (never white-out).
 */
function toWhite(tint: number, t: number): number {
  const k = Math.max(0, Math.min(0.32, t));
  const mix = (v: number) => Math.round(v + (255 - v) * k);
  const r = mix((tint >> 16) & 0xff);
  const g = mix((tint >> 8) & 0xff);
  const b = mix(tint & 0xff);
  return (r << 16) | (g << 8) | b;
}

export interface LayeredGlow {
  core: Phaser.GameObjects.Image;
  mid: Phaser.GameObjects.Image;
  outer: Phaser.GameObjects.Image;
  setPosition(x: number, y: number): void;
  destroy(): void;
}

/**
 * Three additive layers on one point: tight hot core (hue leaned slightly
 * white), body bloom at the hue, and a wide soft skirt. `scale` sizes the
 * MID layer; core/outer derive. `intensity` scales every alpha together.
 */
export function addLayeredGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tint: number,
  scale: number,
  depth: number,
  intensity = 1,
): LayeredGlow {
  const mk = (s: number, a: number, t: number): Phaser.GameObjects.Image => {
    const img = scene.add.image(x, y, 'fx-glow');
    img.setTint(t);
    img.setBlendMode(Phaser.BlendModes.ADD);
    img.setScale(s);
    img.setAlpha(bloom(a * intensity));
    img.setDepth(depth);
    return img;
  };
  const outer = mk(scale * 2.4, 0.14, tint);
  const mid = mk(scale, 0.5, tint);
  const core = mk(scale * 0.42, 0.95, toWhite(tint, 0.26));
  return {
    core,
    mid,
    outer,
    setPosition(nx: number, ny: number) {
      core.setPosition(nx, ny);
      mid.setPosition(nx, ny);
      outer.setPosition(nx, ny);
    },
    destroy() {
      core.destroy();
      mid.destroy();
      outer.destroy();
    },
  };
}
