import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS, type ItemId } from '@shared/items';
import { PALETTE, PALETTE_INT, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { sound } from '../audio/sound';

const PANEL_W = 460;
const ROW_H = 26;

const RESOURCES = Object.keys(CONFIG.economy.merchant.buy) as Array<
  keyof typeof CONFIG.economy.merchant.buy
>;

/**
 * The Nightstalls merchant window: sell resources at the live band price
 * (floor/ceiling published — Economy Design transparency), buy basics.
 * All copy follows the comms rules: prices and trades, never "earn".
 */
export class MerchantPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private prices: Record<string, number> = {};
  private rows: Phaser.GameObjects.Text[] = [];
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1150);
    this.container.setVisible(false);

    session.events.on(SessionEvents.prices, (sync: { buy: Record<string, number> }) => {
      this.prices = sync.buy;
      if (this.visible) this.refresh();
    });
    session.events.on(SessionEvents.openMerchant, () => this.setVisible(true));
  }

  pixelSize(): { w: number; h: number } {
    const wares = CONFIG.economy.merchant.sells.length;
    return { w: PANEL_W, h: 120 + RESOURCES.length * ROW_H + 30 + wares * ROW_H };
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
    // Rebuild rows (small counts; simple beats clever here).
    for (const r of this.rows) r.destroy();
    this.rows = [];
    this.container.removeAll(true);

    const g = this.scene.add.graphics();
    const { w, h } = this.pixelSize();
    g.fillStyle(PALETTE_INT.ink, 0.94);
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
        t.on('pointerdown', (_p: unknown, _lx: unknown, _ly: unknown, ev: { stopPropagation(): void }) => {
          ev.stopPropagation();
          onClick();
        });
        t.on('pointerover', () => t.setColor(PALETTE.neonAmber));
        t.on('pointerout', () => t.setColor(color));
      }
      this.container.add(t);
      this.rows.push(t);
      return t;
    };

    add(16, 12, 'The Nightstalls — trading stand', PALETTE.neonAmber);
    add(w - 90, 12, '[close]', UI_TEXT_WARM, () => this.setVisible(false));
    add(16, 34, `Bolts: ${gameState.bolts}`, PALETTE.warmGlow);
    add(16, 56, 'SELL — prices move inside each published band', PALETTE.neonTeal);

    RESOURCES.forEach((res, i) => {
      const y = 78 + i * ROW_H;
      const band = CONFIG.economy.merchant.buy[res];
      const unit = this.prices[res] ?? band.ceiling;
      const have = gameState.count(res as ItemId);
      add(16, y, `${ITEMS[res as ItemId].name}`, UI_TEXT_WARM);
      add(140, y, `${unit} B (band ${band.floor}–${band.ceiling})`, PALETTE.warmGlow);
      add(300, y, `have ${have}`, UI_TEXT_WARM);
      if (have > 0 && session.room !== null) {
        add(378, y, '[10]', PALETTE.neonTeal, () => {
          if (session.room !== null) {
            send.trade(session.room, { action: 'sellResource', itemId: res, qty: 10 });
            sound.kaching();
          }
        });
        add(414, y, '[all]', PALETTE.neonTeal, () => {
          if (session.room !== null) {
            send.trade(session.room, { action: 'sellResource', itemId: res, qty: have });
            sound.kaching();
          }
        });
      }
    });

    const buyY = 78 + RESOURCES.length * ROW_H + 10;
    add(16, buyY, 'BUY — stand wares, fixed prices', PALETTE.neonTeal);
    CONFIG.economy.merchant.sells.forEach((ware, i) => {
      const y = buyY + 22 + i * ROW_H;
      add(16, y, ITEMS[ware.itemId as ItemId].name, UI_TEXT_WARM);
      add(220, y, `${ware.price} Bolts`, PALETTE.warmGlow);
      add(340, y, '[buy]', PALETTE.neonTeal, () => {
        if (session.room !== null) {
          send.trade(session.room, { action: 'buyItem', itemId: ware.itemId });
          sound.kaching();
        }
      });
    });
  }
}
