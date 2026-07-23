import Phaser from 'phaser';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { ChargeSyncEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { sound } from '../audio/sound';
import { kitButton, kitClampLines, kitHeader, kitPlate, kitText, SPACE } from './kit';

const PANEL_W = 440;
const PANEL_H_MIN = 380;
const BAR_W = PANEL_W - 32;
const WRAP_W = PANEL_W - 32;

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

  private lastH = PANEL_H_MIN;

  pixelSize(): { w: number; h: number } {
    return { w: PANEL_W, h: this.lastH };
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.setVisible(v);
    if (v) this.refresh();
  }

  /**
   * F4 flow layout: every line wraps inside the plate (the buff and regalia
   * copy used to run 40–80px past the edge) and each band measures the one
   * above; the plate takes the flowed height. The header title is clamped by
   * kitHeader itself so a long week key never crosses the ✕.
   */
  refresh(): void {
    this.container.removeAll(true);
    const sync = this.sync;
    if (sync === null) return;

    const add = (
      x: number,
      y: number,
      text: string,
      color = UI_TEXT_WARM,
      wrapW?: number,
      maxLines = 2,
    ): Phaser.GameObjects.Text => {
      const t = kitText(this.scene, x, y, text, 'body', { color });
      if (wrapW !== undefined) {
        t.setWordWrapWidth(wrapW);
        kitClampLines(t, maxLines);
      }
      this.container.add(t);
      return t;
    };

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

    let y = 70;
    const flow = (t: Phaser.GameObjects.Text, gap = 7): void => {
      y += Math.ceil(t.height) + gap;
    };
    flow(add(16, y, `${sync.total} Amperite banked by the city`, PALETTE.warmGlow, WRAP_W));
    const tierLine =
      sync.tier >= sync.thresholds.length
        ? 'FESTIVAL BLAZE — every string light burns'
        : `tier ${sync.tier} · ${(sync.thresholds[sync.tier] ?? 0) - sync.total} more lights tier ${sync.tier + 1}`;
    flow(add(16, y, tierLine, sync.tier >= 3 ? PALETTE.neonAmber : UI_TEXT_WARM, WRAP_W));
    flow(
      add(
        16,
        y,
        sync.buffActive
          ? `Weekend buff glowing: +${sync.buffPct}% gather XP citywide`
          : 'Reach tier 1 and the weekend brings a citywide gather-XP buff.',
        sync.buffActive ? PALETTE.neonTeal : UI_TEXT_WARM,
        WRAP_W,
      ),
    );
    flow(add(16, y, 'Top Sparks carry an untradeable name-glow — regalia only.', UI_TEXT_WARM, WRAP_W));

    // ── donate ──────────────────────────────────────────────────────────
    y += 8;
    const have = gameState.count('amperite');
    const haveLine = add(16, y, `Your Amperite: ${have}`, PALETTE.warmGlow, 150, 1);
    if (have > 0 && session.room !== null) {
      this.container.add(
        kitButton(this.scene, 180, y - 6, 'donate 5', {
          width: 90,
          height: 22,
          onClick: () => {
            if (session.room !== null) {
              send.donate(session.room, { itemId: 'amperite', qty: Math.min(5, have) });
              sound.donationWhoosh();
            }
          },
        }),
      );
      this.container.add(
        kitButton(this.scene, 280, y - 6, 'donate all', {
          width: 100,
          height: 22,
          primary: true,
          onClick: () => {
            if (session.room !== null) {
              send.donate(session.room, { itemId: 'amperite', qty: have });
              sound.donationWhoosh();
            }
          },
        }),
      );
    }
    flow(haveLine, 12);

    // ── leaderboard ─────────────────────────────────────────────────────
    flow(add(16, y, "THIS WEEK'S BRIGHTEST SPARKS", PALETTE.neonTeal, WRAP_W, 1));
    if (sync.top.length === 0) {
      flow(add(16, y, 'No donations yet — the Dynamo waits.', UI_TEXT_WARM, WRAP_W, 1));
    }
    sync.top.slice(0, 7).forEach((row, i) => {
      const name = add(16, y, `${i + 1}. ${row.sparkName}`, UI_TEXT_WARM, 250, 1);
      add(280, y, `${row.amperite} Amperite`, PALETTE.warmGlow, PANEL_W - 280 - 16, 1);
      flow(name, 6);
    });

    // Plate LAST from the flowed height; header on top; recentre.
    this.lastH = Math.max(PANEL_H_MIN, y + SPACE.md);
    this.container.addAt(kitPlate(this.scene, PANEL_W, this.lastH), 0);
    kitHeader(
      this.scene,
      this.container,
      PANEL_W,
      `The Citywide Charge — week of ${sync.weekKey}`,
      () => this.setVisible(false),
    );
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      Math.round((cam.width - PANEL_W) / 2),
      Math.round(Math.max(30, (cam.height - this.lastH) / 2 - 10)),
    );
  }
}
