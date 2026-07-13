import Phaser from 'phaser';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { ChargeSyncEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { sound } from '../audio/sound';
import { kitButton, kitHeader, kitPlate, kitText } from './kit';

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

    this.container.add(kitPlate(this.scene, PANEL_W, PANEL_H));
    kitHeader(
      this.scene,
      this.container,
      PANEL_W,
      `The Citywide Charge — week of ${sync.weekKey}`,
      () => this.setVisible(false),
    );

    const add = (
      x: number,
      y: number,
      text: string,
      color = UI_TEXT_WARM,
    ): Phaser.GameObjects.Text => {
      const t = kitText(this.scene, x, y, text, 'body', { color });
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
      this.container.add(
        kitButton(this.scene, 180, 160, 'donate 5', {
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
        kitButton(this.scene, 280, 160, 'donate all', {
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
