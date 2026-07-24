import Phaser from 'phaser';
import { emberMid, PALETTE_INT } from '@shared/palette';
import { FILM_GRAIN_ALPHA } from './grit';
import { bloom, POOL_BANDS } from './styleConfig';

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
    // N4a PIXEL INTEGRITY: the pool falloff is QUANTIZED into discrete
    // bands with a checker-dithered edge between each — the smooth
    // 20-step gradient was soft-washing tile edges under it. Banded
    // falloff speaks the voxel language and ADDS crispness. Tunables:
    const BANDS = POOL_BANDS; // discrete alpha steps (styleConfig)
    const R = 64;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const CELL = 4; // dither cell in texture px (2 world px at 0.5 draw)
    for (let band = BANDS; band >= 1; band--) {
      const t = band / BANDS; // 1 at rim → 1/BANDS innermost ring
      const a = Math.pow(1 - t + 1 / BANDS, 1.6) * 0.13;
      const rOuter = R * t;
      const rInner = R * (t - 1 / BANDS);
      const rMid = (rOuter + rInner) / 2;
      // Solid inside the band's midline…
      g.fillStyle(0xffffff, a);
      g.fillCircle(R, R, rMid);
      // …checker dither between midline and the outer rim.
      for (let py = 0; py < R * 2; py += CELL) {
        for (let px = 0; px < R * 2; px += CELL) {
          if (((px + py) / CELL) % 2 !== 0) continue;
          const d = Math.hypot(px + CELL / 2 - R, py + CELL / 2 - R);
          if (d > rMid && d <= rOuter) g.fillRect(px, py, CELL, CELL);
        }
      }
    }
    g.generateTexture('fx-pool', R * 2, R * 2);
    g.destroy();
  }
  if (!scene.textures.exists('fx-lamp-brush')) {
    // U1: the darkness eraser — a STRONG banded disc (the voxel falloff
    // language at full alpha) that punches lamp pools out of the dark.
    const R = 64;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const BANDS = POOL_BANDS;
    for (let band = BANDS; band >= 1; band--) {
      const t = band / BANDS;
      const a2 = Math.min(1, 0.3 + (1 - t) * 0.9);
      g.fillStyle(0xffffff, a2);
      g.fillCircle(R, R, R * (t - 0.5 / BANDS));
      const CELL = 4;
      for (let py = 0; py < R * 2; py += CELL) {
        for (let px = 0; px < R * 2; px += CELL) {
          if (((px + py) / CELL) % 2 !== 0) continue;
          const d = Math.hypot(px + CELL / 2 - R, py + CELL / 2 - R);
          if (d > R * (t - 0.5 / BANDS) && d <= R * t) g.fillRect(px, py, CELL, CELL);
        }
      }
    }
    g.generateTexture('fx-lamp-brush', R * 2, R * 2);
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
    // v3 n2: rays ride the ember ramp's mid band — saturated, not pale.
    shaft.setTint(emberMid(PALETTE_INT.neonAmber));
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

/** Warm field around a dense light cluster. N4a: rides the BANDED pool
 *  texture, not the soft glow — a quantized field, never a blur wash. */
export function addHaze(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tint: number,
  scale: number,
): void {
  const haze = scene.add.image(x, y, 'fx-pool');
  haze.setTint(tint);
  haze.setBlendMode(Phaser.BlendModes.ADD);
  haze.setScale(scale, scale * 0.6);
  haze.setAlpha(bloom(0.3));
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
