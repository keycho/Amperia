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

/** Contact shadow for walking entities (tight core, soft fringe). */
export function makeShadowTextures(scene: Phaser.Scene): void {
  const g = g2(scene);
  g.fillStyle(PALETTE_INT.ink, 0.22);
  g.fillEllipse(30, 15, 58, 28);
  g.fillStyle(PALETTE_INT.ink, 0.38);
  g.fillEllipse(28, 14, 40, 19);
  g.fillStyle(PALETTE_INT.ink, 0.45);
  g.fillEllipse(26, 13, 26, 12);
  g.generateTexture('fx-contact-shadow', 60, 30);
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
