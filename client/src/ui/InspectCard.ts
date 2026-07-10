import Phaser from 'phaser';
import { COSMETICS, decodeEquipped } from '@shared/cosmetics';
import { mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { InspectInfoEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session } from '../net/session';
import { bakeSparkAppearance, equipKey } from '../render/sparkModel';
import { voxelSprite } from '../render/voxel';

const W = 264;
const H = 404;

/**
 * The inspect card (I5): click a Spark, meet a person — name, crew line,
 * Mastery highlights, and what they're wearing. Presentation-safe facts
 * only (the server never sends inventories or Bolts here). The card is
 * also where trades start: looks lead to deals.
 */
export class InspectCard {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly portrait: Phaser.GameObjects.Image;
  private lines: Phaser.GameObjects.Text[] = [];
  private targetSessionId: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1200);
    this.container.setVisible(false);

    const chrome = scene.add.nineslice(0, 0, 'ui-panel-screws', undefined, W, H, 16, 16, 16, 16);
    chrome.setOrigin(0, 0);
    chrome.setTint(mixPalette('duskSky', 'structureMid', 0.55));
    chrome.setAlpha(0.97);
    this.container.add(chrome);

    // A lit dais for the portrait.
    const g = scene.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.55);
    g.fillRoundedRect(14, 34, W - 28, 132, 9);
    g.fillStyle(PALETTE_INT.warmGlow, 0.08);
    g.fillEllipse(W / 2, 152, 150, 30);
    g.lineStyle(1, PALETTE_INT.neonAmber, 0.35);
    g.strokeEllipse(W / 2, 152, 120, 22);
    this.container.add(g);

    this.portrait = scene.add.image(W / 2, 150, '__DEFAULT');
    this.portrait.setOrigin(0.5, 1);
    this.container.add(this.portrait);

    const close = scene.add.text(W - 34, 10, '[x]', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: UI_TEXT_WARM,
    });
    close.setInteractive({ useHandCursor: true });
    close.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.hide();
    });
    this.container.add(close);
  }

  /** Populate from a fresh server answer and slide in on the right. */
  show(ev: InspectInfoEvent): void {
    this.targetSessionId = ev.sessionId;
    for (const t of this.lines) t.destroy();
    this.lines = [];

    // Portrait: the target's REAL baked sprite (their look, their gear).
    bakeSparkAppearance(this.scene, ev.appearance, { equipped: ev.equipped });
    const eq = decodeEquipped(ev.equipped);
    const baked = voxelSprite(`spark@${ev.appearance}#${equipKey(eq)}-sw`);
    this.portrait.setTexture(baked.key);
    this.portrait.setScale(0.9);

    const add = (x: number, y: number, text: string, color: string, size = 12) => {
      const t = this.scene.add.text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: `${size}px`,
        color,
      });
      this.container.add(t);
      this.lines.push(t);
      return t;
    };

    const glow = eq.nameGlow !== undefined;
    const name = add(14, 10, ev.sparkName, glow ? PALETTE.neonAmber : UI_TEXT_WARM, 15);
    if (glow) name.setShadow(0, 0, PALETTE.warmGlow, 6, true, true);
    add(14, 172, ev.crew ?? 'No crew — yet.', ev.crew !== null ? PALETTE.neonTeal : PALETTE.groundAccent, 11);

    let y = 194;
    add(14, y, 'MASTERY', PALETTE.neonAmber, 11);
    y += 17;
    if (ev.topSkills.length === 0) {
      add(20, y, 'Fresh off the tram.', PALETTE.groundAccent, 11);
      y += 16;
    } else {
      for (const s of ev.topSkills) {
        const label = s.skill.charAt(0).toUpperCase() + s.skill.slice(1);
        add(20, y, `${label} ${s.level}`, UI_TEXT_WARM, 11);
        y += 16;
      }
    }
    y += 6;
    add(14, y, 'WEARING', PALETTE.neonAmber, 11);
    y += 17;
    const worn = Object.values(eq)
      .map((id) => COSMETICS[id]?.label)
      .filter((l): l is string => l !== undefined);
    if (worn.length === 0) {
      add(20, y, 'Just the jacket they came in.', PALETTE.groundAccent, 11);
      y += 16;
    } else {
      for (const label of worn) {
        add(20, y, label, UI_TEXT_WARM, 11);
        y += 16;
      }
    }

    // Looks lead to deals.
    const trade = add(14, H - 26, '[offer trade]', PALETTE.neonTeal, 12);
    trade.setInteractive({ useHandCursor: true });
    trade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, evd: Phaser.Types.Input.EventData) => {
      evd.stopPropagation();
      if (session.room !== null && this.targetSessionId !== null) {
        send.ptrade(session.room, { action: 'request', targetSessionId: this.targetSessionId });
        this.hide();
      }
    });

    const cam = this.scene.cameras.main;
    this.container.setPosition(cam.width - W - 14, Math.round((cam.height - H) / 2));
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
    this.targetSessionId = null;
  }
}
