import Phaser from 'phaser';
import { ITEMS } from '@shared/items';
import { itemIsTradeable } from '@shared/trade';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { TradeAskEvent, TradeEndEvent, TradeSyncEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';

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
    this.container.setVisible(v);
    if (v) this.refresh();
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
      this.rows.push(t);
      return t;
    };

    // ── the incoming-request prompt ─────────────────────────────────────
    if (this.ask !== null) {
      const g = this.scene.add.graphics();
      g.fillStyle(PALETTE_INT.ink, 0.94);
      g.fillRoundedRect(0, 0, 360, 96, 10);
      g.lineStyle(2, PALETTE_INT.warmGlow, 0.6);
      g.strokeRoundedRect(0, 0, 360, 96, 10);
      this.container.add(g);
      const askEv = this.ask;
      add(16, 14, `${askEv.fromName} offers to trade`, PALETTE.neonAmber);
      add(60, 54, '[accept]', PALETTE.neonTeal, () => {
        if (session.room !== null)
          send.ptrade(session.room, { action: 'accept', tradeId: askEv.tradeId });
      });
      add(200, 54, '[decline]', PALETTE.neonRose, () => {
        if (session.room !== null)
          send.ptrade(session.room, { action: 'decline', tradeId: askEv.tradeId });
      });
      return;
    }

    if (this.sync === null || this.tradeId === null) return;
    const sync = this.sync;
    const tradeId = this.tradeId;

    const g = this.scene.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.95);
    g.fillRoundedRect(0, 0, PANEL_W, PANEL_H, 10);
    g.lineStyle(2, PALETTE_INT.warmGlow, 0.6);
    g.strokeRoundedRect(0, 0, PANEL_W, PANEL_H, 10);
    g.lineStyle(1, PALETTE_INT.structureMid, 0.8);
    g.lineBetween(PANEL_W / 2, 56, PANEL_W / 2, PANEL_H - 130);
    this.container.add(g);

    add(16, 12, `Trading with ${sync.partnerName}`, PALETTE.neonAmber);
    add(PANEL_W - 90, 12, '[close]', UI_TEXT_WARM, () => {
      if (session.room !== null) send.ptrade(session.room, { action: 'cancel', tradeId });
    });
    add(16, 34, 'both confirm to swap — the city holds the goods until then', PALETTE.warmGlow);

    // ── staged columns ──────────────────────────────────────────────────
    const col = (
      x: number,
      title: string,
      side: TradeSyncEvent['you'],
      mine: boolean,
    ): void => {
      add(x, 60, title, mine ? PALETTE.neonTeal : PALETTE.neonRose);
      add(
        x + 150,
        60,
        side.confirmed ? '✓ confirmed' : '… unconfirmed',
        side.confirmed ? PALETTE.neonTeal : UI_TEXT_WARM,
      );
      add(x, 84, `Bolts ⚙ ${side.bolts}`, PALETTE.warmGlow);
      side.items.forEach((it, i) => {
        const label =
          `${ITEMS[it.itemId].name} × ${it.qty}` +
          (it.durability !== undefined ? ` (wear ${it.durability})` : '');
        add(x, 108 + i * ROW_H, label, UI_TEXT_WARM);
      });
    };
    col(20, 'YOU stage', sync.you, true);
    col(PANEL_W / 2 + 16, `${sync.partnerName} stages`, sync.them, false);

    // ── stage controls: bolts steppers + clear ──────────────────────────
    const ctrlY = PANEL_H - 122;
    add(16, ctrlY, `stage Bolts (${gameState.bolts} held):`, UI_TEXT_WARM);
    for (const [label, delta] of [
      ['[+10]', 10],
      ['[+100]', 100],
      ['[reset]', 0],
    ] as const) {
      const x = 230 + (label === '[+10]' ? 0 : label === '[+100]' ? 50 : 110);
      add(x, ctrlY, label, PALETTE.neonTeal, () => {
        this.stagedBolts =
          delta === 0 ? 0 : Math.min(gameState.bolts, this.stagedBolts + delta);
        this.sendStage();
      });
    }
    add(420, ctrlY, '[clear items]', PALETTE.neonTeal, () => {
      this.staged.clear();
      this.sendStage();
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
      const y = ctrlY + 46 + Math.floor(shown / 4) * ROW_H;
      add(x, y, `${ITEMS[slot.itemId].name}×${left}`, PALETTE.warmGlow, () => {
        // Gear stages whole; stacks stage in tens (click again for more).
        const step = slot.durability !== undefined ? 1 : Math.min(10, left);
        this.staged.set(idx, Math.min(slot.qty, already + step));
        this.sendStage();
      });
      shown += 1;
    });

    // ── confirm / cancel ────────────────────────────────────────────────
    const btnY = PANEL_H - 30;
    if (sync.you.confirmed) {
      add(20, btnY, '[unconfirm]', PALETTE.neonRose, () => {
        if (session.room !== null) send.ptrade(session.room, { action: 'unconfirm', tradeId });
      });
    } else {
      add(20, btnY, '[confirm trade]', PALETTE.neonTeal, () => {
        if (session.room !== null) send.ptrade(session.room, { action: 'confirm', tradeId });
      });
    }
    add(PANEL_W - 110, btnY, '[cancel]', PALETTE.neonRose, () => {
      if (session.room !== null) send.ptrade(session.room, { action: 'cancel', tradeId });
    });
  }
}
