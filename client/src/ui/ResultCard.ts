import Phaser from 'phaser';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { sound } from '../audio/sound';
import { kitClampLines, kitPlate, kitText } from './kit';

/**
 * F3 — THE RESULT CARD: the "you made a thing" moment. The item's icon
 * presented LARGE on a kit plate with an additive glow pulse, its name and
 * one flavor line, confetti motes off the icon (the Fortune-Coil prize
 * treatment, reused), a chime, then it gets out of the way. Pure
 * presentation — the server already granted the item; this only celebrates.
 */
export function showResultCard(
  scene: Phaser.Scene,
  opts: { thumbKey: string; kicker: string; title: string; flavor: string; big?: boolean },
): void {
  const W = 340;
  const H = 178;
  const cam = scene.cameras.main;
  const wrap = scene.add.container(
    Math.round((cam.width - W) / 2),
    Math.round(cam.height * 0.26),
  );
  wrap.setDepth(1350);
  wrap.add(kitPlate(scene, W, H, 12));

  const kicker = kitText(scene, W / 2, 18, opts.kicker, 'caption', {
    color: PALETTE.groundAccent,
    bold: true,
  }).setOrigin(0.5);
  wrap.add(kicker);

  // The icon, LARGE, with a soft additive halo breathing behind it.
  const halo = scene.add
    .image(W / 2, 78, 'fx-glow')
    .setTint(PALETTE_INT.neonAmber)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(0.5)
    .setAlpha(0.55);
  wrap.add(halo);
  const icon = scene.add.image(W / 2, 78, opts.thumbKey);
  icon.setDisplaySize(88, 88);
  wrap.add(icon);
  scene.tweens.add({
    targets: halo,
    scale: 0.62,
    alpha: 0.3,
    duration: 620,
    yoyo: true,
    repeat: 2,
    ease: 'sine.inOut',
  });

  const title = kitText(scene, W / 2, 132, opts.title, 'heading', {
    color: PALETTE.neonAmber,
    bold: true,
  }).setOrigin(0.5);
  title.setWordWrapWidth(W - 32);
  kitClampLines(title, 1);
  wrap.add(title);
  const flavor = kitText(scene, W / 2, 152, opts.flavor, 'caption', {
    color: UI_TEXT_WARM,
  }).setOrigin(0.5, 0);
  flavor.setWordWrapWidth(W - 40);
  flavor.setAlign('center');
  kitClampLines(flavor, 2);
  flavor.setAlpha(0.85);
  wrap.add(flavor);

  // Confetti motes off the icon — the Coil's celebration language.
  for (let i = 0; i < 12; i++) {
    const mote = scene.add.image(W / 2, 78, 'fx-spark');
    mote.setScale(0.1 + Math.random() * 0.08);
    mote.setTint(
      [PALETTE_INT.neonAmber, PALETTE_INT.neonTeal, PALETTE_INT.warmGlow][i % 3] as number,
    );
    mote.setBlendMode(Phaser.BlendModes.ADD);
    wrap.add(mote);
    const a = Math.random() * Math.PI * 2;
    const d = 42 + Math.random() * 60;
    scene.tweens.add({
      targets: mote,
      x: W / 2 + Math.cos(a) * d,
      y: 78 + Math.sin(a) * d - 16,
      alpha: 0,
      duration: 650 + Math.random() * 450,
      ease: 'quad.out',
      onComplete: () => mote.destroy(),
    });
  }

  if (opts.big === true) sound.rareChime();
  else sound.gatherChirp();

  wrap.setAlpha(0);
  wrap.setScale(0.88);
  scene.tweens.add({ targets: wrap, alpha: 1, scale: 1, duration: 240, ease: 'back.out' });
  scene.time.delayedCall(1650, () => {
    scene.tweens.add({
      targets: wrap,
      alpha: 0,
      y: wrap.y - 14,
      duration: 420,
      ease: 'quad.in',
      onComplete: () => wrap.destroy(),
    });
  });
}
