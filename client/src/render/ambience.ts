import Phaser from 'phaser';
import { mixPalette, PALETTE_INT } from '@shared/palette';
import { STYLE } from './styleConfig';

/**
 * The golden-dusk ambience (ART-DIRECTION §3): a breathing warm wash over
 * the whole view plus gently darkened corners, all screen-space. Subtle by
 * design — the world should feel lamplit, never fogged.
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
        `rgba(${plum.red},${plum.green},${plum.blue},${Math.min(1, 0.42 * STYLE.vignetteScale)})`,
      );
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvas.refresh();
    }
  }

  // The golden wash: one broad breathing glow + a lamplight pool low-center.
  const wash = scene.add.image(0, 0, 'fx-glow');
  wash.setScrollFactor(0);
  wash.setDepth(10);
  wash.setTint(PALETTE_INT.warmGlow);
  wash.setBlendMode(Phaser.BlendModes.ADD);

  const pool = scene.add.image(0, 0, 'fx-glow');
  pool.setScrollFactor(0);
  pool.setDepth(10);
  pool.setTint(mixPalette('warmGlow', 'neonAmber', 0.4));
  pool.setBlendMode(Phaser.BlendModes.ADD);
  pool.setAlpha(0.05 * STYLE.washScale);

  const vignette = scene.add.image(0, 0, 'tex-vignette');
  vignette.setScrollFactor(0);
  vignette.setDepth(12);

  const layout = () => {
    const w = scene.scale.width;
    const h = scene.scale.height;
    wash.setPosition(w / 2, h * 0.42);
    wash.setDisplaySize(w * 1.7, h * 1.6);
    pool.setPosition(w / 2, h * 0.72);
    pool.setDisplaySize(w * 1.2, h * 0.9);
    vignette.setPosition(w / 2, h / 2);
    vignette.setDisplaySize(w * 1.06, h * 1.12);
  };
  layout();
  scene.scale.on('resize', layout);

  scene.tweens.add({
    targets: wash,
    alpha: { from: 0.07 * STYLE.washScale, to: 0.115 * STYLE.washScale },
    duration: 3600,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inout',
  });
}

/**
 * Distant stacked-city parallax backdrop (ART-DIRECTION §5): habitat blocks
 * and sign towers in cool dim tones with warm window dots, scrolling slower
 * than the world so the Filament feels nested inside a bigger Amperia.
 */
export function makeSkylineTexture(scene: Phaser.Scene): void {
  const W = 1024;
  const H = 300;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Two silhouette rows: far (duskier) and near (structureMid).
  const rows = [
    { base: H, tone: mixPalette('duskSky', 'structureMid', 0.35), hMin: 70, hMax: 150, w: 60 },
    { base: H, tone: mixPalette('structureMid', 'ink', 0.25), hMin: 40, hMax: 110, w: 44 },
  ];
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const row of rows) {
    let x = 0;
    while (x < W) {
      const bw = row.w * (0.7 + rand() * 0.9);
      const bh = row.hMin + rand() * (row.hMax - row.hMin);
      g.fillStyle(row.tone);
      g.fillRect(x, row.base - bh, bw, bh);
      // Antenna or water tank now and then.
      if (rand() < 0.3) {
        g.fillRect(x + bw / 2 - 2, row.base - bh - 16, 4, 16);
      }
      // Warm window dots.
      const cols = Math.max(1, Math.floor(bw / 14));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < Math.floor(bh / 22); r++) {
          if (rand() < 0.24) {
            g.fillStyle(PALETTE_INT.warmGlow, 0.45);
            g.fillRect(x + 6 + c * 14, row.base - bh + 8 + r * 22, 3.5, 5);
          }
        }
      }
      // The odd neon sign smear.
      if (rand() < 0.16) {
        g.fillStyle(rand() < 0.5 ? PALETTE_INT.neonAmber : PALETTE_INT.neonRose, 0.35);
        g.fillRect(x + bw * 0.2, row.base - bh + 4, 5, 18);
      }
      x += bw + 6 + rand() * 18;
    }
  }
  g.generateTexture('tex-skyline', W, H);
  g.destroy();
}

export function addSkyline(scene: Phaser.Scene, mapTopY: number): void {
  // Tile the skyline behind the map's north edge, on a slow scroll factor.
  for (let i = -2; i <= 2; i++) {
    const img = scene.add.image(i * 1000, mapTopY - 40, 'tex-skyline');
    img.setOrigin(0.5, 1);
    img.setScrollFactor(0.35, 0.5);
    img.setDepth(-1e6);
    img.setAlpha(0.7);
  }
}
