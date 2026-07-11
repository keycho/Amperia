import Phaser from 'phaser';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { ChargeSyncEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { sound } from '../audio/sound';

const PANEL_W = 440;
const PANEL_H = 380;
const BAR_W = PANEL_W - 32;

/**
 * The Citywide Charge panel (the Warden's ledger): the weekly meter with
 * its three tier notches, donate buttons, the weekend-buff line and the
 * brightest-Sparks leaderboard. Rewards are regalia only — the copy stays
 * inside the comms rules (no "earn", ever).
 */
export class ChargePanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private sync: ChargeSyncEvent | null = null;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1170);
    this.container.setVisible(false);
    session.events.on(SessionEvents.chargeSync, (ev: ChargeSyncEvent) => {
      this.sync = ev;
      this.setVisible(true);
    });
  }

  pixelSize(): { w: number; h: number } {
    return { w: PANEL_W, h: PANEL_H };
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) this.refresh();
  }

  refresh(): void {
    this.container.removeAll(true);
    const sync = this.sync;
    if (sync === null) return;

    const g = this.scene.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.95);
    g.fillRoundedRect(0, 0, PANEL_W, PANEL_H, 10);
    g.lineStyle(2, PALETTE_INT.warmGlow, 0.6);
    g.strokeRoundedRect(0, 0, PANEL_W, PANEL_H, 10);
    this.container.add(g);

    const add = (
      x: number,
      y: number,
      text: string,
      color = UI_TEXT_WARM,
      onClick?: () => void,
    ): Phaser.GameObjects.Text => {
      const t = this.scene.add.text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color,
      });
      if (onClick !== undefined) {
        t.setInteractive({ useHandCursor: true });
        t.on(
          'pointerdown',
          (_p: unknown, _lx: unknown, _ly: unknown, ev: { stopPropagation(): void }) => {
            ev.stopPropagation();
            onClick();
          },
        );
        t.on('pointerover', () => t.setColor(PALETTE.neonAmber));
        t.on('pointerout', () => t.setColor(color));
      }
      this.container.add(t);
      return t;
    };

    add(16, 12, `The Citywide Charge — week of ${sync.weekKey}`, PALETTE.neonAmber);
    add(PANEL_W - 90, 12, '[close]', UI_TEXT_WARM, () => this.setVisible(false));

    // ── the meter bar with tier notches ─────────────────────────────────
    const full = sync.thresholds[sync.thresholds.length - 1] ?? 1;
    const frac = Math.min(1, sync.total / Math.max(1, full));
    const bar = this.scene.add.graphics();
    bar.fillStyle(PALETTE_INT.structureMid, 0.9);
    bar.fillRoundedRect(16, 44, BAR_W, 18, 9);
    bar.fillStyle(sync.tier >= 3 ? PALETTE_INT.neonAmber : PALETTE_INT.warmGlow, 0.95);
    bar.fillRoundedRect(18, 46, Math.max(8, (BAR_W - 4) * frac), 14, 7);
    for (const t of sync.thresholds) {
      const x = 16 + BAR_W * Math.min(1, t / Math.max(1, full));
      bar.lineStyle(2, PALETTE_INT.neonTeal, 0.9);
      bar.lineBetween(x, 42, x, 64);
    }
    this.container.add(bar);
    add(16, 70, `${sync.total} Amperite banked by the city`, PALETTE.warmGlow);
    const tierLine =
      sync.tier >= sync.thresholds.length
        ? 'FESTIVAL BLAZE — every string light burns'
        : `tier ${sync.tier} · ${(sync.thresholds[sync.tier] ?? 0) - sync.total} more lights tier ${sync.tier + 1}`;
    add(16, 92, tierLine, sync.tier >= 3 ? PALETTE.neonAmber : UI_TEXT_WARM);
    add(
      16,
      114,
      sync.buffActive
        ? `Weekend buff glowing: +${sync.buffPct}% gather XP citywide`
        : 'Reach tier 1 and the weekend brings a citywide gather-XP buff.',
      sync.buffActive ? PALETTE.neonTeal : UI_TEXT_WARM,
    );
    add(16, 136, 'Top Sparks carry an untradeable name-glow — regalia only.', UI_TEXT_WARM);

    // ── donate ──────────────────────────────────────────────────────────
    const have = gameState.count('amperite');
    add(16, 166, `Your Amperite: ${have}`, PALETTE.warmGlow);
    if (have > 0 && session.room !== null) {
      add(180, 166, '[donate 5]', PALETTE.neonTeal, () => {
        if (session.room !== null) {
          send.donate(session.room, { itemId: 'amperite', qty: Math.min(5, have) });
          sound.donationWhoosh();
        }
      });
      add(280, 166, '[donate all]', PALETTE.neonTeal, () => {
        if (session.room !== null) {
          send.donate(session.room, { itemId: 'amperite', qty: have });
          sound.donationWhoosh();
        }
      });
    }

    // ── leaderboard ─────────────────────────────────────────────────────
    add(16, 196, "THIS WEEK'S BRIGHTEST SPARKS", PALETTE.neonTeal);
    if (sync.top.length === 0) {
      add(16, 218, 'No donations yet — the Dynamo waits.', UI_TEXT_WARM);
    }
    sync.top.slice(0, 7).forEach((row, i) => {
      add(16, 218 + i * 20, `${i + 1}. ${row.sparkName}`, UI_TEXT_WARM);
      add(280, 218 + i * 20, `${row.amperite} Amperite`, PALETTE.warmGlow);
    });
  }
}
