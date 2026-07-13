import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS } from '@shared/items';
import { itemIsTradeable } from '@shared/trade';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import type { ShopSyncEvent } from '@shared/protocol';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { HEADER_H, kitButton, kitHeader, kitPlate, kitText, SPACE } from './kit';

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
    return { w: PANEL_W, h: 430 };
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

    this.container.add(kitPlate(this.scene, w, h));

    const txt = (x: number, y: number, text: string, color = UI_TEXT_WARM): Phaser.GameObjects.Text => {
      const t = kitText(this.scene, x, y, text, 'body', { color });
      this.container.add(t);
      this.rows.push(t);
      return t;
    };
    const btn = (
      x: number,
      y: number,
      label: string,
      opts: { width?: number; primary?: boolean; onClick: () => void },
    ): void => {
      const b = kitButton(this.scene, x, y, label, {
        width: opts.width,
        height: 22,
        primary: opts.primary,
        onClick: opts.onClick,
      });
      this.container.add(b);
      this.rows.push(b);
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
    kitHeader(this.scene, this.container, w, title, () => this.setVisible(false));
    txt(SPACE.md, HEADER_H + SPACE.sm, `Bolts ⚙ ${gameState.bolts}`, PALETTE.warmGlow);

    // ── vacant: rent it ─────────────────────────────────────────────────
    if (sync.ownerName === '') {
      const rent = CONFIG.economy.shops.rentBoltsPerWeek;
      txt(SPACE.md, 80, `A week on the lane: ${rent} Bolts (rent keeps no change).`, UI_TEXT_WARM);
      btn(SPACE.md, 110, 'rent this stall', {
        primary: true,
        onClick: () => intent({ action: 'rent', stallId: sync.stallId }),
      });
      return;
    }

    // ── goods list (browse or own) ──────────────────────────────────────
    txt(SPACE.md, 68, sync.mine ? 'ON YOUR COUNTER' : 'ON THE COUNTER', PALETTE.neonTeal);
    sync.stock.forEach((line, i) => {
      const y = 90 + i * ROW_H;
      const wear = line.durability !== undefined ? ` (wear ${line.durability})` : '';
      txt(SPACE.md, y, `${ITEMS[line.itemId].name} × ${line.qty}${wear}`, UI_TEXT_WARM);
      txt(250, y, `${line.priceBolts} B each`, PALETTE.warmGlow);
      if (sync.mine) {
        btn(350, y, '-', {
          width: 26,
          onClick: () =>
            intent({
              action: 'setPrice',
              stallId: sync.stallId,
              lineIdx: i,
              priceBolts: Math.max(CONFIG.economy.shops.minPriceBolts, line.priceBolts - 1),
            }),
        });
        btn(378, y, '+', {
          width: 26,
          onClick: () =>
            intent({
              action: 'setPrice',
              stallId: sync.stallId,
              lineIdx: i,
              priceBolts: line.priceBolts + 1,
            }),
        });
        btn(410, y, 'take back', {
          width: 96,
          onClick: () => intent({ action: 'unstock', stallId: sync.stallId, lineIdx: i, qty: line.qty }),
        });
      } else {
        btn(350, y, 'buy 1', {
          width: 64,
          primary: true,
          onClick: () => intent({ action: 'buy', stallId: sync.stallId, lineIdx: i, qty: 1 }),
        });
        if (line.qty > 1 && line.durability === undefined) {
          btn(420, y, 'buy 10', {
            width: 64,
            onClick: () => intent({ action: 'buy', stallId: sync.stallId, lineIdx: i, qty: 10 }),
          });
        }
      }
    });
    if (sync.stock.length === 0) {
      txt(SPACE.md, 90, sync.mine ? 'Nothing out yet — stock from your Pack below.' : 'Bare shelves today.', UI_TEXT_WARM);
    }

    if (!sync.mine) return;

    // ── owner tools ─────────────────────────────────────────────────────
    const oy = 90 + Math.max(1, sync.stock.length) * ROW_H + 14;
    const due = sync.rentPaidUntilMs;
    const daysLeft = due === null ? 0 : Math.max(0, (due - Date.now()) / 86_400_000);
    txt(SPACE.md, oy, `Rent paid ${daysLeft.toFixed(1)} days ahead`, UI_TEXT_WARM);
    btn(250, oy, `renew +1 week: ${CONFIG.economy.shops.rentBoltsPerWeek} B`, {
      onClick: () => intent({ action: 'renew', stallId: sync.stallId }),
    });
    txt(SPACE.md, oy + 24, `Cashbox: ${sync.cashboxBolts} Bolts`, PALETTE.warmGlow);
    if (sync.cashboxBolts > 0) {
      btn(250, oy + 24, 'collect', {
        primary: true,
        onClick: () => intent({ action: 'collect', stallId: sync.stallId }),
      });
    }

    // Stock from the pack at the stepper's asking price.
    const sy = oy + 54;
    txt(SPACE.md, sy, `asking price: ${this.askPrice} B`, UI_TEXT_WARM);
    btn(180, sy, '-1', {
      width: 34,
      onClick: () => {
        this.askPrice = Math.max(CONFIG.economy.shops.minPriceBolts, this.askPrice - 1);
        this.refresh();
      },
    });
    btn(220, sy, '+1', {
      width: 34,
      onClick: () => {
        this.askPrice += 1;
        this.refresh();
      },
    });
    btn(264, sy, '+10', {
      width: 40,
      onClick: () => {
        this.askPrice += 10;
        this.refresh();
      },
    });
    txt(SPACE.md, sy + 22, 'stock from your Pack (click):', UI_TEXT_WARM);
    let shown = 0;
    gameState.inventory.slots.forEach((slot, idx) => {
      if (slot === null || shown >= 8) return;
      if (!itemIsTradeable(slot.itemId)) return;
      const x = SPACE.md + (shown % 4) * 124;
      const y = sy + 44 + Math.floor(shown / 4) * ROW_H;
      btn(x, y, `${ITEMS[slot.itemId].name}×${slot.qty}`, {
        width: 116,
        onClick: () =>
          intent({
            action: 'stock',
            stallId: sync.stallId,
            slot: idx,
            qty: slot.durability === undefined ? Math.min(10, slot.qty) : 1,
            priceBolts: this.askPrice,
          }),
      });
      shown += 1;
    });
  }
}
