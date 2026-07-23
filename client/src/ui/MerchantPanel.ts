import Phaser from 'phaser';
import { CONFIG } from '@shared/config';
import { ITEMS, type ItemId } from '@shared/items';
import { PALETTE, UI_TEXT_WARM } from '@shared/palette';
import { send } from '../net/NetClient';
import { session, SessionEvents } from '../net/session';
import { gameState } from '../state/GameState';
import { sound } from '../audio/sound';
import { HEADER_H, kitButton, kitHeader, kitPlate, kitText, SPACE, kitPanelPop } from './kit';

const PANEL_W = 468;
const ROW_H = 28;

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

  /** Shared layout offsets so pixelSize() and refresh() never disagree. */
  private layout(): { resStart: number; buyHdr: number; h: number } {
    const wares = CONFIG.economy.merchant.sells.length;
    const resStart = HEADER_H + SPACE.sm + 22 + 22; // header + Bolts + SELL heading
    const buyHdr = resStart + RESOURCES.length * ROW_H + SPACE.md;
    const h = buyHdr + 22 + wares * ROW_H + SPACE.md;
    return { resStart, buyHdr, h };
  }

  pixelSize(): { w: number; h: number } {
    return { w: PANEL_W, h: this.layout().h };
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

  refresh(): void {
    for (const r of this.rows) r.destroy();
    this.rows = [];
    this.container.removeAll(true);

    const { resStart, buyHdr, h } = this.layout();
    this.container.add(kitPlate(this.scene, PANEL_W, h));
    kitHeader(this.scene, this.container, PANEL_W, 'The Nightstalls — trading stand', () =>
      this.setVisible(false),
    );

    const label = (
      x: number,
      y: number,
      str: string,
      level: 'body' | 'caption',
      color: string,
    ): Phaser.GameObjects.Text => {
      const t = kitText(this.scene, x, y, str, level, { color });
      this.container.add(t);
      this.rows.push(t);
      return t;
    };

    label(SPACE.md, HEADER_H + SPACE.sm, `Bolts ⚙ ${gameState.bolts}`, 'body', PALETTE.warmGlow);
    label(
      SPACE.md,
      HEADER_H + SPACE.sm + 22,
      'SELL — prices move inside each published band',
      'caption',
      PALETTE.neonTeal,
    );

    RESOURCES.forEach((res, i) => {
      const y = resStart + i * ROW_H;
      const band = CONFIG.economy.merchant.buy[res];
      const unit = this.prices[res] ?? band.ceiling;
      const have = gameState.count(res as ItemId);
      label(SPACE.md, y + 5, ITEMS[res as ItemId].name, 'body', UI_TEXT_WARM);
      label(150, y + 5, `${unit} B  ·  band ${band.floor}–${band.ceiling}`, 'body', PALETTE.warmGlow);
      label(310, y + 6, `have ${have}`, 'caption', UI_TEXT_WARM);
      if (have > 0 && session.room !== null) {
        this.container.add(
          kitButton(this.scene, 372, y, '10', {
            width: 40,
            height: 22,
            onClick: () => {
              if (session.room !== null) {
                send.trade(session.room, { action: 'sellResource', itemId: res, qty: 10 });
                sound.kaching();
              }
            },
          }),
        );
        this.container.add(
          kitButton(this.scene, 418, y, 'all', {
            width: 40,
            height: 22,
            primary: true,
            onClick: () => {
              if (session.room !== null) {
                send.trade(session.room, { action: 'sellResource', itemId: res, qty: have });
                sound.kaching();
              }
            },
          }),
        );
      }
    });

    label(SPACE.md, buyHdr, 'BUY — stand wares, fixed prices', 'caption', PALETTE.neonTeal);
    CONFIG.economy.merchant.sells.forEach((ware, i) => {
      const y = buyHdr + 22 + i * ROW_H;
      label(SPACE.md, y + 5, ITEMS[ware.itemId as ItemId].name, 'body', UI_TEXT_WARM);
      label(230, y + 5, `${ware.price} Bolts`, 'body', PALETTE.warmGlow);
      this.container.add(
        kitButton(this.scene, 372, y, 'buy', {
          width: 56,
          height: 22,
          primary: true,
          onClick: () => {
            if (session.room !== null) {
              send.trade(session.room, { action: 'buyItem', itemId: ware.itemId });
              sound.kaching();
            }
          },
        }),
      );
    });
  }
}
