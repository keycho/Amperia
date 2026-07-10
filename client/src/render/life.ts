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

interface FlickerEntry {
  img: Phaser.GameObjects.Image;
  base: number;
  amp: number;
  p1: number;
  p2: number;
  phase: number;
}

const flickerPools = new WeakMap<Phaser.Scene, FlickerEntry[]>();

/**
 * Organic glow flicker: a slow wandering alpha wobble layered from two
 * incommensurate sine periods per light — visible life, never a strobe.
 * All lights in a scene share one 12 Hz driver.
 */
export function addFlicker(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image,
  baseAlpha: number,
  amplitude: number,
): void {
  let pool = flickerPools.get(scene);
  if (pool === undefined) {
    pool = [];
    flickerPools.set(scene, pool);
    const entries = pool;
    scene.time.addEvent({
      delay: 84,
      loop: true,
      callback: () => {
        const t = scene.time.now;
        for (const e of entries) {
          if (!e.img.active) continue;
          const wobble =
            Math.sin((t / e.p1) * Math.PI * 2 + e.phase) * 0.7 +
            Math.sin((t / e.p2) * Math.PI * 2 + e.phase * 1.7) * 0.3;
          e.img.setAlpha(Math.max(0.04, e.base + wobble * e.amp));
        }
      },
    });
  }
  pool.push({
    img,
    base: baseAlpha,
    amp: amplitude,
    p1: Phaser.Math.Between(2400, 3800),
    p2: Phaser.Math.Between(680, 1150),
    phase: Math.random() * Math.PI * 2,
  });
}
