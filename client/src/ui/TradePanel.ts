import Phaser from 'phaser';
import { ITEMS } from '@shared/items';
import { itemIsTradeable } from '@shared/trade';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { TradeAskEvent, TradeEndEvent, TradeSyncEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { HEADER_H, kitButton, kitHeader, kitPlate, kitText, SPACE, kitPanelPop } from './kit';

const PANEL_W = 560;
const PANEL_H = 420;
const ROW_H = 22;

/**
 * The direct-trade window: request prompt, two staged columns (you / them),
 * confirm state, and pack rows to stage from. The server owns everything —
 * this panel renders tradeSync snapshots and sends slot references only.
 */
export class TradePanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private rows: Phaser.GameObjects.GameObject[] = [];
  visible = false;

  private tradeId: string | null = null;
  private sync: TradeSyncEvent | null = null;
  private ask: TradeAskEvent | null = null;
  /** Local staging: pack slot index → qty (source for 'stage' intents). */
  private staged = new Map<number, number>();
  private stagedBolts = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1200);
    this.container.setVisible(false);

    session.events.on(SessionEvents.tradeAsk, (ev: TradeAskEvent) => {
      this.ask = ev;
      this.tradeId = ev.tradeId;
      this.sync = null;
      this.resetStage();
      this.setVisible(true);
    });
    session.events.on(SessionEvents.tradeSync, (ev: TradeSyncEvent) => {
      this.ask = null;
      this.tradeId = ev.tradeId;
      this.sync = ev;
      this.setVisible(true);
    });
    session.events.on(SessionEvents.tradeEnd, (_ev: TradeEndEvent) => {
      this.tradeId = null;
      this.sync = null;
      this.ask = null;
      this.resetStage();
      this.setVisible(false);
    });
  }

  private resetStage(): void {
    this.staged.clear();
    this.stagedBolts = 0;
  }

  /** Walk away (Esc/[close]): the server ends the trade for both sides. */
  requestCancel(): void {
    if (session.room !== null && this.tradeId !== null) {
      const action = this.ask !== null ? 'decline' : 'cancel';
      send.ptrade(session.room, { action, tradeId: this.tradeId });
    } else {
      this.setVisible(false);
    }
  }

  pixelSize(): { w: number; h: number } {
    return { w: PANEL_W, h: PANEL_H };
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) {
      this.container.setVisible(true);
      this.refresh();
    }
    // F5: every panel opens/closes through the one 120ms kit pop.
    kitPanelPop(this.scene, this.container, this.pixelSize(), v);
  }

  private sendStage(): void {
    if (session.room === null || this.tradeId === null) return;
    send.ptrade(session.room, {
      action: 'stage',
      tradeId: this.tradeId,
      bolts: this.stagedBolts,
      items: [...this.staged.entries()].map(([slot, qty]) => ({ slot, qty })),
    });
  }

  refresh(): void {
    for (const r of this.rows) r.destroy();
    this.rows = [];
    this.container.removeAll(true);

    const add = (
      x: number,
      y: number,
      text: string,
      color = UI_TEXT_WARM,
    ): Phaser.GameObjects.Text => {
      const t = kitText(this.scene, x, y, text, 'body', { color });
      this.container.add(t);
      this.rows.push(t);
      return t;
    };

    const btn = (
      x: number,
      y: number,
      label: string,
      opts: { width?: number; height?: number; primary?: boolean; onClick: () => void },
    ): Phaser.GameObjects.Container => {
      const b = kitButton(this.scene, x, y, label, opts);
      this.container.add(b);
      this.rows.push(b);
      return b;
    };

    // ── the incoming-request prompt ─────────────────────────────────────
    if (this.ask !== null) {
      const askEv = this.ask;
      const AW = 360;
      const AH = 100;
      this.container.add(kitPlate(this.scene, AW, AH));
      kitHeader(this.scene, this.container, AW, `${askEv.fromName} offers to trade`);
      btn(40, HEADER_H + SPACE.md, 'accept', {
        width: 130,
        height: 28,
        primary: true,
        onClick: () => {
          if (session.room !== null)
            send.ptrade(session.room, { action: 'accept', tradeId: askEv.tradeId });
        },
      });
      btn(190, HEADER_H + SPACE.md, 'decline', {
        width: 130,
        height: 28,
        onClick: () => {
          if (session.room !== null)
            send.ptrade(session.room, { action: 'decline', tradeId: askEv.tradeId });
        },
      });
      return;
    }

    if (this.sync === null || this.tradeId === null) return;
    const sync = this.sync;
    const tradeId = this.tradeId;

    this.container.add(kitPlate(this.scene, PANEL_W, PANEL_H));
    kitHeader(this.scene, this.container, PANEL_W, `Trading with ${sync.partnerName}`, () => {
      if (session.room !== null) send.ptrade(session.room, { action: 'cancel', tradeId });
    });

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, PALETTE_INT.structureMid, 0.8);
    divider.lineBetween(PANEL_W / 2, 62, PANEL_W / 2, PANEL_H - 130);
    this.container.add(divider);

    add(16, 44, 'both confirm to swap — the city holds the goods until then', PALETTE.warmGlow);

    // ── staged columns ──────────────────────────────────────────────────
    const col = (
      x: number,
      title: string,
      side: TradeSyncEvent['you'],
      mine: boolean,
    ): void => {
      add(x, 66, title, mine ? PALETTE.neonTeal : PALETTE.neonRose);
      add(
        x + 150,
        66,
        side.confirmed ? '✓ confirmed' : '… unconfirmed',
        side.confirmed ? PALETTE.neonTeal : UI_TEXT_WARM,
      );
      add(x, 90, `Bolts ⚙ ${side.bolts}`, PALETTE.warmGlow);
      side.items.forEach((it, i) => {
        const label =
          `${ITEMS[it.itemId].name} × ${it.qty}` +
          (it.durability !== undefined ? ` (wear ${it.durability})` : '');
        add(x, 114 + i * ROW_H, label, UI_TEXT_WARM);
      });
    };
    col(20, 'YOU stage', sync.you, true);
    col(PANEL_W / 2 + 16, `${sync.partnerName} stages`, sync.them, false);

    // ── stage controls: bolts steppers + clear ──────────────────────────
    const ctrlY = PANEL_H - 122;
    add(16, ctrlY, `stage Bolts (${gameState.bolts} held):`, UI_TEXT_WARM);
    for (const [label, delta, x, w] of [
      ['+10', 10, 230, 44],
      ['+100', 100, 280, 48],
      ['reset', 0, 340, 54],
    ] as const) {
      btn(x, ctrlY - 4, label, {
        width: w,
        height: 22,
        onClick: () => {
          this.stagedBolts =
            delta === 0 ? 0 : Math.min(gameState.bolts, this.stagedBolts + delta);
          this.sendStage();
        },
      });
    }
    btn(420, ctrlY - 4, 'clear items', {
      width: 110,
      height: 22,
      onClick: () => {
        this.staged.clear();
        this.sendStage();
      },
    });

    // ── pack rows to stage from ─────────────────────────────────────────
    add(16, ctrlY + 24, 'your Pack (click to stage):', UI_TEXT_WARM);
    let shown = 0;
    gameState.inventory.slots.forEach((slot, idx) => {
      if (slot === null || shown >= 8) return;
      if (!itemIsTradeable(slot.itemId)) return;
      const already = this.staged.get(idx) ?? 0;
      const left = slot.qty - already;
      if (left <= 0) return;
      const x = 16 + (shown % 4) * 136;
      const y = ctrlY + 44 + Math.floor(shown / 4) * ROW_H;
      btn(x, y, `${ITEMS[slot.itemId].name}×${left}`, {
        width: 128,
        height: 22,
        onClick: () => {
          // Gear stages whole; stacks stage in tens (click again for more).
          const step = slot.durability !== undefined ? 1 : Math.min(10, left);
          this.staged.set(idx, Math.min(slot.qty, already + step));
          this.sendStage();
        },
      });
      shown += 1;
    });

    // ── confirm / cancel ────────────────────────────────────────────────
    const btnY = PANEL_H - 30;
    if (sync.you.confirmed) {
      btn(20, btnY, 'unconfirm', {
        width: 130,
        height: 24,
        onClick: () => {
          if (session.room !== null) send.ptrade(session.room, { action: 'unconfirm', tradeId });
        },
      });
    } else {
      btn(20, btnY, 'confirm trade', {
        width: 130,
        height: 24,
        primary: true,
        onClick: () => {
          if (session.room !== null) send.ptrade(session.room, { action: 'confirm', tradeId });
        },
      });
    }
    btn(PANEL_W - 130, btnY, 'cancel', {
      width: 110,
      height: 24,
      onClick: () => {
        if (session.room !== null) send.ptrade(session.room, { action: 'cancel', tradeId });
      },
    });
  }
}
