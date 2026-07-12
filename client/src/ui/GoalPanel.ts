import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { COSMETICS } from '@shared/cosmetics';
import { type GoalDef, goalWeekKey, weeklyGoals } from '@shared/goals';
import { mixPalette, PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { GoalsSync } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';

const W = 520;
const H = 420;
const ROW_H = 34;

interface RowState {
  progress: number;
  claimed: boolean;
}

/**
 * The weekly goal board (S2), opened with G. Eight goals a week, progress
 * on all, REWARDS claimable on any five — never streaks, never penalties.
 * The goal list derives from shared config + the week key, so the panel
 * always agrees with the server.
 */
export class GoalPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly dynamic: Phaser.GameObjects.GameObject[] = [];
  private weekKey = goalWeekKey(Date.now());
  private rows = new Map<string, RowState>();
  private claimsUsed = 0;
  private tokens = 0;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);

    const chrome = scene.add.nineslice(0, 0, 'ui-panel-screws', undefined, W, H, 16, 16, 16, 16);
    chrome.setOrigin(0, 0);
    chrome.setTint(mixPalette('duskSky', 'structureMid', 0.55));
    chrome.setAlpha(0.97);
    this.container.add(chrome);

    session.events.on(SessionEvents.goals, (sync: GoalsSync) => {
      if (sync.weekKey !== this.weekKey) {
        this.weekKey = sync.weekKey;
        this.rows.clear();
      }
      for (const r of sync.rows) {
        this.rows.set(r.goalId, { progress: r.progress, claimed: r.claimed });
      }
      if (sync.claimsUsed !== undefined) this.claimsUsed = sync.claimsUsed;
      else this.claimsUsed = [...this.rows.values()].filter((r) => r.claimed).length;
      if (sync.tokens !== undefined) this.tokens = sync.tokens;
      if (this.visible) this.refresh();
    });
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) {
      const cam = this.scene.cameras.main;
      this.container.setPosition(
        Math.round((cam.width - W) / 2),
        Math.round((cam.height - H) / 2),
      );
      this.refresh();
    }
  }

  private text(x: number, y: number, body: string, color: string, size = 12, bold = false) {
    const t = this.scene.add.text(x, y, body, {
      fontFamily: 'monospace',
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? 'bold' : 'normal',
    });
    this.container.add(t);
    this.dynamic.push(t);
    return t;
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic.length = 0;

    this.text(16, 12, 'THE GOAL BOARD', PALETTE.neonAmber, 17, true);
    this.text(196, 16, `week of ${this.weekKey}`, PALETTE.groundAccent, 11);
    const close = this.text(W - 44, 12, '[x]', UI_TEXT_WARM, 13);
    close.setInteractive({ useHandCursor: true });
    close.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.setVisible(false);
    });
    this.text(
      16,
      36,
      `Rewards claimable on any ${CONFIG.goals.maxClaims} — ${this.claimsUsed}/${CONFIG.goals.maxClaims} this week. Miss a week, lose nothing.`,
      UI_TEXT_WARM,
      11,
    );

    const goals = weeklyGoals(this.weekKey);
    goals.forEach((g, i) => this.drawRow(g, 16, 62 + i * ROW_H));

    const seasonal = COSMETICS[CONFIG.goals.seasonalCosmetic]?.label ?? 'seasonal regalia';
    this.text(
      16,
      62 + goals.length * ROW_H + 10,
      `Regalia tokens: ${Math.min(this.tokens, CONFIG.goals.tokensForSeasonal)}/${CONFIG.goals.tokensForSeasonal} toward the ${seasonal} — one per full week of five.`,
      PALETTE.neonTeal,
      11,
    );
  }

  private drawRow(g: GoalDef, x: number, y: number): void {
    const st = this.rows.get(g.id) ?? { progress: 0, claimed: false };
    const done = st.progress >= g.target;
    this.text(x, y, g.label, done ? UI_TEXT_WARM : PALETTE.groundAccent, 12);

    // Progress bar.
    const bar = this.scene.add.graphics();
    const bw = 130;
    const frac = Math.min(1, st.progress / g.target);
    bar.fillStyle(PALETTE_INT.ink, 0.9);
    bar.fillRoundedRect(x + 300, y + 2, bw, 10, 5);
    if (frac > 0) {
      bar.fillStyle(done ? PALETTE_INT.neonAmber : PALETTE_INT.neonTeal, 0.95);
      bar.fillRoundedRect(x + 300, y + 2, Math.max(8, bw * frac), 10, 5);
    }
    this.container.add(bar);
    this.dynamic.push(bar);
    this.text(x + 300 + bw + 8, y, `${Math.min(st.progress, g.target)}/${g.target}`, PALETTE.groundAccent, 10);

    if (st.claimed) {
      this.text(x + 232, y, '✓ rewarded', PALETTE.neonAmber, 11);
    } else if (done && this.claimsUsed < CONFIG.goals.maxClaims) {
      const btn = this.text(x + 232, y, `[+${g.bolts} B]`, PALETTE.neonTeal, 12, true);
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        if (session.room !== null) send.goalClaim(session.room, { goalId: g.id });
      });
    }
  }
}
