import Phaser from 'phaser';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';

/** Rising loot text ("+2 Salvage"), warm by default. */
export function floatText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string = UI_TEXT_WARM,
): void {
  const t = scene.add.text(x, y, text, {
    fontFamily: 'monospace',
    fontSize: '15px',
    color,
    stroke: PALETTE.ink,
    strokeThickness: 3,
  });
  t.setOrigin(0.5, 1);
  t.setDepth(1e9);
  scene.tweens.add({
    targets: t,
    y: y - 42,
    alpha: { from: 1, to: 0 },
    duration: 1100,
    ease: 'quad.out',
    onComplete: () => t.destroy(),
  });
}
