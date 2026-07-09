import Phaser from 'phaser';
import { mixPalette, PALETTE_INT } from '@shared/palette';

/**
 * The golden-dusk ambience (ART-DIRECTION §3): a breathing warm wash over
 * the whole view plus gently darkened corners, all screen-space. Subtle by
 * design — the world should feel lamplit, never fogged.
 */
export function addWarmAmbience(scene: Phaser.Scene): void {
  const wash = scene.add.image(0, 0, 'fx-glow');
  wash.setScrollFactor(0);
  wash.setDepth(9000);
  wash.setTint(PALETTE_INT.warmGlow);
  wash.setBlendMode(Phaser.BlendModes.ADD);
  wash.setAlpha(0.055);

  const corner = scene.add.graphics();
  corner.setScrollFactor(0);
  corner.setDepth(9001);

  const layout = () => {
    const w = scene.scale.width;
    const h = scene.scale.height;
    wash.setPosition(w / 2, h / 2 - h * 0.08);
    wash.setDisplaySize(w * 1.6, h * 1.5);
    // Dusk pools in the corners (multiply-ish via low-alpha plum fills).
    corner.clear();
    corner.fillStyle(mixPalette('duskSky', 'ink', 0.5), 0.16);
    corner.fillTriangle(0, 0, w * 0.3, 0, 0, h * 0.3);
    corner.fillTriangle(w, 0, w - w * 0.3, 0, w, h * 0.3);
    corner.fillTriangle(0, h, w * 0.32, h, 0, h - h * 0.32);
    corner.fillTriangle(w, h, w - w * 0.32, h, w, h - h * 0.32);
  };
  layout();
  scene.scale.on('resize', layout);

  scene.tweens.add({
    targets: wash,
    alpha: { from: 0.04, to: 0.075 },
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
            g.fillStyle(PALETTE_INT.warmGlow, 0.7);
            g.fillRect(x + 6 + c * 14, row.base - bh + 8 + r * 22, 3.5, 5);
          }
        }
      }
      // The odd neon sign smear.
      if (rand() < 0.16) {
        g.fillStyle(rand() < 0.5 ? PALETTE_INT.neonAmber : PALETTE_INT.neonRose, 0.5);
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
    img.setAlpha(0.9);
  }
}
