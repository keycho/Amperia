import Phaser from 'phaser';
import { levelForXp, levelProgress, nextUnlock, SKILLS, type SkillId } from '@shared/mastery';
import { mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { gameState } from '../state/GameState';

const ROW_H = 46;
const PANEL_W = 380;

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
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly rows: Array<{
    name: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    unlock: Phaser.GameObjects.Text;
  }> = [];

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1100);
    this.bg = scene.add.graphics();
    this.container.add(this.bg);

    const title = scene.add.text(14, -30, 'Mastery', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: UI_TEXT_WARM,
      fontStyle: 'bold',
    });
    this.container.add(title);

    SKILLS.forEach((skill, i) => {
      const y = 12 + i * ROW_H;
      const name = scene.add.text(16, y, SKILL_LABELS[skill], {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: UI_TEXT_WARM,
      });
      const level = scene.add.text(PANEL_W - 16, y, '1', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: PALETTE.neonAmber,
        fontStyle: 'bold',
      });
      level.setOrigin(1, 0);
      const unlock = scene.add.text(16, y + 26, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: UI_TEXT_WARM,
      });
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
    this.container.setVisible(v);
    if (v) this.refresh();
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  pixelSize(): { w: number; h: number } {
    return { w: PANEL_W, h: SKILLS.length * ROW_H + 24 };
  }

  refresh(): void {
    const g = this.bg;
    const { w, h } = this.pixelSize();
    g.clear();
    g.fillStyle(PALETTE_INT.structureMid, 0.94);
    g.fillRoundedRect(0, -40, w, h + 40, 12);
    g.lineStyle(2, PALETTE_INT.ink, 1);
    g.strokeRoundedRect(0, -40, w, h + 40, 12);

    SKILLS.forEach((skill, i) => {
      const xp = gameState.skills[skill];
      const level = levelForXp(xp);
      const progress = levelProgress(xp);
      const y = 12 + i * ROW_H;
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
