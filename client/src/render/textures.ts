import Phaser from 'phaser';
import { mixPalette, PALETTE_INT } from '@shared/palette';

/**
 * Procedural palette placeholders, generated once at boot. Everything is
 * drawn at 2× and rendered at scale 0.5 so sprites stay crisp at zoom 2.
 */
export const TEX_SCALE = 0.5;

function g2(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}

/** The Great Dynamo — the humming heart of the city (placeholder rig). */
export function makeDynamoTexture(scene: Phaser.Scene): void {
  const W = 400;
  const H = 520;
  const g = g2(scene);
  const cx = W / 2;

  // Base plinth (two stacked slabs).
  g.fillStyle(mixPalette('structureMid', 'ink', 0.45));
  g.fillEllipse(cx, H - 40, 340, 130);
  g.fillStyle(mixPalette('structureMid', 'ink', 0.2));
  g.fillEllipse(cx, H - 60, 300, 110);

  // Main cylinder body with fake rounding (vertical bands, lit from left).
  const bodyTop = 120;
  const bodyBot = H - 70;
  const bands = [
    { x: cx - 110, w: 40, t: 0.55 },
    { x: cx - 70, w: 60, t: 0.3 },
    { x: cx - 10, w: 60, t: 0.12 },
    { x: cx + 50, w: 40, t: 0.35 },
    { x: cx + 90, w: 24, t: 0.6 },
  ];
  for (const b of bands) {
    g.fillStyle(mixPalette('structureMid', 'ink', b.t));
    g.fillRect(b.x, bodyTop, b.w, bodyBot - bodyTop);
  }
  // Warm rim light on the left edge.
  g.fillStyle(mixPalette('warmGlow', 'structureMid', 0.35), 0.9);
  g.fillRect(cx - 114, bodyTop + 6, 7, bodyBot - bodyTop - 12);

  // Coil rings (the amber life of the machine).
  for (const ry of [bodyTop + 70, bodyTop + 150, bodyTop + 230]) {
    g.fillStyle(mixPalette('neonAmber', 'ink', 0.35));
    g.fillEllipse(cx - 10, ry + 5, 232, 40);
    g.fillStyle(PALETTE_INT.neonAmber);
    g.fillEllipse(cx - 10, ry, 232, 36);
    g.fillStyle(PALETTE_INT.warmGlow);
    g.fillEllipse(cx - 10, ry - 4, 200, 20);
  }

  // Glow windows between coils.
  g.fillStyle(PALETTE_INT.warmGlow, 0.95);
  for (const wy of [bodyTop + 105, bodyTop + 185]) {
    g.fillRoundedRect(cx - 52, wy, 24, 30, 6);
    g.fillRoundedRect(cx + 8, wy, 24, 30, 6);
  }

  // Dome + beacon.
  g.fillStyle(mixPalette('structureMid', 'ink', 0.1));
  g.fillEllipse(cx - 10, bodyTop, 224, 80);
  g.fillStyle(mixPalette('structureMid', 'warmGlow', 0.25));
  g.fillEllipse(cx - 10, bodyTop - 8, 170, 54);
  g.fillStyle(PALETTE_INT.neonTeal);
  g.fillRect(cx - 14, bodyTop - 66, 8, 46);
  g.fillCircle(cx - 10, bodyTop - 70, 12);

  g.generateTexture('tex-dynamo', W, H);
  g.destroy();
}

/** Barrel planter with hanging greens — decor, never terrain. */
export function makePlanterTexture(scene: Phaser.Scene): void {
  const W = 72;
  const H = 96;
  const g = g2(scene);
  // Barrel pot.
  g.fillStyle(mixPalette('groundAccent', 'ink', 0.35));
  g.fillRect(14, 52, 44, 34);
  g.fillStyle(mixPalette('groundAccent', 'ink', 0.15));
  g.fillRect(18, 52, 28, 34);
  g.fillStyle(mixPalette('groundAccent', 'warmGlow', 0.3));
  g.fillEllipse(36, 52, 44, 16);
  // Leafy top (clustered blobs).
  const leaf = (x: number, y: number, r: number, t: number) => {
    g.fillStyle(mixPalette('solarGreen', 'ink', t));
    g.fillCircle(x, y, r);
  };
  leaf(24, 40, 14, 0.35);
  leaf(48, 38, 15, 0.25);
  leaf(36, 26, 16, 0.1);
  leaf(52, 24, 10, 0.05);
  leaf(20, 24, 9, 0.15);
  g.generateTexture('tex-planter', W, H);
  g.destroy();
}

/**
 * The Spark — chunky capsule scavenger-tinker with a warm rim-light and a
 * teal goggle band (drawn facing right; flipX for left).
 */
export function makeSparkTexture(scene: Phaser.Scene): void {
  const W = 64;
  const H = 96;
  const g = g2(scene);
  const cx = W / 2;

  // Ground shadow.
  g.fillStyle(PALETTE_INT.ink, 0.35);
  g.fillEllipse(cx, H - 8, 44, 14);

  // Silhouette outline (ink), then fills inset by 3px.
  g.fillStyle(PALETTE_INT.ink);
  g.fillRoundedRect(cx - 17, 26, 34, 58, 16);
  g.fillCircle(cx, 19, 15);

  // Body: warm patched jacket.
  g.fillStyle(mixPalette('groundAccent', 'warmGlow', 0.4));
  g.fillRoundedRect(cx - 14, 29, 28, 52, 13);
  // Lower half slightly darker (worn trousers).
  g.fillStyle(mixPalette('groundAccent', 'structureMid', 0.45));
  g.fillRoundedRect(cx - 14, 58, 28, 23, { tl: 4, tr: 4, bl: 13, br: 13 });
  // Tool-belt.
  g.fillStyle(mixPalette('structureMid', 'ink', 0.2));
  g.fillRect(cx - 14, 54, 28, 5);
  g.fillStyle(PALETTE_INT.neonAmber);
  g.fillRect(cx + 4, 54, 6, 5);

  // Head with goggle band.
  g.fillStyle(mixPalette('warmGlow', 'groundAccent', 0.25));
  g.fillCircle(cx, 19, 12);
  g.fillStyle(mixPalette('structureMid', 'ink', 0.1));
  g.fillRect(cx - 12, 12, 24, 7);
  g.fillStyle(PALETTE_INT.neonTeal);
  g.fillCircle(cx + 7, 15.5, 4.5);

  // Warm rim-light along the left edge.
  g.fillStyle(PALETTE_INT.warmGlow, 0.85);
  g.fillRoundedRect(cx - 16, 32, 4, 44, 2);
  g.fillCircle(cx - 9, 11, 3);

  g.generateTexture('tex-spark', W, H);
  g.destroy();
}

/** Junk heap gather node: a mound of scrap (full + picked-clean variants). */
export function makeJunkHeapTextures(scene: Phaser.Scene): void {
  const W = 104;
  const H = 84;
  const draw = (depleted: boolean, key: string) => {
    const g = g2(scene);
    const cx = W / 2;
    const base = H - 18;
    // Ground shadow.
    g.fillStyle(PALETTE_INT.ink, 0.3);
    g.fillEllipse(cx, base + 6, 88, 22);
    // Mound lumps (fewer/flatter when picked clean).
    const lumps: Array<[number, number, number, number]> = depleted
      ? [
          [cx - 20, base - 6, 22, 0.5],
          [cx + 14, base - 4, 18, 0.55],
          [cx - 2, base - 12, 16, 0.42],
        ]
      : [
          [cx - 24, base - 10, 26, 0.45],
          [cx + 20, base - 8, 24, 0.5],
          [cx - 4, base - 24, 26, 0.32],
          [cx + 8, base - 30, 16, 0.4],
          [cx - 26, base - 26, 13, 0.5],
        ];
    for (const [x, y, r, t] of lumps) {
      g.fillStyle(mixPalette('structureMid', 'ink', t + 0.12));
      g.fillCircle(x + 2, y + 3, r);
      g.fillStyle(mixPalette('structureMid', 'groundAccent', 0.55 - t));
      g.fillCircle(x, y, r);
    }
    if (!depleted) {
      // Poking scrap plates + a warm sign chip (readability accent).
      g.fillStyle(mixPalette('groundAccent', 'warmGlow', 0.35));
      g.fillRect(cx - 14, base - 44, 16, 10);
      g.fillStyle(mixPalette('groundAccent', 'structureMid', 0.3));
      g.fillRect(cx + 8, base - 20, 20, 8);
      g.fillStyle(PALETTE_INT.neonAmber);
      g.fillRect(cx + 18, base - 38, 9, 7);
      // A pipe stub.
      g.fillStyle(mixPalette('structureMid', 'ink', 0.05));
      g.fillRect(cx - 34, base - 20, 10, 16);
    }
    g.generateTexture(key, W, H);
    g.destroy();
  };
  draw(false, 'tex-junk-heap');
  draw(true, 'tex-junk-heap-depleted');
}

/** Inventory icons for M0 items (drawn, palette-only). */
export function makeItemIconTextures(scene: Phaser.Scene): void {
  const S = 56;
  // Salvage: a plate with a big bolt.
  let g = g2(scene);
  g.fillStyle(mixPalette('groundAccent', 'structureMid', 0.25));
  g.fillRoundedRect(8, 14, 34, 30, 6);
  g.fillStyle(mixPalette('groundAccent', 'warmGlow', 0.35));
  g.fillRoundedRect(12, 18, 26, 22, 4);
  g.fillStyle(mixPalette('structureMid', 'ink', 0.15));
  g.fillCircle(38, 38, 11);
  g.fillStyle(mixPalette('groundAccent', 'warmGlow', 0.5));
  g.fillCircle(38, 38, 7);
  g.fillStyle(mixPalette('structureMid', 'ink', 0.35));
  g.fillRect(35, 36.5, 6, 3);
  g.generateTexture('icon-salvage', S, S);
  g.destroy();
  // Gilded Scrap: the same plate, gone gold.
  g = g2(scene);
  g.fillStyle(mixPalette('neonAmber', 'ink', 0.35));
  g.fillRoundedRect(8, 14, 34, 30, 6);
  g.fillStyle(PALETTE_INT.neonAmber);
  g.fillRoundedRect(12, 18, 26, 22, 4);
  g.fillStyle(PALETTE_INT.warmGlow);
  g.fillCircle(38, 38, 10);
  g.fillStyle(PALETTE_INT.neonAmber);
  g.fillCircle(38, 38, 6);
  g.fillStyle(PALETTE_INT.warmGlow, 0.9);
  g.fillTriangle(16, 10, 20, 18, 12, 18);
  g.generateTexture('icon-gilded-scrap', S, S);
  g.destroy();
}

/** Antenna-shrine: a jury-rigged mast with a dish and a teal beacon. */
export function makeAntennaTexture(scene: Phaser.Scene): void {
  const W = 84;
  const H = 150;
  const g = g2(scene);
  const cx = W / 2;
  // Shadow + base plinth.
  g.fillStyle(PALETTE_INT.ink, 0.3);
  g.fillEllipse(cx, H - 10, 58, 16);
  g.fillStyle(mixPalette('structureMid', 'ink', 0.25));
  g.fillRect(cx - 16, H - 26, 32, 14);
  g.fillStyle(mixPalette('structureMid', 'groundAccent', 0.3));
  g.fillRect(cx - 12, H - 30, 24, 6);
  // Mast with cross-braces.
  g.fillStyle(mixPalette('structureMid', 'ink', 0.05));
  g.fillRect(cx - 3, 26, 6, H - 52);
  g.fillStyle(mixPalette('groundAccent', 'structureMid', 0.4));
  g.fillRect(cx - 11, 52, 22, 4);
  g.fillRect(cx - 9, 84, 18, 4);
  // Dish.
  g.fillStyle(mixPalette('groundAccent', 'warmGlow', 0.35));
  g.fillEllipse(cx + 13, 44, 26, 34);
  g.fillStyle(mixPalette('structureMid', 'ink', 0.15));
  g.fillEllipse(cx + 16, 44, 16, 24);
  // Wires.
  g.lineStyle(2, mixPalette('structureMid', 'ink', 0.3), 0.9);
  g.lineBetween(cx - 2, 30, cx - 26, H - 24);
  g.lineBetween(cx + 2, 30, cx + 28, H - 24);
  // Beacon (the interactable accent).
  g.fillStyle(PALETTE_INT.neonTeal);
  g.fillCircle(cx, 20, 7);
  g.fillStyle(PALETTE_INT.neonCyan, 0.65);
  g.fillCircle(cx, 20, 11);
  g.generateTexture('tex-antenna', W, H);
  g.destroy();
}

/** Koi shadow (soft dark ellipse) + a small splash ring. */
export function makeKoiTextures(scene: Phaser.Scene): void {
  let g = g2(scene);
  g.fillStyle(PALETTE_INT.ink, 0.5);
  g.fillEllipse(40, 22, 64, 28);
  g.fillStyle(PALETTE_INT.ink, 0.75);
  g.fillEllipse(40, 22, 44, 18);
  g.generateTexture('tex-koi-shadow', 80, 44);
  g.destroy();
  g = g2(scene);
  g.lineStyle(4, PALETTE_INT.neonCyan, 0.9);
  g.strokeEllipse(36, 20, 56, 26);
  g.generateTexture('tex-splash-ring', 72, 40);
  g.destroy();
}

/** Neon-teal diamond outline used for hover / click feedback. */
export function makeTileMarkerTextures(scene: Phaser.Scene): void {
  const W = 128;
  const H = 64;
  const g = g2(scene);
  g.lineStyle(5, PALETTE_INT.neonTeal, 1);
  g.beginPath();
  g.moveTo(W / 2, 3);
  g.lineTo(W - 3, H / 2);
  g.lineTo(W / 2, H - 3);
  g.lineTo(3, H / 2);
  g.closePath();
  g.strokePath();
  g.generateTexture('tex-tile-marker', W, H);
  g.clear();
  // Filled soft diamond for the click pulse.
  g.fillStyle(PALETTE_INT.neonTeal, 0.55);
  g.beginPath();
  g.moveTo(W / 2, 6);
  g.lineTo(W - 6, H / 2);
  g.lineTo(W / 2, H - 6);
  g.lineTo(6, H / 2);
  g.closePath();
  g.fillPath();
  g.generateTexture('tex-tile-pulse', W, H);
  g.destroy();
}
