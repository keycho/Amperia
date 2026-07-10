import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { itemIsTradeable } from '@shared/trade';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import type { ShopSyncEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';

const PANEL_W = 520;
const ROW_H = 24;

/**
 * A player shop stall's window (E2): vacant → rent pitch; someone else's →
 * browse the goods and buy; yours → stock, price, take back, collect the
 * cashbox. Renders the last shopSync; every action is a server intent.
 */
export class ShopPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private sync: ShopSyncEvent | null = null;
  /** Asking price for the next stocked line (owner view stepper). */
  private askPrice = 5;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1180);
    this.container.setVisible(false);
    session.events.on(SessionEvents.shopSync, (ev: ShopSyncEvent) => {
      this.sync = ev;
      this.setVisible(true);
    });
  }

  pixelSize(): { w: number; h: number } {
    return { w: PANEL_W, h: 420 };
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
    for (const r of this.rows) r.destroy();
    this.rows = [];
    this.container.removeAll(true);
    const sync = this.sync;
    if (sync === null) return;
    const { w, h } = this.pixelSize();

    const g = this.scene.add.graphics();
    g.fillStyle(PALETTE_INT.ink, 0.95);
    g.fillRoundedRect(0, 0, w, h, 10);
    g.lineStyle(2, PALETTE_INT.warmGlow, 0.6);
    g.strokeRoundedRect(0, 0, w, h, 10);
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
      this.rows.push(t);
      return t;
    };
    const intent = (msg: Parameters<typeof send.shop>[1]) => {
      if (session.room !== null) send.shop(session.room, msg);
    };

    const title =
      sync.ownerName === ''
        ? `Stall ${sync.stallId + 1} — vacant pitch`
        : sync.mine
          ? `Your stall (No. ${sync.stallId + 1})`
          : `${sync.ownerName}'s stall`;
    add(16, 12, title, PALETTE.neonAmber);
    add(w - 90, 12, '[close]', UI_TEXT_WARM, () => this.setVisible(false));
    add(16, 34, `Bolts ⚙ ${gameState.bolts}`, PALETTE.warmGlow);

    // ── vacant: rent it ─────────────────────────────────────────────────
    if (sync.ownerName === '') {
      const rent = CONFIG.economy.shops.rentBoltsPerWeek;
      add(16, 70, `A week on the lane: ${rent} Bolts (rent keeps no change).`, UI_TEXT_WARM);
      add(16, 100, '[rent this stall]', PALETTE.neonTeal, () =>
        intent({ action: 'rent', stallId: sync.stallId }),
      );
      return;
    }

    // ── goods list (browse or own) ──────────────────────────────────────
    add(16, 58, sync.mine ? 'ON YOUR COUNTER' : 'ON THE COUNTER', PALETTE.neonTeal);
    sync.stock.forEach((line, i) => {
      const y = 80 + i * ROW_H;
      const wear = line.durability !== undefined ? ` (wear ${line.durability})` : '';
      add(16, y, `${ITEMS[line.itemId].name} × ${line.qty}${wear}`, UI_TEXT_WARM);
      add(250, y, `${line.priceBolts} B each`, PALETTE.warmGlow);
      if (sync.mine) {
        add(350, y, '[-]', PALETTE.neonTeal, () =>
          intent({
            action: 'setPrice',
            stallId: sync.stallId,
            lineIdx: i,
            priceBolts: Math.max(CONFIG.economy.shops.minPriceBolts, line.priceBolts - 1),
          }),
        );
        add(378, y, '[+]', PALETTE.neonTeal, () =>
          intent({
            action: 'setPrice',
            stallId: sync.stallId,
            lineIdx: i,
            priceBolts: line.priceBolts + 1,
          }),
        );
        add(410, y, '[take back]', PALETTE.neonRose, () =>
          intent({ action: 'unstock', stallId: sync.stallId, lineIdx: i, qty: line.qty }),
        );
      } else {
        add(350, y, '[buy 1]', PALETTE.neonTeal, () =>
          intent({ action: 'buy', stallId: sync.stallId, lineIdx: i, qty: 1 }),
        );
        if (line.qty > 1 && line.durability === undefined) {
          add(420, y, '[buy 10]', PALETTE.neonTeal, () =>
            intent({ action: 'buy', stallId: sync.stallId, lineIdx: i, qty: 10 }),
          );
        }
      }
    });
    if (sync.stock.length === 0) {
      add(16, 80, sync.mine ? 'Nothing out yet — stock from your Pack below.' : 'Bare shelves today.', UI_TEXT_WARM);
    }

    if (!sync.mine) return;

    // ── owner tools ─────────────────────────────────────────────────────
    const oy = 80 + Math.max(1, sync.stock.length) * ROW_H + 14;
    const due = sync.rentPaidUntilMs;
    const daysLeft = due === null ? 0 : Math.max(0, (due - Date.now()) / 86_400_000);
    add(16, oy, `Rent paid ${daysLeft.toFixed(1)} days ahead`, UI_TEXT_WARM);
    add(250, oy, `[renew +1 week: ${CONFIG.economy.shops.rentBoltsPerWeek} B]`, PALETTE.neonTeal, () =>
      intent({ action: 'renew', stallId: sync.stallId }),
    );
    add(16, oy + 24, `Cashbox: ${sync.cashboxBolts} Bolts`, PALETTE.warmGlow);
    if (sync.cashboxBolts > 0) {
      add(250, oy + 24, '[collect]', PALETTE.neonTeal, () =>
        intent({ action: 'collect', stallId: sync.stallId }),
      );
    }

    // Stock from the pack at the stepper's asking price.
    const sy = oy + 54;
    add(16, sy, `asking price: ${this.askPrice} B`, UI_TEXT_WARM);
    add(180, sy, '[-1]', PALETTE.neonTeal, () => {
      this.askPrice = Math.max(CONFIG.economy.shops.minPriceBolts, this.askPrice - 1);
      this.refresh();
    });
    add(220, sy, '[+1]', PALETTE.neonTeal, () => {
      this.askPrice += 1;
      this.refresh();
    });
    add(264, sy, '[+10]', PALETTE.neonTeal, () => {
      this.askPrice += 10;
      this.refresh();
    });
    add(16, sy + 22, 'stock from your Pack (click):', UI_TEXT_WARM);
    let shown = 0;
    gameState.inventory.slots.forEach((slot, idx) => {
      if (slot === null || shown >= 8) return;
      if (!itemIsTradeable(slot.itemId)) return;
      const x = 16 + (shown % 4) * 124;
      const y = sy + 44 + Math.floor(shown / 4) * ROW_H;
      add(x, y, `${ITEMS[slot.itemId].name}×${slot.qty}`, PALETTE.warmGlow, () =>
        intent({
          action: 'stock',
          stallId: sync.stallId,
          slot: idx,
          qty: slot.durability === undefined ? Math.min(10, slot.qty) : 1,
          priceBolts: this.askPrice,
        }),
      );
      shown += 1;
    });
  }
}
