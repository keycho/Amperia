import Phaser from 'phaser';
import { UI_TEXT_WARM } from '@shared/palette';
import { kitText, SPACE, UIK } from './kit';

/**
 * PP2 — a pixel speech bubble anchored above a world speaker, its tail pointing
 * down at them. Kit ink plate + 1px border, word-wrapped, NEAREST-crisp (the
 * pixelArt sampler keeps the text and the vector plate hard-edged), rises in,
 * holds ~4s, then fades. Cheapest "the city is alive" multiplier we have.
 */

const WRAP = 184;
const HOLD_MS = 4000;

export function showSpeechBubble(
  scene: Phaser.Scene,
  x: number,
  /** The speaker's head world-Y — the tail tip points here. */
  y: number,
  text: string,
  depth: number,
  /** F4: fires when the bubble is gone (fade end or early destroy) — the
   *  world-anchor stack rule un-suppresses the speaker's label off this. */
  onClose?: () => void,
): Phaser.GameObjects.Container {
  const pad = SPACE.sm;
  const t = kitText(scene, 0, 0, text, 'body', { color: UI_TEXT_WARM });
  t.setWordWrapWidth(WRAP);
  const tw = Math.min(WRAP, Math.ceil(t.width));
  const th = Math.ceil(t.height);
  const w = tw + pad * 2;
  const h = th + pad * 2;
  const tail = 8;
  const top = -(h + tail); // plate top, relative to the (0,0) tail tip

  const c = scene.add.container(x, y);
  c.setDepth(depth);
  const g = scene.add.graphics();
  // Drop shadow.
  g.fillStyle(UIK.shadow, 0.3);
  g.fillRoundedRect(-w / 2 + 1, top + 2, w, h, 8);
  // Plate + tail fill (the tail overlaps the plate's bottom edge to seal it).
  g.fillStyle(UIK.plate, 0.95);
  g.fillRoundedRect(-w / 2, top, w, h, 8);
  g.fillTriangle(-tail, -tail - 1, tail, -tail - 1, 0, 0);
  // Border: the rounded plate, then the two slanted tail sides only.
  g.lineStyle(1, UIK.border, 1);
  g.strokeRoundedRect(-w / 2, top, w, h, 8);
  g.beginPath();
  g.moveTo(-tail, -tail);
  g.lineTo(0, 0);
  g.lineTo(tail, -tail);
  g.strokePath();
  t.setPosition(-tw / 2, top + pad);
  c.add([g, t]);
  // F4 audit: the bubble's opaque plate, in local space (origin = tail tip).
  c.setData('kitClipRect', { ox: -w / 2, oy: top, w, h });

  // Rise in, hold, fade out.
  c.setAlpha(0);
  c.y = y + 6;
  if (onClose !== undefined) c.once(Phaser.GameObjects.Events.DESTROY, onClose);
  scene.tweens.add({ targets: c, alpha: 1, y, duration: 220, ease: 'quad.out' });
  scene.time.delayedCall(HOLD_MS, () => {
    if (!c.active) return;
    scene.tweens.add({
      targets: c,
      alpha: 0,
      y: y - 8,
      duration: 400,
      ease: 'quad.in',
      onComplete: () => c.destroy(),
    });
  });
  return c;
}
