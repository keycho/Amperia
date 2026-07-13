import Phaser from 'phaser';
import { COSMETICS, decodeEquipped } from '@shared/cosmetics';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { InspectInfoEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session } from '../net/session';
import { bakeSparkAppearance, equipKey } from '../render/sparkModel';
import { voxelSprite } from '../render/voxel';
import { kitButton, kitCloseButton, kitPlate, kitText, SPACE, type TypeLevel } from './kit';

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
  private lines: Phaser.GameObjects.GameObject[] = [];
  private targetSessionId: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1200);
    this.container.setVisible(false);

    this.container.add(kitPlate(scene, W, H));

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

    this.container.add(kitCloseButton(scene, W - SPACE.md, 18, () => this.hide()));
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

    const add = (x: number, y: number, text: string, color: string, level: TypeLevel = 'body') => {
      const t = kitText(this.scene, x, y, text, level, { color });
      this.container.add(t);
      this.lines.push(t);
      return t;
    };

    const glow = eq.nameGlow !== undefined;
    const name = add(14, 10, ev.sparkName, glow ? PALETTE.neonAmber : UI_TEXT_WARM, 'heading');
    if (glow) name.setShadow(0, 0, PALETTE.warmGlow, 6, true, true);
    if (ev.title !== null) {
      // Manifest title (S1) — the city's word for this Spark.
      add(name.x + name.width + 8, 14, `“${ev.title}”`, PALETTE.neonTeal, 'caption');
    }
    add(14, 172, ev.crew ?? 'No crew — yet.', ev.crew !== null ? PALETTE.neonTeal : PALETTE.groundAccent, 'caption');

    let y = 194;
    add(14, y, 'MASTERY', PALETTE.neonAmber, 'caption');
    y += 17;
    if (ev.topSkills.length === 0) {
      add(20, y, 'Fresh off the tram.', PALETTE.groundAccent, 'caption');
      y += 16;
    } else {
      for (const s of ev.topSkills) {
        const label = s.skill.charAt(0).toUpperCase() + s.skill.slice(1);
        add(20, y, `${label} ${s.level}`, UI_TEXT_WARM, 'caption');
        y += 16;
      }
    }
    y += 6;
    add(14, y, 'WEARING', PALETTE.neonAmber, 'caption');
    y += 17;
    const worn = Object.values(eq)
      .map((id) => COSMETICS[id]?.label)
      .filter((l): l is string => l !== undefined);
    if (worn.length === 0) {
      add(20, y, 'Just the jacket they came in.', PALETTE.groundAccent, 'caption');
      y += 16;
    } else {
      for (const label of worn) {
        add(20, y, label, UI_TEXT_WARM, 'caption');
        y += 16;
      }
    }

    // Looks lead to deals.
    const trade = kitButton(this.scene, SPACE.md, H - 42, 'offer trade', {
      primary: true,
      onClick: () => {
        if (session.room !== null && this.targetSessionId !== null) {
          send.ptrade(session.room, { action: 'request', targetSessionId: this.targetSessionId });
          this.hide();
        }
      },
    });
    this.container.add(trade);
    this.lines.push(trade);

    const cam = this.scene.cameras.main;
    this.container.setPosition(cam.width - W - 14, Math.round((cam.height - H) / 2));
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
    this.targetSessionId = null;
  }
}
