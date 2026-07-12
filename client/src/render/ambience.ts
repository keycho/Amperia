import Phaser from 'phaser';
import { mixPalette } from '@shared/palette';
import { STYLE } from './styleConfig';

/**
 * "Night market at night" (ART-DIRECTION v2.3 §3): NO global warm wash —
 * warmth comes from light sources only. Screen-space keeps just the dusk
 * vignette so the backdrop stays the darkest value in frame (§12A.5).
 */
export function addWarmAmbience(scene: Phaser.Scene): void {
  // Radial dusk vignette baked once from palette colors.
  if (!scene.textures.exists('tex-vignette')) {
    const size = 512;
    const canvas = scene.textures.createCanvas('tex-vignette', size, size);
    if (canvas !== null) {
      const ctx = canvas.getContext();
      const grad = ctx.createRadialGradient(
        size / 2,
        size / 2,
        size * 0.28,
        size / 2,
        size / 2,
        size * 0.72,
      );
      const plum = Phaser.Display.Color.IntegerToColor(mixPalette('duskSky', 'ink', 0.6));
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(
        1,
        `rgba(${plum.red},${plum.green},${plum.blue},${Math.min(1, 0.52 * STYLE.vignetteScale)})`,
      );
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvas.refresh();
    }
  }

  const vignette = scene.add.image(0, 0, 'tex-vignette');
  vignette.setScrollFactor(0);
  vignette.setDepth(12);

  const layout = () => {
    const w = scene.scale.width;
    const h = scene.scale.height;
    vignette.setPosition(w / 2, h / 2);
    vignette.setDisplaySize(w * 1.06, h * 1.12);
  };
  layout();
  scene.scale.on('resize', layout);
}
// R5: the distant cityscape backdrop was DELETED — AMPERIA is floating
// islands in the void, and the void IS the frame. Nothing renders behind
// the deck edges but darkness and the drifting embers.
