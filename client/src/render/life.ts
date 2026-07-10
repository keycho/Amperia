import Phaser from 'phaser';
import { mixPalette } from '@shared/palette';

/**
 * Small ambient-motion helpers — the city breathing. Everything here is
 * decorative client-side motion only; nothing affects gameplay state.
 */

/**
 * A gentle steam vent: soft puffs rising from a point (stall kettles,
 * rooftop pipes). Spawns one short-lived puff on a jittered timer.
 */
export function addSteamVent(
  scene: Phaser.Scene,
  x: number,
  y: number,
  depth: number,
  opts: { periodMs?: number; drift?: number } = {},
): void {
  const periodMs = opts.periodMs ?? 1300;
  const drift = opts.drift ?? 8;
  const tint = mixPalette('warmGlow', 'duskSky', 0.35);
  const spawnPuff = (): void => {
    const puff = scene.add.image(x + Phaser.Math.Between(-4, 4), y, 'fx-glow');
    puff.setTint(tint);
    puff.setBlendMode(Phaser.BlendModes.SCREEN);
    puff.setAlpha(0);
    puff.setScale(0.045);
    puff.setDepth(depth);
    scene.tweens.add({
      targets: puff,
      y: y - 26 - Phaser.Math.Between(0, 8),
      x: puff.x + Phaser.Math.Between(-drift, drift),
      scale: 0.13,
      alpha: { from: 0.26, to: 0 },
      duration: 1500,
      ease: 'sine.out',
      onComplete: () => puff.destroy(),
    });
  };
  scene.time.addEvent({
    delay: periodMs,
    startAt: Phaser.Math.Between(0, periodMs),
    loop: true,
    callback: () => {
      // Slight cadence wobble so vents never sync up.
      if (Math.random() < 0.85) spawnPuff();
    },
  });
}
