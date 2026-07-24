import Phaser from 'phaser';
import { PALETTE_INT } from '@shared/palette';
import { FILM_GRAIN_ALPHA } from './grit';
import { bloom } from './styleConfig';

/**
 * Atmosphere & light theatre (R5): god-rays, lamp cones, warm haze,
 * film grain, and the misbehaving-sign animator. Everything additive is
 * hue-tinted (glow-language discipline: never white-out).
 */

/** Bake the shaft + grain textures once (BootScene). */
export function makeAtmosphereTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('fx-shaft')) {
    // A soft vertical wedge: stacked shrinking rows fake the gradient.
    const W = 120;
    const H = 260;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    for (let y = 0; y < H; y += 2) {
      const t = y / H;
      const half = (W / 2) * (0.22 + t * 0.78);
      g.fillStyle(0xffffff, 0.30 * (1 - t));
      g.fillRect(W / 2 - half, y, half * 2, 2);
    }
    g.generateTexture('fx-shaft', W, H);
    g.destroy();
  }
  if (!scene.textures.exists('fx-pool')) {
    // CLARITY: the ground light pool — a much steeper falloff than the
    // soft fx-glow so pool EDGES read and texels inside stay countable.
    const R = 64;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 20; i >= 1; i--) {
      const t = i / 20; // 1 at rim → 0 at center
      const a = Math.pow(1 - t, 1.8) * 0.12;
      if (a <= 0) continue;
      g.fillStyle(0xffffff, a);
      g.fillCircle(R, R, R * t);
    }
    g.generateTexture('fx-pool', R * 2, R * 2);
    g.destroy();
  }
  if (!scene.textures.exists('fx-grain')) {
    const S = 192;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    // Deterministic scatter of 1px light/dark specks.
    let seed = 40921;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 2600; i++) {
      const x = Math.floor(rand() * S);
      const y = Math.floor(rand() * S);
      g.fillStyle(rand() < 0.5 ? 0x000000 : 0xffffff, 0.5 + rand() * 0.5);
      g.fillRect(x, y, 1, 1);
    }
    g.generateTexture('fx-grain', S, S);
    g.destroy();
  }
}

/** Soft radial god-rays fanning from a point (the Dynamo's crown). */
export function addGodRays(
  scene: Phaser.Scene,
  x: number,
  y: number,
  depth: number,
): void {
  const angles = [-0.55, -0.2, 0.18, 0.5];
  angles.forEach((a, i) => {
    const shaft = scene.add.image(x, y, 'fx-shaft');
    shaft.setOrigin(0.5, 0.04);
    shaft.setRotation(a);
    shaft.setTint(PALETTE_INT.neonAmber);
    shaft.setBlendMode(Phaser.BlendModes.ADD);
    // v3 GOLDEN DARK: hotter, taller — the crown's rays carry the apex's
    // doubled emissive out over the plaza.
    shaft.setAlpha(bloom(0.16));
    shaft.setScale(0.8 + (i % 2) * 0.35, 1.8);
    shaft.setDepth(depth);
    // Slow sway + breathe — theatre, not strobe.
    scene.tweens.add({
      targets: shaft,
      rotation: a + 0.09,
      alpha: bloom(0.24),
      duration: 5200 + i * 900,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inout',
    });
  });
}

/** A faint hue-tinted light cone under a lamp head. */
export function addLampCone(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tint: number,
  depth: number,
): void {
  const cone = scene.add.image(x, y, 'fx-shaft');
  cone.setOrigin(0.5, 0.04);
  cone.setTint(tint);
  cone.setBlendMode(Phaser.BlendModes.ADD);
  cone.setAlpha(bloom(0.10));
  cone.setScale(0.42, 0.34);
  cone.setDepth(depth);
}

/** Big soft warm haze around a dense light cluster. */
export function addHaze(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tint: number,
  scale: number,
): void {
  const haze = scene.add.image(x, y, 'fx-glow');
  haze.setTint(tint);
  haze.setBlendMode(Phaser.BlendModes.ADD);
  haze.setScale(scale, scale * 0.6);
  haze.setAlpha(bloom(0.06));
  haze.setDepth(1e5 + 2);
}

/** Screen-fixed film grain/dither — kills banding, adds tooth (alpha in
 *  grit.ts — strengthened a step by the grit pass, still subtle). */
export function addFilmGrain(scene: Phaser.Scene): void {
  const grain = scene.add.tileSprite(0, 0, scene.scale.width, scene.scale.height, 'fx-grain');
  grain.setOrigin(0, 0);
  grain.setScrollFactor(0);
  grain.setAlpha(FILM_GRAIN_ALPHA);
  grain.setDepth(9e5);
  const layout = () => grain.setSize(scene.scale.width, scene.scale.height);
  scene.scale.on('resize', layout);
  scene.time.addEvent({
    delay: 110,
    loop: true,
    callback: () => {
      grain.tilePositionX = Math.floor(Math.random() * 192);
      grain.tilePositionY = Math.floor(Math.random() * 192);
    },
  });
}

/**
 * The one sign that flickers BADLY (R5d — character): irregular drops,
 * stutters back, holds, drops again. Deterministic-ish rhythm, never a
 * strobe loop.
 */
export function addBadFlicker(scene: Phaser.Scene, img: Phaser.GameObjects.Image, base: number): void {
  let step = 0;
  const pattern: Array<[number, number]> = [
    [1, 2200],
    [0.15, 90],
    [1, 140],
    [0.1, 70],
    [0.9, 1600],
    [0.2, 120],
    [1, 3400],
    [0.12, 60],
    [0.75, 260],
    [1, 2800],
  ];
  const tick = () => {
    if (!img.active) return;
    const [level, hold] = pattern[step % pattern.length] as [number, number];
    img.setAlpha(base * level);
    step += 1;
    scene.time.delayedCall(hold, tick);
  };
  tick();
}

/** A sign that lazily cycles between two hues (R5d). */
export function addHueCycle(
  scene: Phaser.Scene,
  img: Phaser.GameObjects.Image,
  a: number,
  b: number,
): void {
  const mix = { t: 0 };
  const lerp = (ca: number, cb: number, t: number) => {
    const m = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t);
    return (
      (m((ca >> 16) & 0xff, (cb >> 16) & 0xff) << 16) |
      (m((ca >> 8) & 0xff, (cb >> 8) & 0xff) << 8) |
      m(ca & 0xff, cb & 0xff)
    );
  };
  scene.tweens.add({
    targets: mix,
    t: 1,
    duration: 2600,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inout',
    onUpdate: () => img.setTint(lerp(a, b, mix.t)),
  });
}
