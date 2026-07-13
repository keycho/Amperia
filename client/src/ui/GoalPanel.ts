import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { COSMETICS } from '@shared/cosmetics';
import { type GoalDef, goalWeekKey, weeklyGoals } from '@shared/goals';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { GoalsSync } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { HEADER_H, kitButton, kitHeader, kitPlate, kitText, SPACE, type TypeLevel } from './kit';

const W = 520;
const H = 420;
const ROW_H = 34;

/** Nearest kit type level for a legacy pixel size (locked scale 28/18/13/11). */
function levelForSize(size: number): TypeLevel {
  if (size >= 23) return 'display';
  if (size >= 16) return 'heading';
  if (size >= 12) return 'body';
  return 'caption';
}

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

    this.container.add(kitPlate(scene, W, H));
    kitHeader(scene, this.container, W, 'THE GOAL BOARD', () => this.setVisible(false));

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
    const t = kitText(this.scene, x, y, body, levelForSize(size), { color, bold });
    this.container.add(t);
    this.dynamic.push(t);
    return t;
  }

  private refresh(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic.length = 0;

    // Title + close are static kit chrome built once in the constructor.
    this.text(196, 12, `week of ${this.weekKey}`, PALETTE.groundAccent, 11);
    this.text(
      16,
      HEADER_H + SPACE.sm,
      `Rewards claimable on any ${CONFIG.goals.maxClaims} — ${this.claimsUsed}/${CONFIG.goals.maxClaims} this week. Miss a week, lose nothing.`,
      UI_TEXT_WARM,
      11,
    );

    const goals = weeklyGoals(this.weekKey);
    const rowTop = HEADER_H + SPACE.sm + 26;
    goals.forEach((g, i) => this.drawRow(g, 16, rowTop + i * ROW_H));

    const seasonal = COSMETICS[CONFIG.goals.seasonalCosmetic]?.label ?? 'seasonal regalia';
    this.text(
      16,
      rowTop + goals.length * ROW_H + 10,
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
      const btn = kitButton(this.scene, x + 232, y - SPACE.xs, `+${g.bolts} B`, {
        width: 62,
        height: 22,
        primary: true,
        onClick: () => {
          if (session.room !== null) send.goalClaim(session.room, { goalId: g.id });
        },
      });
      this.container.add(btn);
      this.dynamic.push(btn);
    }
  }
}
