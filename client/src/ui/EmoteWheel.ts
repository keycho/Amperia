import Phaser from 'phaser';
import { EMOTE_IDS, type EmoteId } from '@shared/protocol';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { kitText, UIK } from './kit';

/** Ring radius the four glyphs sit on. */
const RADIUS = 74;
/** Pointer must leave this dead-zone before anything highlights. */
const DEAD = 26;

/** Clock positions: wave up, cheer right, sit down, point left. */
const ANGLE: Record<EmoteId, number> = {
  wave: -Math.PI / 2,
  cheer: 0,
  sit: Math.PI / 2,
  point: Math.PI,
};

const LABEL: Record<EmoteId, string> = {
  wave: '/wave',
  cheer: '/cheer',
  sit: '/sit',
  point: '/point',
};

/**
 * The hold-E emote wheel (U4b): four pixel glyphs on a ring. Hold E, drift
 * the pointer toward one, release to play it — or just click a glyph.
 * Selection is resolved by pointer angle so it works at any drift speed.
 */
export class EmoteWheel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly icons = new Map<EmoteId, Phaser.GameObjects.Image>();
  private readonly onPick: (emote: EmoteId) => void;
  private selected: EmoteId | null = null;
  visible = false;

  constructor(scene: Phaser.Scene, onPick: (emote: EmoteId) => void) {
    this.scene = scene;
    this.onPick = onPick;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1250);
    this.container.setVisible(false);

    // PP1: kit-plate chrome (round hub — the kit has no circular plate, so we
    // match its ink fill + border here).
    const shade = scene.add.graphics();
    shade.fillStyle(UIK.shadow, 0.3);
    shade.fillCircle(1, 3, RADIUS + 44);
    shade.fillStyle(UIK.plate, 0.72);
    shade.fillCircle(0, 0, RADIUS + 44);
    shade.lineStyle(1, UIK.border, 0.95);
    shade.strokeCircle(0, 0, RADIUS + 44);
    this.ring = scene.add.graphics();
    this.container.add([shade, this.ring]);

    for (const id of EMOTE_IDS) {
      const x = Math.cos(ANGLE[id]) * RADIUS;
      const y = Math.sin(ANGLE[id]) * RADIUS;
      const icon = scene.add.image(x, y, `emote-${id}`);
      icon.setScale(2); // 16px glyph → 32px, integer for crisp texels
      icon.setInteractive({ useHandCursor: true });
      icon.on('pointerdown', () => {
        this.onPick(id);
        this.close();
      });
      const label = kitText(scene, x, y + 26, LABEL[id], 'caption', { color: UI_TEXT_WARM });
      label.setOrigin(0.5, 0);
      this.container.add([icon, label]);
      this.icons.set(id, icon);
    }
    const hint = kitText(this.scene, 0, RADIUS + 52, 'release E on a glyph · Esc closes', 'caption', {
      color: PALETTE.groundAccent,
    });
    hint.setOrigin(0.5, 0);
    this.container.add(hint);

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.visible) this.highlightFrom(p);
    });
  }

  open(): void {
    if (this.visible) return;
    this.visible = true;
    this.selected = null;
    this.container.setPosition(
      Math.round(this.scene.scale.width / 2),
      Math.round(this.scene.scale.height / 2) - 30,
    );
    this.container.setVisible(true);
    this.drawHighlight();
  }

  /** Release of E: play whatever the pointer chose (nothing = just close). */
  release(): void {
    if (!this.visible) return;
    const pick = this.selected;
    this.close();
    if (pick !== null) this.onPick(pick);
  }

  close(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.selected = null;
  }

  private highlightFrom(p: Phaser.Input.Pointer): void {
    const dx = p.x - this.container.x;
    const dy = p.y - this.container.y;
    if (Math.hypot(dx, dy) < DEAD) {
      if (this.selected !== null) {
        this.selected = null;
        this.drawHighlight();
      }
      return;
    }
    const ang = Math.atan2(dy, dx);
    let best: EmoteId = 'wave';
    let bestDelta = Infinity;
    for (const id of EMOTE_IDS) {
      const delta = Math.abs(Phaser.Math.Angle.Wrap(ang - ANGLE[id]));
      if (delta < bestDelta) {
        bestDelta = delta;
        best = id;
      }
    }
    if (best !== this.selected) {
      this.selected = best;
      this.drawHighlight();
    }
  }

  private drawHighlight(): void {
    this.ring.clear();
    for (const [id, icon] of this.icons) {
      const on = id === this.selected;
      icon.setScale(on ? 3 : 2);
      if (on) {
        this.ring.lineStyle(2, PALETTE_INT.neonAmber, 0.95);
        this.ring.strokeCircle(icon.x, icon.y, 31);
      }
    }
  }
}
