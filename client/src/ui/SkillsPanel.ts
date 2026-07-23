import Phaser from 'phaser';
import { levelForXp, levelProgress, nextUnlock, SKILLS, type SkillId } from '@shared/mastery';
import { mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { gameState } from '../state/GameState';
import { HEADER_H, kitHeader, kitPlate, kitText, SPACE, kitPanelPop } from './kit';

const ROW_H = 46;
const PANEL_W = 380;
/** Body sits below the kit header bar. */
const BODY_TOP = HEADER_H + SPACE.sm;

const SKILL_LABELS: Record<SkillId, string> = {
  scavving: 'Scavving',
  delving: 'Delving',
  skimming: 'Skimming',
  tuning: 'Tuning',
  brawling: 'Brawling',
  griddling: 'Griddling',
};

/** Mastery panel (K): level, XP bar, and the next breadth unlock per skill. */
export class SkillsPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly rows: Array<{
    name: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    unlock: Phaser.GameObjects.Text;
  }> = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1100);

    const { w, h } = this.pixelSize();
    this.container.add(kitPlate(scene, w, h));

    // The bars graphics sits above the plate; the panel background is the plate.
    this.bg = scene.add.graphics();
    this.container.add(this.bg);

    kitHeader(scene, this.container, w, 'Mastery');

    SKILLS.forEach((skill, i) => {
      const y = BODY_TOP + i * ROW_H;
      const name = kitText(scene, 16, y, SKILL_LABELS[skill], 'body', { color: UI_TEXT_WARM });
      const level = kitText(scene, w - 16, y, '1', 'body', {
        color: PALETTE.neonAmber,
        bold: true,
      });
      level.setOrigin(1, 0);
      const unlock = kitText(scene, 16, y + 26, '', 'caption', { color: UI_TEXT_WARM });
      unlock.setAlpha(0.7);
      this.container.add(name);
      this.container.add(level);
      this.container.add(unlock);
      this.rows.push({ name, level, unlock });
    });
    this.container.setVisible(false);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  setVisible(v: boolean): void {
    if (v) {
      this.container.setVisible(true);
      this.refresh();
    }
    // F5: open/close through the one 120ms kit pop.
    kitPanelPop(this.scene, this.container, this.pixelSize(), v);
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  pixelSize(): { w: number; h: number } {
    return { w: PANEL_W, h: BODY_TOP + SKILLS.length * ROW_H + SPACE.md };
  }

  refresh(): void {
    const g = this.bg;
    const { w } = this.pixelSize();
    g.clear();

    SKILLS.forEach((skill, i) => {
      const xp = gameState.skills[skill];
      const level = levelForXp(xp);
      const progress = levelProgress(xp);
      const y = BODY_TOP + i * ROW_H;
      const row = this.rows[i];
      if (row === undefined) return;
      row.level.setText(String(level));
      const unlock = nextUnlock(skill, level);
      row.unlock.setText(
        unlock === null ? 'all routes open' : `Mastery ${unlock.level}: ${unlock.label}`,
      );
      // XP bar under the name.
      const barY = y + 17;
      g.fillStyle(PALETTE_INT.ink, 0.85);
      g.fillRoundedRect(16, barY, w - 32, 7, 3.5);
      g.fillStyle(mixPalette('neonAmber', 'warmGlow', 0.35), 1);
      g.fillRoundedRect(17, barY + 1, Math.max(3, (w - 34) * progress), 5, 2.5);
    });
  }
}
